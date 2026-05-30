import { and, eq, inArray } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";
import {
  chunk,
  deliveryPushStatus,
  shouldPruneToken,
  type PushSend,
  type TokenSendResult,
} from "./push-status";

// Push-token + delivery-drain data layer. Deliberately Firebase-free: the FCM
// send fn is INJECTED into `drainQueuedPush` (apps/web supplies the
// firebase-admin impl), so this Neon-only package never imports firebase.

type Platform = (typeof schema.platformEnum.enumValues)[number];

/** Register / refresh a device token. Upserts on the unique `token` index so a
 * re-register (or a device handed to another user) rebinds cleanly. */
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
        ...(input.topics ? { topics: input.topics } : {}),
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

export interface PushDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  pruned: number;
}

/**
 * Drain queued push deliveries. Reads `notification_deliveries` with
 * `pushStatus='queued'` and `channel IN ('push','both')` (never `in_app` —
 * C leaves every delivery queued), sends each to the recipient's device tokens
 * via the injected `send` fn, flips `pushStatus` to sent/failed/skipped, and
 * prunes dead tokens. The status write is conditional on the row still being
 * `queued`, so an overlapping run can't double-write the status; the cron is
 * daily, so double-send is not a practical concern at this scale.
 */
export async function drainQueuedPush(send: PushSend): Promise<PushDrainResult> {
  const httpDb = createHttpDb();
  const queued = await httpDb
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
      ),
    );

  if (queued.length === 0) return { sent: 0, failed: 0, skipped: 0, pruned: 0 };

  const userIds = [...new Set(queued.map((d) => d.userId))];
  const tokenRows = await httpDb
    .select({
      userId: schema.pushTokens.userId,
      token: schema.pushTokens.token,
    })
    .from(schema.pushTokens)
    .where(inArray(schema.pushTokens.userId, userIds));

  const tokensByUser = new Map<string, string[]>();
  for (const r of tokenRows) {
    const list = tokensByUser.get(r.userId) ?? [];
    list.push(r.token);
    tokensByUser.set(r.userId, list);
  }

  const statusById = new Map<string, "sent" | "failed" | "skipped">();
  const deadTokens = new Set<string>();

  for (const d of queued) {
    const tokens = tokensByUser.get(d.userId) ?? [];
    if (tokens.length === 0) {
      statusById.set(d.id, "skipped");
      continue;
    }
    const data: Record<string, string> = { deliveryId: d.id };
    if (d.refType) data.refType = d.refType;
    if (d.refId) data.refId = d.refId;

    const results: TokenSendResult[] = [];
    for (const batch of chunk(tokens, 500)) {
      results.push(...(await send(batch, { title: d.title, body: d.body }, data)));
    }
    statusById.set(d.id, deliveryPushStatus(results));
    for (const r of results) {
      if (!r.success && shouldPruneToken(r.errorCode)) deadTokens.add(r.token);
    }
  }

  const { db, pool } = createPooledDb();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pruned = 0;
  try {
    await db.transaction(async (tx) => {
      for (const [id, status] of statusById) {
        const updated = await tx
          .update(schema.notificationDeliveries)
          .set({
            pushStatus: status,
            ...(status === "sent" ? { deliveredAt: new Date() } : {}),
          })
          .where(
            and(
              eq(schema.notificationDeliveries.id, id),
              eq(schema.notificationDeliveries.pushStatus, "queued"),
            ),
          )
          .returning({ id: schema.notificationDeliveries.id });
        if (updated.length === 0) continue; // already handled by another run
        if (status === "sent") sent += 1;
        else if (status === "failed") failed += 1;
        else skipped += 1;
      }
      if (deadTokens.size > 0) {
        await tx
          .delete(schema.pushTokens)
          .where(inArray(schema.pushTokens.token, [...deadTokens]));
        pruned = deadTokens.size;
      }
    });
    return { sent, failed, skipped, pruned };
  } finally {
    await pool.end();
  }
}
