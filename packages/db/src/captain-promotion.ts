import { and, desc, eq } from "drizzle-orm";

import { createHttpDb } from "./index";
import * as schema from "./schema";
import type { IncomingPromotionRequest } from "@camp404/types";

// Data-access for the two-sided captain-promotion handshake
// (captain_promotion_requests). This module is side-effect-free with respect to
// other tables: it never changes a user's rank. Rank flips to `captain` only
// when the target accepts — the app accept action calls `setUserRank` after a
// successful `decideCaptainPromotion(..., "accepted")`.

const { captainPromotionRequests, users } = schema;

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
 * Send a "make captain" request. Idempotent: if an open request already exists
 * for the target it is returned unchanged (the partial unique index
 * `captain_promotion_open_per_target_idx` is the concurrency backstop). Does
 * NOT change the target's rank.
 */
export async function sendCaptainPromotion(input: {
  targetUserId: string;
  requestedByUserId: string;
}): Promise<CaptainPromotionRequestRow> {
  const existing = await getOpenPromotionForTarget(input.targetUserId);
  if (existing) return existing;

  const db = createHttpDb();
  const [row] = await db
    .insert(captainPromotionRequests)
    .values({
      targetUserId: input.targetUserId,
      requestedByUserId: input.requestedByUserId,
    })
    .returning();
  if (!row) throw new Error("Failed to insert captain promotion request");
  return row;
}

/**
 * Resolve an OPEN request to a terminal status. Only stamps the promotion row
 * (status + decidedAt); the rank change for `accepted` is the caller's job.
 * Returns null if the request was not open (already decided / not found).
 */
export async function decideCaptainPromotion(input: {
  id: string;
  decision: "accepted" | "declined" | "cancelled";
}): Promise<CaptainPromotionRequestRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .update(captainPromotionRequests)
    .set({ status: input.decision, decidedAt: new Date() })
    .where(
      and(
        eq(captainPromotionRequests.id, input.id),
        eq(captainPromotionRequests.status, "sent"),
      ),
    )
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
