import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";
import {
  chunk,
  deliveryPushStatus,
  shouldPruneToken,
  type PushSend,
  type TokenSendResult,
} from "./push-status";
import { notificationLink, plainPreview } from "@camp404/core";

// Push-token + delivery-drain data layer. Deliberately Firebase-free: the FCM
// send fn is INJECTED into `drainQueuedPush` (apps/web supplies the
// firebase-admin impl), so this Neon-only package never imports firebase.

type Platform = (typeof schema.platformEnum.enumValues)[number];

/**
 * Register / refresh a device token. Upserts on the unique `token` index, so a
 * re-register refreshes the row and a token another member registered moves to
 * the caller.
 *
 * Why a token may move between members (audit #134, decided 2026-09-28):
 * - The FCM token is the only proof of a device the server has. A web token is
 *   minted by this device's browser and read back only by code running on it,
 *   so a caller who presents it is, as far as anything here can tell, on that
 *   device. "The same phone, now signed in by someone else" and "someone who
 *   learnt another device's token" look identical: there is no sound way to
 *   tell them apart.
 * - A conflict means the last member never forgot the token (a sign-out
 *   through /auth/sign-out deletes the row and the Firebase token). Refusing
 *   the move would keep the LAST member's notices going to a phone someone else
 *   now holds: a leak of their messages.
 * - Moving it costs a caller who only knows a token nothing they could read: a
 *   push goes to the device, never to the caller. The worst case is that the
 *   other member's phone stops getting their pushes (and gets the caller's
 *   own, which the caller can read anyway). So the token moves.
 * - What the last member chose for this device (topics) does not move with it:
 *   the row starts again for its new owner. Nothing about the move is logged.
 */
export async function upsertPushToken(input: {
  userId: string;
  token: string;
  platform: Platform;
  topics?: string[];
}): Promise<void> {
  const db = createHttpDb();
  await db
    .insert(schema.pushTokens)
    .values({
      userId: input.userId,
      token: input.token,
      platform: input.platform,
      ...(input.topics ? { topics: input.topics } : {}),
    })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: {
        userId: input.userId,
        platform: input.platform,
        topics:
          input.topics ??
          sql`CASE WHEN ${schema.pushTokens.userId} = excluded.user_id
              THEN ${schema.pushTokens.topics} ELSE '[]'::jsonb END`,
        lastSeenAt: new Date(),
      },
    });
}

/** Remove a token, scoped to its owner (web sign-out / native revoke). */
export async function deletePushTokenForUser(
  userId: string,
  token: string,
): Promise<void> {
  const db = createHttpDb();
  await db
    .delete(schema.pushTokens)
    .where(
      and(
        eq(schema.pushTokens.token, token),
        eq(schema.pushTokens.userId, userId),
      ),
    );
}

export interface QueuedPushDelivery {
  id: string;
  userId: string;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
}

/**
 * Pure (no DB) core of the drain: given the queued deliveries, each user's
 * tokens, and the injected send fn, decide each delivery's terminal status and
 * collect dead tokens to prune. Unit-tested with a stub send; `drainQueuedPush`
 * wraps it with the DB read/write.
 */
export async function planPushDrain(
  queued: QueuedPushDelivery[],
  tokensByUser: Map<string, string[]>,
  send: PushSend,
): Promise<{
  statusById: Map<string, "sent" | "failed" | "skipped">;
  deadTokens: Set<string>;
}> {
  const statusById = new Map<string, "sent" | "failed" | "skipped">();
  const deadTokens = new Set<string>();
  for (const d of queued) {
    // Exclude tokens already classified dead earlier in this run so we don't
    // re-send to (and re-collect) a token a prior delivery already pruned.
    const tokens = (tokensByUser.get(d.userId) ?? []).filter(
      (t) => !deadTokens.has(t),
    );
    if (tokens.length === 0) {
      statusById.set(d.id, "skipped");
      continue;
    }
    // `link` is the in-app path a tap opens, the same one the inbox row uses.
    const data: Record<string, string> = {
      deliveryId: d.id,
      link: notificationLink(d.refType, d.refId),
    };
    if (d.refType) data.refType = d.refType;
    if (d.refId) data.refId = d.refId;

    // A push notification is a plain-text boundary: the OS draws the body as
    // typed, so an announcement written in markdown would reach a lock screen
    // as "**Water** is *not* provided". The rendered version waits behind the
    // tap, on the announcement page.
    const body = plainPreview(d.body);

    const results: TokenSendResult[] = [];
    for (const batch of chunk(tokens, 500)) {
      results.push(...(await send(batch, { title: d.title, body }, data)));
    }
    statusById.set(d.id, deliveryPushStatus(results));
    for (const r of results) {
      if (!r.success && shouldPruneToken(r.errorCode)) deadTokens.add(r.token);
    }
  }
  return { statusById, deadTokens };
}

export interface PushDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  pruned: number;
}

/** How many queued pushes one drain sends. */
export const PUSH_DRAIN_LIMIT = 200;

/**
 * Sends in a row that threw or timed out before one run stops: the push
 * service is down, and the rest would each wait out a failure too.
 */
export const PUSH_MAX_THROWS_IN_A_ROW = 3;

/**
 * How long one push may take before it counts as a failed send. Each one is
 * sent inside its claim's transaction, so a send that never answers would hold
 * the row, and the run, open until the function is stopped.
 */
export const PUSH_SEND_TIMEOUT_MS = 10_000;

/** A send that did not answer in time. It may still have gone out. */
class PushSendTimeout extends Error {}

/** `send`, refused with PushSendTimeout if it has not answered within `ms`. */
function withTimeout(send: PushSend, ms: number): PushSend {
  return (tokens, notification, data) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PushSendTimeout(`push send timed out after ${ms} ms`)),
        ms,
      );
    });
    return Promise.race([send(tokens, notification, data), late]).finally(() =>
      clearTimeout(timer),
    );
  };
}

/**
 * Drain queued push deliveries, oldest first. Reads `notification_deliveries`
 * with `pushStatus='queued'` and `channel IN ('push','both')` (never `in_app`),
 * sends each to the recipient's device tokens via the injected `send` fn, flips
 * `pushStatus` to sent/failed/skipped, and prunes dead tokens.
 *
 * One pooled connection for the whole run, and one transaction on it per
 * delivery: claim it (FOR UPDATE SKIP LOCKED, so an overlapping drain skips it
 * and no phone buzzes twice), send it, write its status and commit. A push
 * that went out stays marked sent whatever happens to the ones after it, so a
 * later failure, or the function being stopped, can never put it back in the
 * queue to be sent again.
 *
 * A send that throws is not FCM's answer about this push (the service down,
 * bad credentials): the delivery stays queued for a later run and this run
 * moves on. A send with no answer within PUSH_SEND_TIMEOUT_MS is marked
 * `failed` instead: the race only stops waiting, it does not cancel the
 * request, so the push may still arrive, and retrying could send it twice.
 * Either way the run stops after PUSH_MAX_THROWS_IN_A_ROW in a row.
 */
export async function drainQueuedPush(
  sendPush: PushSend,
  options: { limit?: number; sendTimeoutMs?: number } = {},
): Promise<PushDrainResult> {
  const limit = options.limit ?? PUSH_DRAIN_LIMIT;
  const send = withTimeout(
    sendPush,
    options.sendTimeoutMs ?? PUSH_SEND_TIMEOUT_MS,
  );
  const { db, pool } = createPooledDb();
  try {
    return await drainOn(db, send, limit);
  } finally {
    await pool.end();
  }
}

async function drainOn(
  db: ReturnType<typeof createPooledDb>["db"],
  send: PushSend,
  limit: number,
): Promise<PushDrainResult> {
  const result: PushDrainResult = { sent: 0, failed: 0, skipped: 0, pruned: 0 };
  // Left queued after a throw: not claimed again in this run.
  const passed: string[] = [];
  // Pruned earlier in this run, so a later delivery does not send to them.
  const pruned = new Set<string>();
  let throwsInARow = 0;

  for (let i = 0; i < limit; i++) {
    const outcome = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .select({
          id: schema.notificationDeliveries.id,
          userId: schema.notificationDeliveries.userId,
          title: schema.notificationDeliveries.title,
          body: schema.notificationDeliveries.body,
          refType: schema.notificationDeliveries.refType,
          refId: schema.notificationDeliveries.refId,
        })
        .from(schema.notificationDeliveries)
        .where(
          and(
            eq(schema.notificationDeliveries.pushStatus, "queued"),
            inArray(schema.notificationDeliveries.channel, ["push", "both"]),
            passed.length > 0
              ? notInArray(schema.notificationDeliveries.id, passed)
              : undefined,
          ),
        )
        .orderBy(
          asc(schema.notificationDeliveries.createdAt),
          asc(schema.notificationDeliveries.id),
        )
        .limit(1)
        .for("update", { skipLocked: true });
      if (!claimed) return { kind: "empty" as const };

      const tokenRows = await tx
        .select({ token: schema.pushTokens.token })
        .from(schema.pushTokens)
        .where(eq(schema.pushTokens.userId, claimed.userId));
      const tokens = tokenRows
        .map((r) => r.token)
        .filter((t) => !pruned.has(t));

      let plan: Awaited<ReturnType<typeof planPushDrain>>;
      try {
        plan = await planPushDrain(
          [claimed],
          new Map([[claimed.userId, tokens]]),
          send,
        );
      } catch (err) {
        if (!(err instanceof PushSendTimeout)) {
          return { kind: "threw" as const, id: claimed.id };
        }
        await tx
          .update(schema.notificationDeliveries)
          .set({ pushStatus: "failed" })
          .where(eq(schema.notificationDeliveries.id, claimed.id));
        return { kind: "timedOut" as const };
      }
      const status = plan.statusById.get(claimed.id) ?? "skipped";
      await tx
        .update(schema.notificationDeliveries)
        .set({
          pushStatus: status,
          ...(status === "sent" ? { deliveredAt: new Date() } : {}),
        })
        .where(eq(schema.notificationDeliveries.id, claimed.id));
      const dead = [...plan.deadTokens];
      if (dead.length > 0) {
        await tx
          .delete(schema.pushTokens)
          .where(inArray(schema.pushTokens.token, dead));
      }
      return { kind: "done" as const, status, dead };
    });

    if (outcome.kind === "empty") break;
    if (outcome.kind === "threw" || outcome.kind === "timedOut") {
      if (outcome.kind === "threw") passed.push(outcome.id);
      else result.failed += 1;
      throwsInARow += 1;
      if (throwsInARow >= PUSH_MAX_THROWS_IN_A_ROW) break;
      continue;
    }
    throwsInARow = 0;
    result[outcome.status] += 1;
    for (const t of outcome.dead) {
      if (!pruned.has(t)) result.pruned += 1;
      pruned.add(t);
    }
  }
  return result;
}
