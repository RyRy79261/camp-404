import { and, eq } from "drizzle-orm";
import {
  BuilderQuestionnaire,
  classifyChange,
  validateBuilderQuestionnaire,
} from "@camp404/types";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";
import { nextBuilderVersion } from "./versions";
import { openActivation, type ActivationRow } from "./activations";

// Builder-questionnaire lifecycle: publish (snapshot + cosmetic-vs-version-bump),
// unpublish (status + cascade close), send (open an activation with the one-open
// invariant), and close. The pure decisions live in @camp404/types
// (classifyChange / validateBuilderQuestionnaire) and ./versions
// (nextBuilderVersion); this module is the thin DB orchestration around them.
// See docs/questionnaire-builder.md §6.

type Scope = (typeof schema.questionnaireScopeEnum.enumValues)[number];
type Team = (typeof schema.teamEnum.enumValues)[number];

const ONE_OPEN_INDEX = "questionnaire_activations_one_open_per_key_idx";

// A unique-constraint violation (PG 23505) raised inside openActivation's
// transaction can only be the one-open-per-key partial index (the
// required_actions upsert uses ON CONFLICT, so it never violates). Drizzle wraps
// the driver error: the OUTER Error carries the SQL text, while the real PG error
// (code 23505 + constraint name) lives on `.cause`. Walk the cause chain so we
// match regardless of how deep the driver nests it.
export function isOpenActivationConflict(err: unknown): boolean {
  for (let cur: unknown = err, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur !== "object") break;
    const e = cur as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      e.code === "23505" ||
      e.constraint === ONE_OPEN_INDEX ||
      (typeof e.message === "string" && e.message.includes(ONE_OPEN_INDEX))
    ) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

const ONE_OPEN_ERROR =
  "This questionnaire already has an open send. Close it before sending again.";

export type PublishResult =
  | { ok: true; version: string; change: "initial" | "cosmetic" | "breaking" }
  | { ok: false; errors: string[] };

/**
 * Publish the working head of a builder definition. Validates it (publish-time
 * blockers, §6.2); then classifies the change against the latest published
 * snapshot (§6.1): the first publish and any BREAKING change mint a new version
 * row; a COSMETIC change overwrites the current version's snapshot in place (no
 * bump, open activations keep serving). Always flips status → published (so a
 * re-publish of an unpublished definition brings it back online). Atomic:
 * snapshot write + head pointer update in one transaction.
 */
export async function publishDefinition(
  key: string,
  publishedByUserId: string | null,
): Promise<PublishResult> {
  const db = createHttpDb();
  const [head] = await db
    .select({
      version: schema.questionnaireDefinitions.version,
      definition: schema.questionnaireDefinitions.definition,
    })
    .from(schema.questionnaireDefinitions)
    .where(eq(schema.questionnaireDefinitions.key, key))
    .limit(1);
  if (!head) return { ok: false, errors: ["Questionnaire not found."] };

  const parsed = BuilderQuestionnaire.safeParse(head.definition);
  if (!parsed.success) {
    return { ok: false, errors: ["This questionnaire is malformed."] };
  }
  const blockers = validateBuilderQuestionnaire(parsed.data);
  if (blockers.length > 0) return { ok: false, errors: blockers };

  let version: string;
  let change: "initial" | "cosmetic" | "breaking";
  if (!head.version) {
    version = nextBuilderVersion(key, null);
    change = "initial";
  } else {
    const [latest] = await db
      .select({ definition: schema.questionnaireVersions.definition })
      .from(schema.questionnaireVersions)
      .where(
        and(
          eq(schema.questionnaireVersions.definitionKey, key),
          eq(schema.questionnaireVersions.version, head.version),
        ),
      )
      .limit(1);
    const latestParsed = latest
      ? BuilderQuestionnaire.safeParse(latest.definition)
      : null;
    // A missing/corrupt prior snapshot is treated as breaking (mint fresh) so we
    // never silently overwrite with an unknown baseline.
    const cls =
      latestParsed?.success
        ? classifyChange(latestParsed.data, parsed.data)
        : "breaking";
    if (cls === "cosmetic") {
      version = head.version;
      change = "cosmetic";
    } else {
      version = nextBuilderVersion(key, head.version);
      change = "breaking";
    }
  }

  const snapshot = parsed.data;
  const now = new Date();
  const { db: tdb, pool } = createPooledDb();
  try {
    await tdb.transaction(async (tx) => {
      await tx
        .insert(schema.questionnaireVersions)
        .values({
          definitionKey: key,
          version,
          definition: snapshot,
          publishedAt: now,
          publishedByUserId,
        })
        .onConflictDoUpdate({
          target: [
            schema.questionnaireVersions.definitionKey,
            schema.questionnaireVersions.version,
          ],
          set: { definition: snapshot, publishedAt: now, publishedByUserId },
        });
      await tx
        .update(schema.questionnaireDefinitions)
        .set({ status: "published", version, updatedAt: now })
        .where(eq(schema.questionnaireDefinitions.key, key));
    });
  } finally {
    await pool.end();
  }
  return { ok: true, version, change };
}

export type UnpublishResult =
  | { ok: true; closedActivations: number }
  | { ok: false; error: string };

/**
 * Take a published definition offline: status → unpublished and close every
 * open activation for the key (clearing its still-pending gates to expired,
 * preserving responses + completed rows for metrics). Re-publish is allowed.
 * One transaction.
 */
export async function unpublishDefinition(
  key: string,
): Promise<UnpublishResult> {
  const db = createHttpDb();
  const [meta] = await db
    .select({ status: schema.questionnaireDefinitions.status })
    .from(schema.questionnaireDefinitions)
    .where(eq(schema.questionnaireDefinitions.key, key))
    .limit(1);
  if (!meta) return { ok: false, error: "Questionnaire not found." };

  const now = new Date();
  const { db: tdb, pool } = createPooledDb();
  let closedActivations = 0;
  try {
    await tdb.transaction(async (tx) => {
      await tx
        .update(schema.questionnaireDefinitions)
        .set({ status: "unpublished", updatedAt: now })
        .where(eq(schema.questionnaireDefinitions.key, key));
      // Re-select the open activations INSIDE the transaction so a send that
      // races in just before this commit is still caught and closed (a read
      // outside the tx would miss it and leave a gate open under an unpublished
      // definition). The one-open invariant bounds this to ≤1 row in practice.
      const openActs = await tx
        .select({ id: schema.questionnaireActivations.id })
        .from(schema.questionnaireActivations)
        .where(
          and(
            eq(schema.questionnaireActivations.questionnaireKey, key),
            eq(schema.questionnaireActivations.status, "open"),
          ),
        );
      closedActivations = openActs.length;
      for (const act of openActs) {
        await tx
          .update(schema.questionnaireActivations)
          .set({ status: "closed", closedAt: now, updatedAt: now })
          .where(eq(schema.questionnaireActivations.id, act.id));
        await tx
          .update(schema.requiredActions)
          .set({ status: "expired" })
          .where(
            and(
              eq(schema.requiredActions.activationId, act.id),
              eq(schema.requiredActions.status, "pending"),
            ),
          );
      }
    });
  } finally {
    await pool.end();
  }
  return { ok: true, closedActivations };
}

export type CloseResult = { ok: true } | { ok: false; error: string };

/**
 * Close one activation: status → closed and expire its still-linked pending
 * required_actions (non-gating terminal state, NOT deleted — preserves metrics).
 * Responses + completed rows are untouched. Idempotent on an already-closed row.
 */
export async function closeActivation(
  activationId: string,
): Promise<CloseResult> {
  const now = new Date();
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      const [act] = await tx
        .select({ status: schema.questionnaireActivations.status })
        .from(schema.questionnaireActivations)
        .where(eq(schema.questionnaireActivations.id, activationId))
        .limit(1);
      if (!act) return { ok: false, error: "Activation not found." };
      if (act.status === "closed") return { ok: true };
      await tx
        .update(schema.questionnaireActivations)
        .set({ status: "closed", closedAt: now, updatedAt: now })
        .where(eq(schema.questionnaireActivations.id, activationId));
      await tx
        .update(schema.requiredActions)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.requiredActions.activationId, activationId),
            eq(schema.requiredActions.status, "pending"),
          ),
        );
      return { ok: true };
    });
  } finally {
    await pool.end();
  }
}

/** The currently-open activation for a key, or null (the one-open invariant). */
export async function getOpenActivationForKey(
  key: string,
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
    .where(
      and(
        eq(schema.questionnaireActivations.questionnaireKey, key),
        eq(schema.questionnaireActivations.status, "open"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface SendInput {
  questionnaireKey: string;
  scope: Scope;
  team?: Team | null;
  blocking: boolean;
  dueAt?: Date | null;
  activatedByUserId: string;
  /** Recipients for scope = 'individual'. */
  targetUserIds?: string[];
}

export type SendResult =
  | { ok: true; activationId: string; created: number }
  | { ok: false; error: string };

/**
 * Open a new activation for a PUBLISHED definition, pinned to its currently
 * published version, and fan out the gates. Enforces the one-open invariant
 * (§6.3): rejects if an open activation already exists for the key — the captain
 * must close it first. The version + title are derived from the definition (the
 * single source of truth); the caller chooses scope / blocking / dueAt /
 * targets.
 */
export async function sendActivation(input: SendInput): Promise<SendResult> {
  const db = createHttpDb();
  const [def] = await db
    .select({
      status: schema.questionnaireDefinitions.status,
      version: schema.questionnaireDefinitions.version,
      title: schema.questionnaireDefinitions.title,
    })
    .from(schema.questionnaireDefinitions)
    .where(eq(schema.questionnaireDefinitions.key, input.questionnaireKey))
    .limit(1);
  if (!def) return { ok: false, error: "Questionnaire not found." };
  if (def.status !== "published" || !def.version) {
    return { ok: false, error: "Publish this questionnaire before sending it." };
  }

  const existingOpen = await getOpenActivationForKey(input.questionnaireKey);
  if (existingOpen) {
    return { ok: false, error: ONE_OPEN_ERROR };
  }

  const { db: tdb, pool } = createPooledDb();
  let activationId: string;
  try {
    activationId = await tdb.transaction(async (tx) => {
      const [act] = await tx
        .insert(schema.questionnaireActivations)
        .values({
          questionnaireKey: input.questionnaireKey,
          version: def.version!,
          title: def.title,
          scope: input.scope,
          team: input.team ?? null,
          blocking: input.blocking,
          dueAt: input.dueAt ?? null,
          activatedByUserId: input.activatedByUserId,
          status: "draft",
        })
        .returning({ id: schema.questionnaireActivations.id });
      if (
        input.scope === "individual" &&
        input.targetUserIds &&
        input.targetUserIds.length > 0
      ) {
        await tx
          .insert(schema.questionnaireActivationTargets)
          .values(
            input.targetUserIds.map((userId) => ({
              activationId: act!.id,
              userId,
            })),
          );
      }
      return act!.id;
    });
  } finally {
    await pool.end();
  }

  // Fan out the gates and flip the activation open. The partial unique index is
  // the backstop for a concurrent second send slipping past the pre-check above:
  // openActivation's UPDATE → 'open' would violate it and throw, leaving the
  // freshly-inserted draft as an orphan (benign — never written to
  // required_actions, never surfaced by an open-or-by-id activation reader).
  try {
    const opened = await openActivation(activationId);
    if (!opened.ok) return { ok: false, error: opened.error };
    return { ok: true, activationId, created: opened.created };
  } catch (err) {
    // Only the one-open conflict gets the friendly message; any other failure
    // is a genuine fault and must not masquerade as "already open".
    if (isOpenActivationConflict(err)) return { ok: false, error: ONE_OPEN_ERROR };
    return {
      ok: false,
      error: "Couldn't send this questionnaire right now — please try again.",
    };
  }
}
