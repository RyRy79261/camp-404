import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createHttpDb, withTransaction, type PooledDatabase } from "./index";
import * as schema from "./schema";
import { computeAudience, type BroadcastScope } from "./audience";
import { currentCycle, resolveCycles, UNSET_CYCLE } from "./camp-config";
import { meetsRequiredVersion } from "./versions";
import { currentCycleNumber } from "./cycles";
import type { DbOrTx } from "./audit";
import { applyParticipationIntent } from "./participations";
import {
  safeParseStoredDefinition,
  type Questionnaire,
  type QuestionnaireResponses,
  type RoleMirror,
} from "@camp404/types";

// The required_actions gating producer + satisfaction. A questionnaire
// activation fans out one required_actions row per matched member (the generic
// "what blocks this user" mechanism); a bespoke feature satisfies its row by
// flipping status to completed when it writes its own domain table.

// The questionnaire scopes the producer fans out over: each matched member gets
// a required_actions row. `opt_in` (#313) is the pull model: it opens with NO
// gates, so it blocks nobody, sits on nobody's to-do list and is never
// reminded; it shows under Optional in every camp member's My forms instead
// (listOptionalQuestionnaires). `drivers` is broadcast-only.
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

const YEAR_MOVED_ERROR =
  "The camp moved to a new year while this was being sent. Send it again.";

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

  return await upsertGatesTx(tx, act, recipientIds);
}

/**
 * The gate half of {@link openActivationTx}: apply the carry-over filter, then
 * upsert one pending `required_actions` row per recipient, pointed at this
 * activation. Shared with {@link reconcileOpenActivations}, which gates ONE
 * member for a send that is already open and must not re-stamp `openedAt`.
 */
async function upsertGatesTx(
  tx: PooledTx,
  act: ActivationFanOut,
  recipientIds: string[],
): Promise<number> {
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
 * Who a push send gates: the members its scope matches, read for the send's
 * FROZEN year.
 */
async function pushRecipients(
  act: typeof schema.questionnaireActivations.$inferSelect,
): Promise<string[]> {
  const httpDb = createHttpDb();
  const [members, memberships, targets] = await Promise.all([
    httpDb
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users),
    // Team membership is year-scoped, so "who is on the kitchen team" has to be
    // asked of a particular year — and the year that governs a send is the one
    // FROZEN on the activation, never the live config. If a rollover lands
    // between draft and open, the transaction below refuses to open the send.
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
  return computeAudience(
    { scope: act.scope as BroadcastScope, team: act.team },
    {
      members,
      memberships,
      driverUserIds: [],
      targetUserIds: targets.map((t) => t.userId),
    },
    null,
  );
}

/**
 * Open a questionnaire activation: mark it open and fan out one
 * `required_actions` row per matched member. Idempotent / re-activation-safe
 * via the `(user_id, action_key)` unique index — a re-open re-points the row
 * to this activation/version and re-sets it to pending. A `carry` activation
 * skips members who already answered at a satisfying version (§7.3a). An
 * `opt_in` activation opens with no rows at all (#313).
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
  // An optional questionnaire asks nobody: it opens with no gates at all, under
  // the same year lock as any send.
  const optIn = act.scope === "opt_in";
  if (!optIn && !PUSH_SCOPES.has(act.scope)) {
    return { ok: false, error: `Unsupported activation scope: ${act.scope}.` };
  }

  const recipientIds = optIn ? [] : await pushRecipients(act);

  return await withTransaction(async (tx) => {
    // Serialise with the year. advanceCycle and setFoundingYear hold FOR UPDATE
    // on the camp_settings row while they move the camp to another year, so
    // this FOR SHARE waits for them to commit. Once it is held, the year cannot
    // move until this send has opened, and a rollover that starts now waits,
    // then re-reads its plan and finds this send open.
    //
    // The year stamped on the draft was read before any of this, so compare it
    // under the lock. A draft from the year the camp just left must not open:
    // the rollover's plan never saw it, and its gates would land under last
    // year's number. Re-read the row too, because setFoundingYear rewrites the
    // stamp on rows made before the camp had a year.
    const [settings] = await tx
      .select({ config: schema.campSettings.config })
      .from(schema.campSettings)
      .where(eq(schema.campSettings.id, true))
      .for("share");
    const [stamped] = await tx
      .select({ cycle: schema.questionnaireActivations.cycle })
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, act.id));
    const year =
      currentCycle(resolveCycles(settings?.config))?.year ?? UNSET_CYCLE;
    if (stamped?.cycle !== act.cycle || act.cycle !== year) {
      return { ok: false as const, error: YEAR_MOVED_ERROR };
    }
    return {
      ok: true as const,
      created: await openActivationTx(tx, act, recipientIds),
    };
  });
}

/**
 * Give ONE member the gates they would hold had they been in the audience when
 * each open send opened (year design §10). `openActivation` fans out only at
 * open time, so without this a member who joins the camp, joins a team, or is
 * picked for a send after it opened holds no gate: the runner shows "not
 * invited", nothing reminds them, and the results never count them.
 *
 * Called before the gate spine is read, so it runs on page loads. The steady
 * state is therefore one read when nothing open can reach the member, else
 * that read and four more sent together, and no writes:
 *   - A gate that already points at this send is left alone, whatever its
 *     status. The member was gated at open time, or here earlier, and may
 *     have answered since.
 *   - Under carry-over, a member whose completed gate satisfies the version is
 *     skipped here in memory, by the same rule as subtractCarriedOver.
 * Only a real miss opens a transaction. That transaction re-checks the send is
 * still open under FOR SHARE, so a concurrent close (which expires pending
 * gates in its own transaction) cannot leave a pending gate on a closed send.
 *
 * Returns the number of gates written.
 */
export async function reconcileOpenActivations(
  userId: string,
): Promise<number> {
  const db = createHttpDb();
  // The open sends first: with none this member could be pushed (the usual
  // state between sends), that one read is all a page pays. With some, the
  // member's own rows go out together, one wait more.
  const open = (
    await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.status, "open"))
  ).filter((act) => PUSH_SCOPES.has(act.scope));
  if (open.length === 0) return 0;

  const [meRows, memberships, targets, gates] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({
        userId: schema.teamMemberships.userId,
        team: schema.teamMemberships.team,
        isLead: schema.teamMemberships.isLead,
        cycle: schema.teamMemberships.cycle,
      })
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, userId)),
    db
      .select({
        activationId: schema.questionnaireActivationTargets.activationId,
      })
      .from(schema.questionnaireActivationTargets)
      .where(
        and(
          eq(schema.questionnaireActivationTargets.userId, userId),
          inArray(
            schema.questionnaireActivationTargets.activationId,
            open.map((act) => act.id),
          ),
        ),
      ),
    db
      .select({
        actionKey: schema.requiredActions.actionKey,
        activationId: schema.requiredActions.activationId,
        status: schema.requiredActions.status,
        version: schema.requiredActions.version,
      })
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, userId),
          inArray(
            schema.requiredActions.actionKey,
            open.map((act) => act.questionnaireKey),
          ),
        ),
      ),
  ]);
  const [me] = meRows;
  if (!me) return 0;

  let written = 0;
  for (const act of open) {
    const audience = computeAudience(
      { scope: act.scope as BroadcastScope, team: act.team },
      {
        members: [me],
        // The send's own year decides the team, as in openActivation.
        memberships: memberships.filter((m) => m.cycle === act.cycle),
        driverUserIds: [],
        targetUserIds: targets.some((t) => t.activationId === act.id)
          ? [userId]
          : [],
      },
      null,
    );
    if (audience.length === 0) continue;

    const gate = gates.find((g) => g.actionKey === act.questionnaireKey);
    if (gate?.activationId === act.id) continue;
    if (
      act.carryOver &&
      gate?.status === "completed" &&
      gate.version &&
      meetsRequiredVersion(act.version, gate.version)
    ) {
      continue;
    }

    written += await withTransaction(async (tx) => {
      const [still] = await tx
        .select({ status: schema.questionnaireActivations.status })
        .from(schema.questionnaireActivations)
        .where(eq(schema.questionnaireActivations.id, act.id))
        .for("share");
      if (still?.status !== "open") return 0;
      return await upsertGatesTx(tx, act, [userId]);
    });
  }
  return written;
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
  db: DbOrTx = createHttpDb(),
): Promise<boolean> {
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

/**
 * Every questionnaire gate a member has, for the captain's member panel: all
 * pending ones, the code questionnaires (no send behind them), and this year's
 * sends. Earlier years' finished or closed sends are left out, so the list does
 * not grow every year. Oldest first, the order the member meets them.
 */
export async function listMemberQuestionnaireGates(userId: string): Promise<
  Array<{
    actionKey: string;
    title: string;
    status: (typeof schema.requiredActionStatusEnum.enumValues)[number];
    blocking: boolean;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>
> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  return db
    .select({
      actionKey: schema.requiredActions.actionKey,
      title: schema.requiredActions.title,
      status: schema.requiredActions.status,
      blocking: schema.requiredActions.blocking,
      dueAt: schema.requiredActions.dueAt,
      completedAt: schema.requiredActions.completedAt,
      createdAt: schema.requiredActions.createdAt,
    })
    .from(schema.requiredActions)
    .leftJoin(
      schema.questionnaireActivations,
      eq(
        schema.questionnaireActivations.id,
        schema.requiredActions.activationId,
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.type, "questionnaire"),
        or(
          eq(schema.requiredActions.status, "pending"),
          isNull(schema.requiredActions.activationId),
          eq(schema.questionnaireActivations.cycle, cycle),
        ),
      ),
    )
    .orderBy(
      asc(schema.requiredActions.createdAt),
      asc(schema.requiredActions.id),
    );
}

/** One questionnaire a member still has to answer, from a send that is open. */
export interface PendingQuestionnaire {
  activationId: string;
  title: string;
  /** Blocking holds the whole app; optional ones only wait in the inbox. */
  blocking: boolean;
  dueAt: Date | null;
  createdAt: Date;
}

/**
 * Every questionnaire this member still has to answer, blocking or not.
 * getPendingRequiredActions above is the gate spine and only sees BLOCKING
 * rows, so an optional send reached nobody: nothing listed it anywhere. This
 * is the reader for the "Needs your answer" section of the inbox, which stays
 * until the member finishes (owner's call, 2026-09-16: "shout until it's
 * done").
 *
 * Only gates on an OPEN send count. A closed send expires its pending gates,
 * but a pending gate whose activation was closed some other way must not
 * point the member at a form that refuses them. Blocking first, then the
 * nearest deadline, then the oldest.
 */
export async function listPendingQuestionnaires(
  userId: string,
): Promise<PendingQuestionnaire[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      activationId: schema.questionnaireActivations.id,
      title: schema.requiredActions.title,
      blocking: schema.requiredActions.blocking,
      dueAt: schema.requiredActions.dueAt,
      createdAt: schema.requiredActions.createdAt,
    })
    .from(schema.requiredActions)
    .innerJoin(
      schema.questionnaireActivations,
      eq(
        schema.requiredActions.activationId,
        schema.questionnaireActivations.id,
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.status, "pending"),
        eq(schema.requiredActions.type, "questionnaire"),
        eq(schema.questionnaireActivations.status, "open"),
      ),
    )
    .orderBy(
      desc(schema.requiredActions.blocking),
      sql`${schema.requiredActions.dueAt} asc nulls last`,
      asc(schema.requiredActions.createdAt),
    );
  return rows;
}

// --- Optional questionnaires (opt_in, #313) ---------------------------------
// Owner approved 2026-10-03: "Build the opt in questionnaire and label it
// optional". A captain puts a questionnaire in My forms for the whole camp and
// asks nobody. There are no required_actions rows behind it, so it blocks
// nobody, is on nobody's to-do list or "needs your answer" list, and no
// reminder can find it. Who may answer is the camp's `everyone` audience, read
// live: approved members who are not system or erased accounts. A member has
// answered when they hold a FINISHED response for the questionnaire in the
// send's year; answers are fixed once submitted, as for every builder send.

/** One open optional questionnaire a member has not answered yet. */
export interface OptionalQuestionnaire {
  activationId: string;
  questionnaireKey: string;
  title: string;
  /** The year the send is filed under (its frozen cycle). */
  cycle: number;
  openedAt: Date | null;
  /** True when the member saved part of it and has not submitted. */
  started: boolean;
  /** The version the send pinned, as the member will see it, or null. */
  questionnaire: Questionnaire | null;
}

/** Whether a member is one of the camp members an optional send is open to. */
function isOptInMember(
  user:
    | { isSystem: boolean; sanitised: boolean; approvalStatus: string }
    | undefined,
): boolean {
  return (
    !!user &&
    !user.isSystem &&
    !user.sanitised &&
    user.approvalStatus === "approved"
  );
}

/**
 * Every open optional questionnaire this member has not answered, newest
 * first: the Optional section of My forms. Empty for anyone who is not an
 * approved camp member. Two reads in the usual state (the open optional sends,
 * then the member and their answers together), one when nothing is open.
 */
export async function listOptionalQuestionnaires(
  userId: string,
): Promise<OptionalQuestionnaire[]> {
  const db = createHttpDb();
  const open = await db
    .select({
      activationId: schema.questionnaireActivations.id,
      questionnaireKey: schema.questionnaireActivations.questionnaireKey,
      title: schema.questionnaireActivations.title,
      cycle: schema.questionnaireActivations.cycle,
      openedAt: schema.questionnaireActivations.openedAt,
      definition: schema.questionnaireVersions.definition,
    })
    .from(schema.questionnaireActivations)
    .leftJoin(
      schema.questionnaireVersions,
      and(
        eq(
          schema.questionnaireVersions.definitionKey,
          schema.questionnaireActivations.questionnaireKey,
        ),
        eq(
          schema.questionnaireVersions.version,
          schema.questionnaireActivations.version,
        ),
      ),
    )
    .where(
      and(
        eq(schema.questionnaireActivations.status, "open"),
        eq(schema.questionnaireActivations.scope, "opt_in"),
      ),
    )
    .orderBy(
      sql`${schema.questionnaireActivations.openedAt} desc nulls last`,
      asc(schema.questionnaireActivations.title),
    );
  if (open.length === 0) return [];

  const [[me], answers] = await Promise.all([
    db
      .select({
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({
        definitionKey: schema.questionnaireResponses.definitionKey,
        cycle: schema.questionnaireResponses.cycle,
        completedAt: schema.questionnaireResponses.completedAt,
      })
      .from(schema.questionnaireResponses)
      .where(
        and(
          eq(schema.questionnaireResponses.userId, userId),
          inArray(
            schema.questionnaireResponses.definitionKey,
            open.map((o) => o.questionnaireKey),
          ),
        ),
      ),
  ]);
  if (!isOptInMember(me)) return [];

  const out: OptionalQuestionnaire[] = [];
  for (const act of open) {
    const mine = answers.find(
      (a) => a.definitionKey === act.questionnaireKey && a.cycle === act.cycle,
    );
    if (mine?.completedAt) continue;
    out.push({
      activationId: act.activationId,
      questionnaireKey: act.questionnaireKey,
      title: act.title,
      cycle: act.cycle,
      openedAt: act.openedAt,
      started: !!mine,
      questionnaire:
        act.definition == null
          ? null
          : safeParseStoredDefinition(act.definition),
    });
  }
  return out;
}

/**
 * Where a member stands on one optional send, for the runner, its save action
 * and its upload route (the opt_in half of their access predicate):
 *   - `answer`: an approved camp member, the send is open, not answered yet;
 *   - `completed`: they finished it for the send's year;
 *   - `closed`: the send is not open;
 *   - `not-invited`: not a camp member it is open to (pending, rejected).
 */
export type OptInAccess = "answer" | "completed" | "closed" | "not-invited";

export async function getOptInAccess(
  userId: string,
  activation: Pick<
    ActivationRow,
    "questionnaireKey" | "cycle" | "status" | "scope"
  >,
): Promise<OptInAccess> {
  if (activation.scope !== "opt_in") return "not-invited";
  const db = createHttpDb();
  const [[me], [mine]] = await Promise.all([
    db
      .select({
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({ completedAt: schema.questionnaireResponses.completedAt })
      .from(schema.questionnaireResponses)
      .where(
        and(
          eq(schema.questionnaireResponses.userId, userId),
          eq(
            schema.questionnaireResponses.definitionKey,
            activation.questionnaireKey,
          ),
          eq(schema.questionnaireResponses.cycle, activation.cycle),
        ),
      )
      .limit(1),
  ]);
  if (!isOptInMember(me)) return "not-invited";
  if (mine?.completedAt) return "completed";
  return activation.status === "open" ? "answer" : "closed";
}

/**
 * How many camp members an optional send is open to right now: the
 * `everyone` audience (approved, not system, not erased). The Send screen's
 * "for all N camp members" and the results' "N camp members can see it".
 */
export async function countOptInMembers(): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  return row?.count ?? 0;
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
  /**
   * Who the send is for. `opt_in` (#313) asks nobody: any camp member may
   * answer it from My forms, and it has no required_actions rows.
   */
  scope: (typeof schema.questionnaireScopeEnum.enumValues)[number];
}

/**
 * Every spelling Postgres's uuid input accepts: 32 hex digits, a hyphen
 * allowed after any group of four, optionally in braces. Postgres throws on
 * anything else.
 */
const UUID =
  /^(?:\{[0-9a-f]{4}(?:-?[0-9a-f]{4}){7}\}|[0-9a-f]{4}(?:-?[0-9a-f]{4}){7})$/i;

/**
 * Read a single activation by id, or null; the generic runner loads by id. An id that is not a uuid (a mistyped or mangled
 * `/questionnaires/<id>` address) is null too, so the page shows its "closed"
 * card instead of a 500 from Postgres's uuid cast.
 */
export async function getActivationById(
  id: string,
): Promise<ActivationRow | null> {
  if (!UUID.test(id)) return null;
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
      scope: schema.questionnaireActivations.scope,
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
  /** When the member finished it, or null. */
  completedAt: Date | null;
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
      completedAt: schema.requiredActions.completedAt,
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
/**
 * Copy a submit's role answers into dietary_requirements (one row per member),
 * driver_profiles and camp_participations (one row per member per year: the
 * send's year). Only the columns the questionnaire has a role question for are
 * touched.
 */
async function writeRoleMirror(
  tx: DbOrTx,
  input: {
    userId: string;
    definitionKey: string;
    definitionVersion: string;
    cycle: number;
    mirror?: RoleMirror;
  },
  now: Date,
): Promise<void> {
  const version = `${input.definitionKey}@${input.definitionVersion}`;
  const dietary = input.mirror?.dietary;
  if (dietary) {
    await tx
      .insert(schema.dietaryRequirements)
      .values({
        userId: input.userId,
        ...dietary,
        version,
        completedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.dietaryRequirements.userId,
        set: { ...dietary, version, completedAt: now, updatedAt: now },
      });
  }
  const driver = input.mirror?.driver;
  if (driver) {
    const intent =
      driver.intendsToDrive === true ? { intentRegisteredAt: now } : {};
    await tx
      .insert(schema.driverProfiles)
      .values({
        userId: input.userId,
        cycle: input.cycle,
        ...driver,
        ...intent,
        version,
        completedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.driverProfiles.userId, schema.driverProfiles.cycle],
        set: {
          ...driver,
          // The first time they said they would drive, kept on a re-submit,
          // as the Claude connector's save keeps it.
          ...(driver.intendsToDrive === true
            ? {
                intentRegisteredAt: sql`coalesce(${schema.driverProfiles.intentRegisteredAt}, ${now})`,
              }
            : {}),
          version,
          completedAt: now,
          updatedAt: now,
        },
      });
  }
  const participation = input.mirror?.participation;
  if (participation) {
    // The send's frozen year, on this transaction: the answer, the gate and
    // the member's place commit together or not at all.
    await applyParticipationIntent(tx, {
      userId: input.userId,
      cycle: input.cycle,
      intent: participation.intent,
      now,
    });
  }
}

export async function completeBuilderResponse(input: {
  userId: string;
  definitionKey: string;
  definitionVersion: string;
  /** `activation.cycle` — the frozen year namespace, never the live config. */
  cycle: number;
  responses: QuestionnaireResponses;
  activationId: string;
  /**
   * Answers the definition marks for the app's own tables
   * (questionnaireRoleMirror in @camp404/core). Written in the same
   * transaction, so the roster, export and drivers audience never see a submit
   * half applied.
   */
  mirror?: RoleMirror;
  /**
   * Write only if the member has not already finished this questionnaire for
   * this year (an optional send, #313, where nothing else stops a second
   * submit). A compare-and-set on `completed_at IS NULL`: a lost race writes
   * nothing, not even the role mirror, and returns false.
   */
  firstSubmitOnly?: boolean;
}): Promise<boolean> {
  const now = new Date();
  return await withTransaction(async (tx) => {
    const written = await tx
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
        ...(input.firstSubmitOnly
          ? { setWhere: isNull(schema.questionnaireResponses.completedAt) }
          : {}),
      })
      .returning({ userId: schema.questionnaireResponses.userId });
    if (written.length === 0) return false;
    await writeRoleMirror(tx, input, now);
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
      (!ra.version || meetsRequiredVersion(ra.version, input.definitionVersion))
    ) {
      await tx
        .update(schema.requiredActions)
        .set({ status: "completed", completedAt: now })
        .where(eq(schema.requiredActions.id, ra.id));
    }
    return true;
  });
}
