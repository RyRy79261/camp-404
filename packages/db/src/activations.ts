import { and, asc, eq } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";
import { computeAudience, type BroadcastScope } from "./audience";
import { meetsRequiredVersion } from "./versions";

// The required_actions gating producer + satisfaction. A questionnaire
// activation fans out one required_actions row per matched member (the generic
// "what blocks this user" mechanism); a bespoke feature satisfies its row by
// flipping status to completed when it writes its own domain table.

// questionnaire scope subset the producer supports today. `opt_in` is a pull
// model (members self-select) — deferred. `drivers` is broadcast-only.
const PUSH_SCOPES = new Set(["everyone", "team", "team_leads", "individual"]);

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
 * Open a questionnaire activation: mark it open and fan out one
 * `required_actions` row per matched member. Idempotent / re-activation-safe
 * via the `(user_id, action_key)` unique index — a re-open re-points the row
 * to this activation/version and re-sets it to pending.
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
    httpDb
      .select({
        userId: schema.teamMemberships.userId,
        team: schema.teamMemberships.team,
        isLead: schema.teamMemberships.isLead,
      })
      .from(schema.teamMemberships),
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
    return await db.transaction(async (tx) => {
      await tx
        .update(schema.questionnaireActivations)
        .set({ status: "open", openedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.questionnaireActivations.id, act.id));

      if (recipientIds.length === 0) return { ok: true as const, created: 0 };

      await tx
        .insert(schema.requiredActions)
        .values(
          recipientIds.map((userId) => ({
            userId,
            type: "questionnaire" as const,
            actionKey: act.questionnaireKey,
            version: act.version,
            activationId: act.id,
            title: act.title,
            blocking: act.blocking,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.requiredActions.userId,
            schema.requiredActions.actionKey,
          ],
          set: {
            version: act.version,
            activationId: act.id,
            title: act.title,
            blocking: act.blocking,
            status: "pending",
            completedAt: null,
          },
        });

      return { ok: true as const, created: recipientIds.length };
    });
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
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, id))
    .limit(1);
  return row ?? null;
}

export interface RequiredActionState {
  status: (typeof schema.requiredActionStatusEnum.enumValues)[number];
  version: string | null;
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
