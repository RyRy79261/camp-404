import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "./audit";
import { createHttpDb, withTransaction, type Tx } from "./index";

// The outbox drain: how Ol' Jeb sends what is queued for Telegram, at most
// once. Telegram has no idempotency key, so the protocol is the same for every
// queue (the private notices on `notification_deliveries`, the posts in the
// camp's chats on `telegram_announcements`):
//
//  1. A short transaction gives up on rows left `sending` past the time to
//     live, claims the oldest `queued` rows (FOR UPDATE SKIP LOCKED, so two
//     runs never take the same row), and marks each `skipped`, `failed`
//     (queued too long) or `sending`. It commits before anything is sent.
//  2. Each `sending` row is sent on its own and its answer written after,
//     only while it is still `sending`. A run cut short after a send leaves
//     the row `sending`, never `queued`, so it is never sent twice.
//  3. A "not now" answer (Telegram down, no answer) puts the row back to
//     `queued`. A 429, or TELEGRAM_MAX_DEFERRALS_IN_A_ROW such answers in a
//     row, ends the run and hands back the rows it never tried.
//
// A queue supplies only where its rows are, what it skips, and how it sends
// one (`TelegramOutbox`). Email and push have drains of their own.

/** How long a queued row may wait; older ones are not sent late. */
export const TELEGRAM_MAX_QUEUED_HOURS = 20;

/** How many rows one run sends; a later page load sends the rest. */
export const TELEGRAM_DRAIN_LIMIT = 25;

/** "Not now" answers in a row that end the run: Telegram is down. */
export const TELEGRAM_MAX_DEFERRALS_IN_A_ROW = 3;

/**
 * What a send answered. `rateLimited` (429) stops the run; `blocked` (403:
 * the member blocked Ol' Jeb, or never opened the chat) is the queue's to
 * handle; `retryable` (Telegram down, no answer) leaves the row queued.
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

export interface TelegramDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
  /** Of `failed`: queued longer than TELEGRAM_MAX_QUEUED_HOURS, never sent. */
  expired: number;
}

/** Where a row is in the outbox. */
export type OutboxStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

/** One row, as it is about to go: its send, and what to do once it went. */
export interface OutboxSend {
  send: () => Promise<TelegramSendResult>;
  /** After the row is recorded sent: best effort, never sends it again. */
  afterSent?: () => Promise<void>;
}

/** One Telegram queue, as the drain sees it. */
export interface TelegramOutbox<Row extends { id: string }> {
  /** Mark rows still `sending` from before `cutoff` failed. */
  failStuck(tx: Tx, cutoff: SQL): Promise<void>;
  /**
   * The oldest `queued` rows, at most `limit`, locked FOR UPDATE SKIP
   * LOCKED, each with whether it was queued before `cutoff`.
   */
  claim(
    tx: Tx,
    limit: number,
    cutoff: SQL,
  ): Promise<Array<Row & { expired: boolean }>>;
  /** Which claimed rows are not to be sent at all, read in the claim. */
  skipAtClaim(tx: Tx): Promise<(row: Row) => boolean>;
  /**
   * Set a row's status; with `fromSending`, only while it is still
   * `sending`, so a row another run gave up on is never written over.
   */
  mark(
    db: DbOrTx,
    id: string,
    status: OutboxStatus,
    fromSending?: boolean,
  ): Promise<void>;
  /** What to send for a claimed row, read as it goes; null skips it. */
  prepare(row: Row, db: DbOrTx): Promise<OutboxSend | null>;
  /** A 403 answer; the row is then `skipped`. Without it, `failed`. */
  onBlocked?(row: Row, db: DbOrTx): Promise<void>;
}

/** Send what one queue holds, oldest first, at most once each. */
export async function drainTelegramOutbox<Row extends { id: string }>(
  outbox: TelegramOutbox<Row>,
  options: { limit?: number } = {},
): Promise<TelegramDrainResult> {
  const result: TelegramDrainResult = {
    sent: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    expired: 0,
  };
  const cutoff = sql`now() - make_interval(hours => ${TELEGRAM_MAX_QUEUED_HOURS})`;

  const claimed = await withTransaction(async (tx) => {
    // A run that stopped mid-send left these: give up on them, unsent again.
    await outbox.failStuck(tx, cutoff);
    const queued = await outbox.claim(
      tx,
      options.limit ?? TELEGRAM_DRAIN_LIMIT,
      cutoff,
    );
    const skip = await outbox.skipAtClaim(tx);
    const toSend: Row[] = [];
    for (const row of queued) {
      let status: "sending" | "failed" | "skipped";
      if (skip(row)) {
        status = "skipped";
      } else if (row.expired) {
        status = "failed";
        result.expired += 1;
      } else {
        status = "sending";
        toSend.push(row);
      }
      await outbox.mark(tx, row.id, status);
      if (status !== "sending") result[status] += 1;
    }
    return toSend;
  });

  const db = createHttpDb();
  const finish = (id: string, status: OutboxStatus) =>
    outbox.mark(db, id, status, true);

  let deferralsInARow = 0;
  for (let i = 0; i < claimed.length; i += 1) {
    const row = claimed[i]!;
    const outgoing = await outbox.prepare(row, db);
    if (!outgoing) {
      await finish(row.id, "skipped");
      result.skipped += 1;
      continue;
    }
    const outcome: TelegramSendResult = await outgoing
      .send()
      .catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : "send failed",
        retryable: true,
      }));
    if (!outcome.ok && (outcome.rateLimited || outcome.retryable)) {
      // Telegram did not take it: safe to try again on a later run.
      await finish(row.id, "queued");
      result.deferred += 1;
      deferralsInARow += 1;
      if (
        outcome.rateLimited ||
        deferralsInARow >= TELEGRAM_MAX_DEFERRALS_IN_A_ROW
      ) {
        // Hand back the ones this run claimed but never tried.
        for (const rest of claimed.slice(i + 1)) {
          await finish(rest.id, "queued");
        }
        break;
      }
      continue;
    }
    deferralsInARow = 0;
    if (!outcome.ok && outcome.blocked && outbox.onBlocked) {
      await outbox.onBlocked(row, db);
      await finish(row.id, "skipped");
      result.skipped += 1;
      continue;
    }
    const status = outcome.ok ? "sent" : "failed";
    await finish(row.id, status);
    result[status] += 1;
    if (outcome.ok && outgoing.afterSent) await outgoing.afterSent();
  }
  return result;
}
