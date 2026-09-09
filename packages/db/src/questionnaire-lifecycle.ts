import { and, eq, gte, inArray } from "drizzle-orm";
import {
  BuilderQuestionnaire,
  classifyChange,
  validateBuilderQuestionnaire,
} from "@camp404/types";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { nextBuilderVersion } from "./versions";
import {
  openActivation,
  type ActivationRow,
  type PooledTx,
} from "./activations";
import { carryOverFor, currentCycleNumber } from "./cycles";

// Builder-questionnaire lifecycle: publish (snapshot + cosmetic-vs-version-bump),
// unpublish (status + cascade close), send (open an activation with the one-open
// invariant), close, and REMIND (nudge the members still outstanding on an open
// send — §7.4, at the foot of this file). The pure decisions live in
// @camp404/types (classifyChange / validateBuilderQuestionnaire) and ./versions
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
  await withTransaction(async (tx) => {
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
  let closedActivations = 0;
  await withTransaction(async (tx) => {
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
  return { ok: true, closedActivations };
}

export type CloseResult = { ok: true } | { ok: false; error: string };

/**
 * The body of {@link closeActivation}, inside a caller-supplied transaction.
 * Extracted so the cycle rollover can close an activation and open its
 * replacement in ONE transaction rather than a pool per step (spec §8.3).
 */
export async function closeActivationTx(
  tx: PooledTx,
  activationId: string,
): Promise<CloseResult> {
  const now = new Date();
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
}

/**
 * Close one activation: status → closed and expire its still-linked pending
 * required_actions (non-gating terminal state, NOT deleted — preserves metrics).
 * Responses + completed rows are untouched. Idempotent on an already-closed row.
 */
export async function closeActivation(
  activationId: string,
): Promise<CloseResult> {
  return await withTransaction((tx) => closeActivationTx(tx, activationId));
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
      cycle: schema.questionnaireActivations.cycle,
      carryOver: schema.questionnaireActivations.carryOver,
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
 * single source of truth), as are the cycle + carry-over policy frozen onto the
 * row; the caller chooses scope / blocking / dueAt / targets.
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

  // Freeze the year namespace and the carry-over policy onto the row, exactly
  // as `version` and `title` are copied off the definition just below and for
  // exactly the same reason: every downstream read (fan-out, prefill, write)
  // uses the ACTIVATION's copy, so a rollover or a toggle flip landing
  // mid-collection changes the next send, never the one in flight (§7.2).
  const [cycle, carryOver] = await Promise.all([
    currentCycleNumber(),
    carryOverFor(input.questionnaireKey),
  ]);

  const activationId = await withTransaction(async (tx) => {
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
        cycle,
        carryOver: carryOver === "carry",
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

// --- Reminders (§7.4) ------------------------------------------------------
// A captain nudges the members who still hold a PENDING gate for an open send.
//
// WHERE THE 24-HOUR DEDUP STATE LIVES, and why. The rule is "≤1 reminder per
// (member, activation) per 24h" — a per-MEMBER fact — so it cannot live on the
// activation: one timestamp there would be a per-send fact, and a member who
// was added to the audience an hour ago would be silenced by a nudge that never
// reached them. It lives instead in the rows the reminder already writes:
// `notification_deliveries` is, by construction, one timestamped row per
// (recipient, notification), carrying `refType`/`refId`. Filtered to
// `refType = 'questionnaire_activation'`, `refId = <activation>` and a
// `broadcasts.kind = 'reminder'` parent, those rows ARE the reminder log. No
// new column, no migration — the record of the thing being deduped is the
// dedup key.
//
// The residual race: two captains tapping within the same few milliseconds can
// both read "no recent delivery" under READ COMMITTED and both insert. The
// read and the write share one transaction, which closes the window to the
// width of the insert; at ~30-80 members with one captain on the screen, the
// remaining exposure is a double nudge, not a spam loop. A unique index would
// close it properly and needs a migration, so it is deliberately not here.

/** The §7.4 window: at most one reminder per (member, activation) per 24 hours. */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The deep-link discriminator every questionnaire reminder carries on both the
 * broadcast and each delivery — and, per the note above, half of the dedup key.
 */
export const REMINDER_REF_TYPE = "questionnaire_activation";

const DUE_ON = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/**
 * The auto-filled reminder body (§7.4 — there is no custom-message UI in v1).
 * Pure, so the one line every member reads is unit-testable without a database.
 * A send with no deadline gets the deadline-free phrasing rather than the word
 * "undefined" where a date should be.
 */
export function reminderBody(title: string, dueAt: Date | null): string {
  return dueAt
    ? `Reminder: ${title} is due ${DUE_ON.format(dueAt)}. Tap to complete.`
    : `Reminder: ${title} is still waiting for your answer. Tap to complete.`;
}

export type ReminderResult =
  /** Delivered. `suppressed` counts pending members inside their 24h window. */
  | {
      ok: true;
      outcome: "sent";
      sent: number;
      suppressed: number;
      broadcastId: string;
    }
  /** Nobody holds a pending gate — everyone answered. NOT an error. */
  | { ok: true; outcome: "nobody_pending"; sent: 0; suppressed: 0 }
  /** Every outstanding member is inside their window; `nextAllowedAt` says when. */
  | {
      ok: true;
      outcome: "recently_reminded";
      sent: 0;
      suppressed: number;
      nextAllowedAt: Date;
    }
  | { ok: false; error: string };

/**
 * Remind the members with a PENDING required action for one open activation.
 *
 * Audience = the `pending` bucket exactly as Wave 3's tally derives it (§7.1).
 * `waived` and `expired` gates are a separate CLOSED bucket and are never
 * nudged: a waiver is a captain's decision that this member does not have to
 * answer, and an expired gate belongs to a send that is over. Reminding either
 * would re-open, by push, an obligation the app has already told them is done
 * with. `completed` is likewise out by definition.
 *
 * Delivery reuses the existing spine — one `broadcasts` row (`kind='reminder'`,
 * `scope='individual'`) fanned out into `notification_deliveries`, drained to
 * `push_tokens` by the existing worker. `publishedAt`/`dispatchedAt` are both
 * stamped inline, exactly as {@link publishAnnouncement} does, so the deferred
 * dispatch cron cannot fan the same broadcast out a second time. §7.4 says to
 * skip members with no push token: `planPushDrain` already resolves those to
 * `pushStatus='skipped'`, and writing the delivery anyway is what puts the
 * reminder in their in-app inbox — dropping them here would leave a member with
 * no device silently un-nudged on every channel.
 */
export async function sendReminder(input: {
  activationId: string;
  senderId: string;
  /** Injectable clock — the dedup window is the whole feature, so tests own it. */
  now?: Date;
}): Promise<ReminderResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - REMINDER_WINDOW_MS);

  const db = createHttpDb();
  const [act] = await db
    .select({
      id: schema.questionnaireActivations.id,
      questionnaireKey: schema.questionnaireActivations.questionnaireKey,
      title: schema.questionnaireActivations.title,
      status: schema.questionnaireActivations.status,
      dueAt: schema.questionnaireActivations.dueAt,
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, input.activationId))
    .limit(1);
  if (!act) return { ok: false, error: "Activation not found." };
  if (act.status !== "open") {
    // A closed send expired its pending gates, so there is nobody to remind —
    // but "nobody is outstanding" would read as "everyone answered", which is a
    // different and much rosier fact. Say which one it is.
    return {
      ok: false,
      error: "This send is closed, so nobody is waiting on it any more.",
    };
  }

  const body = reminderBody(act.title, act.dueAt);

  return await withTransaction(async (tx): Promise<ReminderResult> => {
    const pending = await tx
      .select({ userId: schema.requiredActions.userId })
      .from(schema.requiredActions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.requiredActions.userId),
      )
      .where(
        and(
          eq(schema.requiredActions.activationId, act.id),
          eq(schema.requiredActions.actionKey, act.questionnaireKey),
          // The pending bucket, and only it — see the doc comment.
          eq(schema.requiredActions.status, "pending"),
          // A departed or system account holds no obligation worth pushing.
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
        ),
      );

    const pendingIds = [...new Set(pending.map((p) => p.userId))];
    if (pendingIds.length === 0) {
      return { ok: true, outcome: "nobody_pending", sent: 0, suppressed: 0 };
    }

    const recent = await tx
      .select({
        userId: schema.notificationDeliveries.userId,
        createdAt: schema.notificationDeliveries.createdAt,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.broadcasts,
        eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
      )
      .where(
        and(
          eq(schema.broadcasts.kind, "reminder"),
          eq(schema.notificationDeliveries.refType, REMINDER_REF_TYPE),
          eq(schema.notificationDeliveries.refId, act.id),
          gte(schema.notificationDeliveries.createdAt, cutoff),
          inArray(schema.notificationDeliveries.userId, pendingIds),
        ),
      );

    const lastReminded = new Map<string, number>();
    for (const row of recent) {
      const at = row.createdAt.getTime();
      const seen = lastReminded.get(row.userId);
      if (seen === undefined || at > seen) lastReminded.set(row.userId, at);
    }

    const targets = pendingIds.filter((id) => !lastReminded.has(id));
    if (targets.length === 0) {
      // The captain pressed a button and nothing happened. Hand back WHEN the
      // next nudge is allowed — the earliest window to expire — so the caller
      // can say why instead of shrugging.
      const earliest = Math.min(...lastReminded.values());
      return {
        ok: true,
        outcome: "recently_reminded",
        sent: 0,
        suppressed: lastReminded.size,
        nextAllowedAt: new Date(earliest + REMINDER_WINDOW_MS),
      };
    }

    const [broadcast] = await tx
      .insert(schema.broadcasts)
      .values({
        senderId: input.senderId,
        kind: "reminder",
        scope: "individual",
        title: act.title,
        body,
        channel: "both",
        // A nudge, not a takeover: `acknowledge` is the full-screen gate reserved
        // for things every member must positively dismiss.
        presentation: "popup",
        refType: REMINDER_REF_TYPE,
        refId: act.id,
        publishedAt: now,
        dispatchedAt: now,
      })
      .returning({ id: schema.broadcasts.id });
    const broadcastId = broadcast!.id;

    await tx
      .insert(schema.broadcastTargets)
      .values(targets.map((userId) => ({ broadcastId, userId })));

    await tx
      .insert(schema.notificationDeliveries)
      .values(
        targets.map((userId) => ({
          broadcastId,
          userId,
          title: act.title,
          body,
          channel: "both" as const,
          presentation: "popup" as const,
          refType: REMINDER_REF_TYPE,
          refId: act.id,
          // Explicit rather than defaulted: this column IS the dedup clock, so
          // it has to be the same `now` the window above was measured from.
          createdAt: now,
        })),
      )
      .onConflictDoNothing();

    return {
      ok: true,
      outcome: "sent",
      sent: targets.length,
      suppressed: lastReminded.size,
      broadcastId,
    };
  });
}
