import { eq, isNull, asc } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// Queries for the camp's "who invited who" referral graph. The data
// already exists on `users.invite_code` → `invite_codes.created_by_user_id`;
// these helpers package it for the UI.

export interface ReferralUser {
  id: string;
  displayName: string | null;
  rank: "captain" | "member";
  inviteCode: string | null;
  inviterId: string | null;
}

/**
 * One row per user with the id of the user who invited them (NULL for
 * the founder / god accounts that pre-date any code). Ordered by
 * displayName so the page is stable.
 */
export async function getReferralRoster(): Promise<ReferralUser[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      rank: schema.users.rank,
      inviteCode: schema.users.inviteCode,
      inviterId: schema.inviteCodes.createdByUserId,
    })
    .from(schema.users)
    .leftJoin(
      schema.inviteCodes,
      eq(schema.inviteCodes.code, schema.users.inviteCode),
    )
    .orderBy(asc(schema.users.displayName));
  return rows;
}

/**
 * Codes a particular user has issued — for the "I brought on X" view on
 * their own profile, or for the captain who minted them.
 */
export async function getInvitesIssuedBy(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.createdByUserId, userId))
    .orderBy(asc(schema.inviteCodes.createdAt));
  return rows;
}

/**
 * Codes with NULL inviter — the roots of the referral tree (founder, god
 * accounts seeded outside the normal flow). Useful when rendering the
 * tree top-down.
 */
export async function getRootCodes() {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.inviteCodes)
    .where(isNull(schema.inviteCodes.createdByUserId));
  return rows;
}
