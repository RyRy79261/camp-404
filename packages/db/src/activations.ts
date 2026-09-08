import { and, asc, eq } from "drizzle-orm";
import { createHttpDb, createPooledDb, type PooledDatabase } from "./index";
import * as schema from "./schema";
import { computeAudience, type BroadcastScope } from "./audience";
import { meetsRequiredVersion } from "./versions";
import type { QuestionnaireResponses } from "@camp404/types";

// The required_actions gating producer + satisfaction. A questionnaire
// activation fans out one required_actions row per matched member (the generic
// "what blocks this user" mechanism); a bespoke feature satisfies its row by
// flipping status to completed when it writes its own domain table.

// questionnaire scope subset the producer supports today. `opt_in` is a pull
// model (members self-select) — deferred. `drivers` is broadcast-only.
// Exported because the cycle rollover previews the same fan-out and must agree
// with the producer on which scopes have an audience at all.
export const PUSH_SCOPES = new Set([
  "everyone",
  "team",
  "team_leads",
  "individual",
]);

export interface PendingRequiredAction {
  actionKey: string;
  type: (typeof schema.requiredActionTypeEnum.enumValues)[number];
  title: string;
  version: string | null;
  // The activation that created this row (set for questionnaire gates). Lets the
  // gate router send builder questionnaires to the generic runner.
  activationId: string | null;
  blocking: boolean;
  dueAt: Date | null;
  createdAt: Date;
}

export type OpenActivationResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * The transaction handle a pooled `db.transaction()` callback receives. Named
 * so the `…Tx` helpers can be composed into ONE transaction by a caller that
 * opens the pool itself (the cycle rollover closes an activation and opens its
 * replacement atomically — spec §8.3).
 */
export type PooledTx = Parameters<
  Parameters<PooledDatabase["db"]["transaction"]>[0]
>[0];

/** The activation fields the fan-out needs — a subset of the row. */
export interface ActivationFanOut {
  id: string;
  questionnaireKey: string;
  version: string;
  title: string;
  blocking: boolean;
  dueAt: Date | null;
  /** The copy FROZEN at Send. Never re-read the definition/config here. */
  carryOver: boolean;
}

/**
 * The carry-over fan-out filter (spec §7.3a): under `carry`, subtract every
 * recipient who already holds a `completed` gate for this key at a version that
 * satisfies the one being sent.
 *
 * `required_actions` is the satisfaction oracle for BOTH questionnaire classes
 * — builder questionnaires write `questionnaire_responses`, code questionnaires
 * write bespoke domain tables, but every one of them flips a `required_actions`
 * row to `completed` — so this filter is storage-agnostic.
 *
 * Two rules keep it honest:
 *   - A member with NO completed prior row is still gated. Carry-over means
 *     "don't re-ask someone who already answered", never "let everyone
 *     through".
 *   - The completion must satisfy `act.version`, so a BREAKING edit (which
 *     mints a new version) re-gates everyone even under `carry`, while a
 *     cosmetic re-send does not. A completion with NO recorded version cannot
 *     be shown to satisfy anything, so it gates too — the filter only ever
 *     narrows the audience, never widens the gate.
 */
async function subtractCarriedOver(
  tx: PooledTx,
  act: ActivationFanOut,
  recipientIds: string[],
): Promise<string[]> {
  const prior = await tx
    .select({
      userId: schema.requiredActions.userId,
      version: schema.requiredActions.version,
    })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.actionKey, act.questionnaireKey),
        eq(schema.requiredActions.status, "completed"),
      ),
    );
  const satisfied = new Set(
    prior
      .filter((r) => r.version && meetsRequiredVersion(act.version, r.version))
      .map((r) => r.userId),
  );
  return recipientIds.filter((id) => !satisfied.has(id));
}

/**
 * The body of {@link openActivation}, inside a caller-supplied transaction:
 * flip the activation open, apply the carry-over filter, and upsert the gates.
 * Returns the number of gates written. Extracted so the cycle rollover can run
 * close + re-open in ONE transaction instead of a pool per step (spec §8.3).
 */
export async function openActivationTx(
  tx: PooledTx,
  act: ActivationFanOut,
  recipientIds: string[],
): Promise<number> {
  await tx
    .update(schema.questionnaireActivations)
    .set({ status: "open", openedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.questionnaireActivations.id, act.id));

  if (recipientIds.length === 0) return 0;

  // Between the audience and the insert — see subtractCarriedOver.
  const targets = act.carryOver
    ? await subtractCarriedOver(tx, act, recipientIds)
    : recipientIds;
  if (targets.length === 0) return 0;

  await tx
    .insert(schema.requiredActions)
    .values(
      targets.map((userId) => ({
        userId,
        type: "questionnaire" as const,
        actionKey: act.questionnaireKey,
        version: act.version,
        activationId: act.id,
        title: act.title,
        blocking: act.blocking,
        dueAt: act.dueAt,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.requiredActions.userId, schema.requiredActions.actionKey],
      set: {
        version: act.version,
        activationId: act.id,
        title: act.title,
        blocking: act.blocking,
        dueAt: act.dueAt,
        status: "pending",
        completedAt: null,
      },
    });

  return targets.length;
}

/**
 * Open a questionnaire activation: mark it open and fan out one
 * `required_actions` row per matched member. Idempotent / re-activation-safe
 * via the `(user_id, action_key)` unique index — a re-open re-points the row
 * to this activation/version and re-sets it to pending. A `carry` activation
 * skips members who already answered at a satisfying version (§7.3a).
 */
export async function openActivation(
  activationId: string,
): Promise<OpenActivationResult> {
  const httpDb = createHttpDb();
  const [act] = await httpDb
    .select()
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, activationId))
    .limit(1);
  if (!act) return { ok: false, error: "Activation not found." };
  if (act.scope === "opt_in") {
    // TODO(opt_in): pull model — members self-select; no upfront fan-out.
    return { ok: false, error: "opt_in activations are not yet supported." };
  }
  if (!PUSH_SCOPES.has(act.scope)) {
    return { ok: false, error: `Unsupported activation scope: ${act.scope}.` };
  }

  const [members, memberships, targets] = await Promise.all([
    httpDb
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
      })
      .from(schema.users),
    // Team membership is year-scoped, so "who is on the kitchen team" has to be
    // asked of a particular year — and the year that governs a send is the one
    // FROZEN on the activation, never the live config. A rollover landing
    // between draft and open therefore cannot move this send's audience.
    httpDb
      .select({
        userId: schema.teamMemberships.userId,
        team: schema.teamMemberships.team,
        isLead: schema.teamMemberships.isLead,
      })
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.cycle, act.cycle)),
    httpDb
      .select({ userId: schema.questionnaireActivationTargets.userId })
      .from(schema.questionnaireActivationTargets)
      .where(eq(schema.questionnaireActivationTargets.activationId, act.id)),
  ]);

  // Questionnaire scope never targets drivers; pass [] for that axis. No sender
  // to exclude for an activation.
  const recipientIds = computeAudience(
    { scope: act.scope as BroadcastScope, team: act.team },
    {
      members,
      memberships,
      driverUserIds: [],
      targetUserIds: targets.map((t) => t.userId),
    },
    null,
  );

  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => ({
      ok: true as const,
      created: await openActivationTx(tx, act, recipientIds),
    }));
  } finally {
    await pool.end();
  }
}

/**
 * Seed (idempotently) a single required_actions row for one user — e.g. the
 * mandatory burner-profile obligation stamped at signup. No-op if a row for
 * this `(user, actionKey)` already exists.
 */
export async function ensureRequiredAction(input: {
  userId: string;
  type: PendingRequiredAction["type"];
  actionKey: string;
  title: string;
  version?: string | null;
  blocking?: boolean;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .insert(schema.requiredActions)
    .values({
      userId: input.userId,
      type: input.type,
      actionKey: input.actionKey,
      title: input.title,
      version: input.version ?? null,
      blocking: input.blocking ?? true,
    })
    .onConflictDoNothing({
      target: [schema.requiredActions.userId, schema.requiredActions.actionKey],
    });
}

/**
 * Flip a user's pending required action to completed. Version-aware: a
 * completion recorded against a version older than the one required leaves the
 * gate open (per the schema's re-open rule). Returns whether a row changed.
 */
export async function satisfyRequiredAction(
  userId: string,
  actionKey: string,
  completedVersion?: string | null,
): Promise<boolean> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      id: schema.requiredActions.id,
      version: schema.requiredActions.version,
      status: schema.requiredActions.status,
    })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.actionKey, actionKey),
      ),
    )
    .limit(1);
  if (!row || row.status !== "pending") return false;
  if (
    row.version &&
    completedVersion &&
    !meetsRequiredVersion(row.version, completedVersion)
  ) {
    return false; // completion against an older version — leave the gate open
  }
  await db
    .update(schema.requiredActions)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(schema.requiredActions.id, row.id));
  return true;
}

/** A user's pending, blocking required actions, oldest first (gate order). */
export async function getPendingRequiredActions(
  userId: string,
): Promise<PendingRequiredAction[]> {
  const db = createHttpDb();
  return db
    .select({
      actionKey: schema.requiredActions.actionKey,
      type: schema.requiredActions.type,
      title: schema.requiredActions.title,
      version: schema.requiredActions.version,
      activationId: schema.requiredActions.activationId,
      blocking: schema.requiredActions.blocking,
      dueAt: schema.requiredActions.dueAt,
      createdAt: schema.requiredActions.createdAt,
    })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.status, "pending"),
        eq(schema.requiredActions.blocking, true),
      ),
    )
    .orderBy(asc(schema.requiredActions.createdAt));
}

export interface ActivationRow {
  id: string;
  questionnaireKey: string;
  version: string;
  title: string;
  status: (typeof schema.activationStatusEnum.enumValues)[number];
  blocking: boolean;
  /**
   * The year namespace and carry-over policy FROZEN at Send. Every downstream
   * read (prefill, write, gate) uses these, never the live config or the
   * definition column — a captain rolling the year over or flipping the toggle
   * mid-collection must not change the rules under a member mid-form.
   */
  cycle: number;
  carryOver: boolean;
}

/** Read a single activation by id, or null. The generic runner loads by id. */
export async function getActivationById(
  id: string,
): Promise<ActivationRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      id: schema.questionnaireActivations.id,
      questionnaireKey: schema.questionnaireActivations.questionnaireKey,
      version: schema.questionnaireActivations.version,
      title: schema.questionnaireActivations.title,
      status: schema.questionnaireActivations.status,
      blocking: schema.questionnaireActivations.blocking,
      cycle: schema.questionnaireActivations.cycle,
      carryOver: schema.questionnaireActivations.carryOver,
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, id))
    .limit(1);
  return row ?? null;
}

export interface RequiredActionState {
  status: (typeof schema.requiredActionStatusEnum.enumValues)[number];
  version: string | null;
  activationId: string | null;
}

/**
 * The viewer's required_actions row for one questionnaire key, or null when
 * they were never targeted — the runner's access predicate (no row ⇒ the
 * questionnaire was not sent to this user).
 */
export async function getRequiredAction(
  userId: string,
  actionKey: string,
): Promise<RequiredActionState | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      status: schema.requiredActions.status,
      version: schema.requiredActions.version,
      activationId: schema.requiredActions.activationId,
    })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.actionKey, actionKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Atomically record a builder questionnaire's FINAL submission: upsert the
 * latest-answer row for THIS CYCLE (completedAt set) AND satisfy the
 * required-action gate in a single transaction, so a completed response can
 * never coexist with a still-pending gate. Honours satisfyRequiredAction's
 * version rule (a completion against an older version leaves the gate open).
 */
export async function completeBuilderResponse(input: {
  userId: string;
  definitionKey: string;
  definitionVersion: string;
  /** `activation.cycle` — the frozen year namespace, never the live config. */
  cycle: number;
  responses: QuestionnaireResponses;
  activationId: string;
}): Promise<void> {
  const { db, pool } = createPooledDb();
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.questionnaireResponses)
        .values({
          userId: input.userId,
          definitionKey: input.definitionKey,
          definitionVersion: input.definitionVersion,
          cycle: input.cycle,
          responses: input.responses,
          activationId: input.activationId,
          completedAt: now,
        })
        .onConflictDoUpdate({
          // Reads may fall back to an earlier cycle; writes never do — a carry
          // member who reaffirms an answer in year N gets a year-N row, and
          // year N-1's row is left intact.
          target: [
            schema.questionnaireResponses.userId,
            schema.questionnaireResponses.definitionKey,
            schema.questionnaireResponses.cycle,
          ],
          set: {
            definitionVersion: input.definitionVersion,
            responses: input.responses,
            activationId: input.activationId,
            completedAt: now,
            updatedAt: now,
          },
        });
      const [ra] = await tx
        .select({
          id: schema.requiredActions.id,
          version: schema.requiredActions.version,
          status: schema.requiredActions.status,
        })
        .from(schema.requiredActions)
        .where(
          and(
            eq(schema.requiredActions.userId, input.userId),
            eq(schema.requiredActions.actionKey, input.definitionKey),
          ),
        )
        .limit(1);
      if (
        ra &&
        ra.status === "pending" &&
        (!ra.version ||
          meetsRequiredVersion(ra.version, input.definitionVersion))
      ) {
        await tx
          .update(schema.requiredActions)
          .set({ status: "completed", completedAt: now })
          .where(eq(schema.requiredActions.id, ra.id));
      }
    });
  } finally {
    await pool.end();
  }
}
