import { eq, asc } from "drizzle-orm";
import type { ReferralUser } from "@camp404/types";

import { createHttpDb } from "./index";
import * as schema from "./schema";

// Query for the camp's "who invited who" referral graph. The data already
// exists on `users.invite_code` → `invite_codes.created_by_user_id`; this
// helper packages it as a flat list for the family-tree UI. The recursive tree
// (with cycle guard) is built from it in @camp404/core.

/**
 * One row per user with the id of the user who invited them (NULL for the
 * founder / god accounts that pre-date any code). Ordered by displayName so the
 * page is stable.
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
