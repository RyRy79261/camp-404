import { and, desc, eq, isNotNull } from "drizzle-orm";

import { captainPromotionNotification } from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import type { IncomingPromotionRequest } from "@camp404/types";

// Data-access for the two-sided captain-promotion handshake
// (captain_promotion_requests). Sending a request also tells the target. Rank
// flips to `captain` in exactly one place, acceptCaptainPromotion, in the same
// transaction as the accepted status and its audit row.

const { captainPromotionRequests, users } = schema;

// Postgres unique_violation (SQLSTATE 23505). Here it means the partial unique
// index captain_promotion_open_per_target_idx tripped because a concurrent send
// created the open request first.
function isOpenRequestUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  return (
    e.code === "23505" ||
    e.constraint === "captain_promotion_open_per_target_idx" ||
    (typeof e.message === "string" &&
      e.message.includes("captain_promotion_open_per_target_idx"))
  );
}

export interface CaptainPromotionRequestRow {
  id: string;
  // Nullable for audit retention: SET NULL on a hard delete of the referenced
  // user (the row survives as an audit record). Non-null at creation.
  targetUserId: string | null;
  requestedByUserId: string | null;
  status: "sent" | "accepted" | "declined" | "cancelled";
  createdAt: Date;
  decidedAt: Date | null;
}

/**
 * The single OPEN (`sent`) promotion request for a target, if any. Backs the
 * idempotent-send rule and the roster dialog's step state.
 */
export async function getOpenPromotionForTarget(
  targetUserId: string,
): Promise<CaptainPromotionRequestRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select()
    .from(captainPromotionRequests)
    .where(
      and(
        eq(captainPromotionRequests.targetUserId, targetUserId),
        eq(captainPromotionRequests.status, "sent"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A promotion request by id, in ANY status (or null). Backs the accept / decline
 * / cancel actions: they load the row to feed the participant ids + status into
 * the pure `canDecidePromotion` guard, so a terminal row yields `request_not_open`
 * rather than a generic "not found". Read-only — no rank side-effects.
 */
export async function getPromotionRequestById(
  requestId: string,
): Promise<CaptainPromotionRequestRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select()
    .from(captainPromotionRequests)
    .where(eq(captainPromotionRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

/**
 * Send a "make captain" request. Idempotent: if an open request already exists
 * for the target it is returned unchanged (the partial unique index
 * `captain_promotion_open_per_target_idx` is the concurrency backstop). Does
 * NOT change the target's rank.
 *
 * A new request tells the target, in the same transaction: a pop-up and a push
 * naming who asked. A repeat send returns the open request and sends nothing,
 * so a double click cannot nag.
 */
export async function sendCaptainPromotion(input: {
  targetUserId: string;
  requestedByUserId: string;
}): Promise<CaptainPromotionRequestRow> {
  const existing = await getOpenPromotionForTarget(input.targetUserId);
  if (existing) return existing;

  try {
    return await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(captainPromotionRequests)
        .values({
          targetUserId: input.targetUserId,
          requestedByUserId: input.requestedByUserId,
        })
        .returning();
      if (!row) throw new Error("Failed to insert captain promotion request");
      const [requester] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, input.requestedByUserId));
      await tx.insert(schema.notificationDeliveries).values(
        deliveryValues(
          captainPromotionNotification({
            requestId: row.id,
            requesterName: requester?.displayName ?? null,
          }),
          {
            userId: input.targetUserId,
            broadcastId: null,
            channel: "both",
            presentation: "popup",
          },
        ),
      );
      return row;
    });
  } catch (err) {
    // Lost the read-before-insert race: a concurrent send created the open
    // request first and tripped the partial unique index. Return that existing
    // request so send stays idempotent; re-throw anything else.
    if (isOpenRequestUniqueViolation(err)) {
      const existing = await getOpenPromotionForTarget(input.targetUserId);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * The target accepts: the request flips from `sent` to `accepted`, the target's
 * rank becomes `captain`, and an audit row records it, all in one transaction.
 * Before this, the flip and the rank write were two separate writes, and a
 * failure between them left an accepted request on a member who was not a
 * captain.
 *
 * Only the target can accept, and only an open request with both participants
 * still present. Returns null when that is not true; nothing is written.
 */
export async function acceptCaptainPromotion(input: {
  requestId: string;
  actorUserId: string;
}): Promise<CaptainPromotionRequestRow | null> {
  return await withTransaction(async (tx) => {
    const [row] = await tx
      .update(captainPromotionRequests)
      .set({ status: "accepted", decidedAt: new Date() })
      .where(
        and(
          eq(captainPromotionRequests.id, input.requestId),
          eq(captainPromotionRequests.status, "sent"),
          eq(captainPromotionRequests.targetUserId, input.actorUserId),
          isNotNull(captainPromotionRequests.requestedByUserId),
        ),
      )
      .returning();
    if (!row) return null;

    const [before] = await tx
      .select({ rank: users.rank })
      .from(users)
      .where(eq(users.id, input.actorUserId))
      .for("update");
    await tx
      .update(users)
      .set({ rank: "captain", updatedAt: new Date() })
      .where(eq(users.id, input.actorUserId));
    await writeAuditEvent(tx, {
      actorId: input.actorUserId,
      action: "member.rank_changed",
      target: input.actorUserId,
      metadata: {
        from: before?.rank ?? null,
        to: "captain",
        via: "captain_promotion",
        requestId: row.id,
        requestedByUserId: row.requestedByUserId,
      },
    });
    return row;
  });
}

/**
 * Resolve an OPEN request to a terminal status. Only stamps the promotion row
 * (status + decidedAt); the rank change for `accepted` is the caller's job.
 * Returns null if the request was not open (already decided / not found) OR if a
 * participant was hard-deleted (SET NULL) — the IS NOT NULL guards make the write
 * atomic with the precondition the app checked on read, so a delete racing
 * between read and write can't flip an orphaned row (or promote a gone user).
 *
 * Pass `actorUserId` to also bind the actor to the side they act from IN THE
 * UPDATE predicate — `cancelled` requires the requester, `accepted`/`declined`
 * the target. The app guard (`canDecidePromotion`) already checks this on read;
 * folding it into the WHERE makes the write fail closed (returns null) if the row
 * doesn't match, rather than trusting the read-then-write window.
 */
export async function decideCaptainPromotion(input: {
  requestId: string;
  status: "accepted" | "declined" | "cancelled";
  actorUserId?: string;
}): Promise<CaptainPromotionRequestRow | null> {
  const db = createHttpDb();
  const conditions = [
    eq(captainPromotionRequests.id, input.requestId),
    eq(captainPromotionRequests.status, "sent"),
    isNotNull(captainPromotionRequests.targetUserId),
    isNotNull(captainPromotionRequests.requestedByUserId),
  ];
  if (input.actorUserId !== undefined) {
    conditions.push(
      input.status === "cancelled"
        ? eq(captainPromotionRequests.requestedByUserId, input.actorUserId)
        : eq(captainPromotionRequests.targetUserId, input.actorUserId),
    );
  }
  const [row] = await db
    .update(captainPromotionRequests)
    .set({ status: input.status, decidedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ?? null;
}

/**
 * Open (`sent`) requests where the given user is the TARGET — the acceptance
 * surface (home rank-section / notifications). Joins the requester's name.
 */
export async function getIncomingPromotionsForUser(
  userId: string,
): Promise<IncomingPromotionRequest[]> {
  const db = createHttpDb();
  return db
    .select({
      id: captainPromotionRequests.id,
      // users.id (the join key) is non-null, so the acceptance-surface shape
      // keeps a non-null requester id even though the column is now nullable.
      requestedByUserId: users.id,
      requestedByName: users.displayName,
      status: captainPromotionRequests.status,
      createdAt: captainPromotionRequests.createdAt,
    })
    .from(captainPromotionRequests)
    .innerJoin(users, eq(users.id, captainPromotionRequests.requestedByUserId))
    .where(
      and(
        eq(captainPromotionRequests.targetUserId, userId),
        eq(captainPromotionRequests.status, "sent"),
      ),
    )
    .orderBy(desc(captainPromotionRequests.createdAt));
}
