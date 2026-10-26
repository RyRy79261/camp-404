import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import {
  renderTelegramNotice,
  shouldTelegramNotification,
  type TelegramNotice,
  type TelegramNotices,
} from "@camp404/core";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// A member's private chat with Ol' Jeb, the camp's Telegram bot. Telegram lets
// a bot send a private message only to someone who opened a chat with it, so a
// member connects by a one-use link (`t.me/<bot>?start=<code>`) made on their
// Profile, and the drain sends each notice that goes by push to the members
// who did.

/** How long a Connect Telegram link works. */
export const TELEGRAM_LINK_MINUTES = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Make a one-use code for this member's Connect Telegram link. Only its hash
 * is stored; the code goes into the link and nowhere else.
 */
export async function createTelegramLinkCode(userId: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const db = createHttpDb();
  await db.insert(schema.telegramLinkCodes).values({
    userId,
    codeHash: hashCode(code),
    expiresAt: sql`now() + make_interval(mins => ${TELEGRAM_LINK_MINUTES})`,
  });
  return code;
}

export type ConnectResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "link_run_out" };

/**
 * Use a code from `/start <code>`: once, inside its 10 minutes, for a member
 * who still has an account. Ties the Telegram account to the member (moving it
 * off any other member it was tied to, since one Telegram account is one
 * person), keeps a handle they already typed, and opens their notices.
 */
export async function connectTelegram(input: {
  code: string;
  telegramUserId: string;
  username: string | null;
}): Promise<ConnectResult> {
  return await withTransaction(async (tx) => {
    const [used] = await tx
      .update(schema.telegramLinkCodes)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(schema.telegramLinkCodes.codeHash, hashCode(input.code)),
          isNull(schema.telegramLinkCodes.usedAt),
          gt(schema.telegramLinkCodes.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: schema.telegramLinkCodes.userId });
    if (!used) return { ok: false, reason: "link_run_out" };

    const [member] = await tx
      .select({
        sanitised: schema.users.sanitised,
        isSystem: schema.users.isSystem,
      })
      .from(schema.users)
      .where(eq(schema.users.id, used.userId))
      .for("update");
    if (!member || member.sanitised || member.isSystem) {
      return { ok: false, reason: "link_run_out" };
    }

    // telegram_user_id is unique: free it on whoever held it before.
    await tx
      .update(schema.users)
      .set({ telegramUserId: null, telegramDmAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.users.telegramUserId, input.telegramUserId),
          ne(schema.users.id, used.userId),
        ),
      );
    await tx
      .update(schema.users)
      .set({
        telegramUserId: input.telegramUserId,
        telegramDmAt: sql`now()`,
        telegramHandle: input.username
          ? sql`coalesce(nullif(trim(${schema.users.telegramHandle}), ''), ${input.username})`
          : schema.users.telegramHandle,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, used.userId));
    return { ok: true, userId: used.userId };
  });
}

/**
 * Stop notices to a Telegram account (`/stop`, or the member blocked the
 * bot). Whether a connected member was found.
 */
export async function stopTelegramByTelegramId(
  telegramUserId: string,
): Promise<boolean> {
  const db = createHttpDb();
  const rows = await db
    .update(schema.users)
    .set({ telegramDmAt: null, updatedAt: new Date() })
    .where(eq(schema.users.telegramUserId, telegramUserId))
    .returning({ id: schema.users.id });
  return rows.length > 0;
}

/** Whether this Telegram account is a connected member's. */
export async function isTelegramConnected(
  telegramUserId: string,
): Promise<boolean> {
  const db = createHttpDb();
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.telegramUserId, telegramUserId),
        sql`${schema.users.telegramDmAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Disconnect on the Profile: no more notices by Telegram. */
export async function disconnectTelegram(userId: string): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ telegramDmAt: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setTelegramNotices(
  userId: string,
  notices: TelegramNotices,
): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ telegramNotices: notices, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export interface TelegramConnection {
  connected: boolean;
  /** The handle to show, without "@", or null. */
  handle: string | null;
  notices: TelegramNotices;
}

/** A member's own Telegram state, for their Profile. */
export async function getTelegramConnection(
  userId: string,
): Promise<TelegramConnection> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      dmAt: schema.users.telegramDmAt,
      handle: schema.users.telegramHandle,
      notices: schema.users.telegramNotices,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const handle = row?.handle?.trim().replace(/^@+/, "") || null;
  return {
    connected: row?.dmAt != null,
    handle,
    notices: row?.notices ?? "all",
  };
}

/**
 * Record an update from the webhook. False when it was already handled (a
 * Telegram retry), so the caller does nothing.
 */
export async function recordTelegramUpdate(updateId: number): Promise<boolean> {
  const db = createHttpDb();
  const rows = await db
    .insert(schema.telegramUpdates)
    .values({ updateId })
    .onConflictDoNothing()
    .returning({ updateId: schema.telegramUpdates.updateId });
  return rows.length > 0;
}

/**
 * Forget an update whose handling failed, so Telegram's retry is handled
 * again rather than dropped as a duplicate.
 */
export async function forgetTelegramUpdate(updateId: number): Promise<void> {
  const db = createHttpDb();
  await db
    .delete(schema.telegramUpdates)
    .where(eq(schema.telegramUpdates.updateId, updateId));
}

/** Telegram retries an update for about a day; a week is plenty. */
export async function pruneTelegramUpdates(): Promise<void> {
  const db = createHttpDb();
  await db
    .delete(schema.telegramUpdates)
    .where(
      lt(schema.telegramUpdates.receivedAt, sql`now() - interval '7 days'`),
    );
}

// --- The drain ----------------------------------------------------------

/**
 * What a send answered. `rateLimited` (429) stops the run; `blocked` (403:
 * the member blocked Ol' Jeb, or never opened the chat) disconnects them;
 * `retryable` (Telegram down, no answer) leaves the row queued.
 */
export type TelegramSendResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      rateLimited?: boolean;
      blocked?: boolean;
      retryable?: boolean;
    };

export type TelegramSend = (
  chatId: string,
  notice: TelegramNotice,
) => Promise<TelegramSendResult>;

export interface TelegramDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
  expired: number;
}

/** How long a queued notice may wait; older ones are not sent late. */
export const TELEGRAM_MAX_QUEUED_HOURS = 20;

/** How many notices one run sends; a later page load sends the rest. */
export const TELEGRAM_DRAIN_LIMIT = 25;

/** "Not now" answers in a row that end the run: Telegram is down. */
export const TELEGRAM_MAX_DEFERRALS_IN_A_ROW = 3;

/**
 * Send queued Telegram notices, oldest first, under FOR UPDATE SKIP LOCKED so
 * two runs never send one twice. A member who is not connected (or connected
 * after the notice was written), erased, a system account, or asked for the
 * important ones only, is `skipped`. A notice queued longer than
 * TELEGRAM_MAX_QUEUED_HOURS is `failed` unsent.
 */
export async function drainQueuedTelegram(
  send: TelegramSend,
  options: { siteUrl: string; limit?: number },
): Promise<TelegramDrainResult> {
  return await withTransaction(async (tx) => {
    const queued = await tx
      .select({
        id: schema.notificationDeliveries.id,
        userId: schema.notificationDeliveries.userId,
        kind: schema.notificationDeliveries.kind,
        presentation: schema.notificationDeliveries.presentation,
        title: schema.notificationDeliveries.title,
        body: schema.notificationDeliveries.body,
        refType: schema.notificationDeliveries.refType,
        refId: schema.notificationDeliveries.refId,
        telegramUserId: schema.users.telegramUserId,
        notices: schema.users.telegramNotices,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        connectedBefore: sql<boolean>`${schema.users.telegramDmAt} IS NOT NULL AND ${schema.users.telegramDmAt} <= ${schema.notificationDeliveries.createdAt}`,
        expired: sql<boolean>`${schema.notificationDeliveries.createdAt} < now() - make_interval(hours => ${TELEGRAM_MAX_QUEUED_HOURS})`,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.notificationDeliveries.userId),
      )
      .where(eq(schema.notificationDeliveries.telegramStatus, "queued"))
      .orderBy(asc(schema.notificationDeliveries.createdAt))
      .limit(options.limit ?? TELEGRAM_DRAIN_LIMIT)
      .for("update", { of: schema.notificationDeliveries, skipLocked: true });

    const result: TelegramDrainResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      deferred: 0,
      expired: 0,
    };
    // A member who blocked the bot in this run: skip the rest of theirs.
    const blocked = new Set<string>();
    let deferralsInARow = 0;
    for (const row of queued) {
      let status: "sent" | "failed" | "skipped";
      if (
        !row.telegramUserId ||
        !row.connectedBefore ||
        row.isSystem ||
        row.sanitised ||
        blocked.has(row.userId) ||
        !shouldTelegramNotification(row.kind, row.presentation, row.notices)
      ) {
        status = "skipped";
      } else if (row.expired) {
        status = "failed";
        result.expired += 1;
      } else {
        const notice = renderTelegramNotice(row, options.siteUrl);
        const outcome: TelegramSendResult = await send(
          row.telegramUserId,
          notice,
        ).catch((err: unknown) => ({
          ok: false,
          error: err instanceof Error ? err.message : "send failed",
          retryable: true,
        }));
        if (!outcome.ok && (outcome.rateLimited || outcome.retryable)) {
          result.deferred += 1;
          deferralsInARow += 1;
          if (
            outcome.rateLimited ||
            deferralsInARow >= TELEGRAM_MAX_DEFERRALS_IN_A_ROW
          ) {
            break;
          }
          continue;
        }
        deferralsInARow = 0;
        if (!outcome.ok && outcome.blocked) {
          blocked.add(row.userId);
          await tx
            .update(schema.users)
            .set({ telegramDmAt: null, updatedAt: new Date() })
            .where(eq(schema.users.id, row.userId));
          status = "skipped";
        } else {
          status = outcome.ok ? "sent" : "failed";
        }
      }
      await tx
        .update(schema.notificationDeliveries)
        .set({ telegramStatus: status })
        .where(
          and(
            eq(schema.notificationDeliveries.id, row.id),
            eq(schema.notificationDeliveries.telegramStatus, "queued"),
          ),
        );
      result[status] += 1;
    }
    return result;
  });
}
