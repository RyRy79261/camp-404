import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import type { QuestionnaireResponses } from "@camp404/types";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// The captain-facing READ side of a builder questionnaire: who was asked, who
// answered, and what they said. Writes live in questionnaire-responses.ts /
// activations.ts; this module only selects. See docs/questionnaire-builder.md
// §7 for what /metrics and /responses each show.
//
// THE FILTER IS (definitionKey, cycle) — NEVER activationId.
// `questionnaire_responses.activationId` is `on delete set null`, and there is
// exactly one latest-answer row per `(user, definitionKey, cycle)`. A re-send
// re-points that row's activationId at the NEW activation the moment the member
// answers again — and a closed send that is superseded leaves rows pointing at
// an activation that may later be deleted. Filtering results by activation
// therefore blanks an earlier send's results as soon as the questionnaire is
// re-sent. The definition key plus the year is the stable identity of "these
// answers", so that is what every read here filters on.
//
// The one thing that is legitimately per-ACTIVATION is REACH: `required_actions`
// is unique on `(user, actionKey)`, so a re-send overwrites the previous send's
// gate rows in place. Prior reach is not reconstructable (§7.1) — the gate
// columns below are returned with the activation that owns them so the caller
// can restrict any "sent / outstanding" tally to the send it is looking at, and
// say so where it cannot.

export type RequiredActionStatus =
  (typeof schema.requiredActionStatusEnum.enumValues)[number];

export type ActivationStatus =
  (typeof schema.activationStatusEnum.enumValues)[number];

/**
 * One member on a questionnaire's results surface: their identity, the gate
 * they hold for this questionnaire (if any), and the answers they stored in the
 * cycle asked for (if any).
 *
 * A row appears when EITHER side exists — a member who answered but whose gate
 * was overwritten by a later send still shows their answers, and a member who
 * was sent the form but never opened it still shows as outstanding.
 */
export interface ActivationResponseRow {
  userId: string;
  displayName: string | null;
  profileImageUrl: string | null;

  /**
   * The member's `required_actions` row for this key — the LATEST send's gate,
   * whatever cycle that send belongs to, because the table keeps one row per
   * `(user, actionKey)`. Null when they were never targeted at all. Read it
   * together with `gateActivationId`: a gate belonging to another activation
   * says nothing about the send being viewed.
   */
  gateStatus: RequiredActionStatus | null;
  gateVersion: string | null;
  gateActivationId: string | null;
  gateDueAt: Date | null;

  /** The answers stored for THIS cycle, or null when they have none. */
  responses: QuestionnaireResponses | null;
  /** The definition version those answers were given under. */
  definitionVersion: string | null;
  /** Non-null only for a FINISHED response (a page-advance save leaves it null). */
  completedAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Every member who was sent this questionnaire or answered it in `cycle`, with
 * their answers for that cycle.
 *
 * Joined from `users` so a member who answered and a member who only holds a
 * gate both come back in one pass with a display name. Sorted by name so the
 * caller renders a stable table without a second sort.
 */
export async function listActivationResponses(input: {
  definitionKey: string;
  cycle: number;
}): Promise<ActivationResponseRow[]> {
  const db = createHttpDb();
  return db
    .select({
      userId: schema.users.id,
      displayName: schema.users.displayName,
      profileImageUrl: schema.users.profileImageUrl,
      gateStatus: schema.requiredActions.status,
      gateVersion: schema.requiredActions.version,
      gateActivationId: schema.requiredActions.activationId,
      gateDueAt: schema.requiredActions.dueAt,
      responses: schema.questionnaireResponses.responses,
      definitionVersion: schema.questionnaireResponses.definitionVersion,
      completedAt: schema.questionnaireResponses.completedAt,
      updatedAt: schema.questionnaireResponses.updatedAt,
    })
    .from(schema.users)
    .leftJoin(
      schema.requiredActions,
      and(
        eq(schema.requiredActions.userId, schema.users.id),
        eq(schema.requiredActions.actionKey, input.definitionKey),
      ),
    )
    .leftJoin(
      schema.questionnaireResponses,
      and(
        eq(schema.questionnaireResponses.userId, schema.users.id),
        eq(schema.questionnaireResponses.definitionKey, input.definitionKey),
        // The year namespace. Without this an answer from a previous burn
        // would be counted into this one's histogram.
        eq(schema.questionnaireResponses.cycle, input.cycle),
      ),
    )
    .where(
      or(
        isNotNull(schema.requiredActions.id),
        isNotNull(schema.questionnaireResponses.id),
      ),
    )
    .orderBy(asc(schema.users.displayName), asc(schema.users.id));
}

/** One send of a questionnaire, as the results surfaces need to describe it. */
export interface ResultsActivationRow {
  id: string;
  version: string;
  title: string;
  status: ActivationStatus;
  cycle: number;
  dueAt: Date | null;
  openedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
}

/**
 * Every send of this questionnaire in one cycle, newest first.
 *
 * A cycle can hold several: the one-open invariant caps CONCURRENT sends at
 * one, but a captain may close a send and open another in the same year. The
 * caller shows the open one where there is one, and uses the rest to tell "not
 * sent this year" from "closed before anyone answered".
 */
export async function listActivationsForCycle(
  definitionKey: string,
  cycle: number,
): Promise<ResultsActivationRow[]> {
  const db = createHttpDb();
  return (
    db
      .select({
        id: schema.questionnaireActivations.id,
        version: schema.questionnaireActivations.version,
        title: schema.questionnaireActivations.title,
        status: schema.questionnaireActivations.status,
        cycle: schema.questionnaireActivations.cycle,
        dueAt: schema.questionnaireActivations.dueAt,
        openedAt: schema.questionnaireActivations.openedAt,
        closedAt: schema.questionnaireActivations.closedAt,
        createdAt: schema.questionnaireActivations.createdAt,
      })
      .from(schema.questionnaireActivations)
      .where(
        and(
          eq(schema.questionnaireActivations.questionnaireKey, definitionKey),
          eq(schema.questionnaireActivations.cycle, cycle),
        ),
      )
      // The id tiebreak keeps the order total: two sends inserted in the same
      // transaction share `now()`, and a caller that takes the first row must not
      // get a different one on the next read.
      .orderBy(
        desc(schema.questionnaireActivations.createdAt),
        desc(schema.questionnaireActivations.id),
      )
  );
}

/**
 * The cycles this questionnaire has anything to show for — any year it was sent
 * in, plus any year it holds answers for — newest first.
 *
 * Both halves matter: a year with a send and no answers is a real (empty)
 * result, and a year whose activation rows were pruned still has its answers.
 * The year namespace promises nothing is destroyed, so this is what keeps last
 * year's results reachable after the camp has rolled over.
 */
export async function listResultCycles(
  definitionKey: string,
): Promise<number[]> {
  const db = createHttpDb();
  const [answered, sent] = await Promise.all([
    db
      .selectDistinct({ cycle: schema.questionnaireResponses.cycle })
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.definitionKey, definitionKey)),
    db
      .selectDistinct({ cycle: schema.questionnaireActivations.cycle })
      .from(schema.questionnaireActivations)
      .where(
        eq(schema.questionnaireActivations.questionnaireKey, definitionKey),
      ),
  ]);
  const cycles = new Set<number>();
  for (const row of [...answered, ...sent]) cycles.add(row.cycle);
  return [...cycles].sort((a, b) => b - a);
}
