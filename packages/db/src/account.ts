import { eq, or, sql } from "drizzle-orm";
import { isRealCaptain } from "./bootstrap";
import { createPooledDb } from "./index";
import * as schema from "./schema";

// Account erasure ("right to be forgotten"). We do NOT hard-delete the users
// row — that would break referral lineage and every audit/authorship FK.
// Instead we anonymise the row in place to a "Lost Cat #N" stub, sever the
// auth link, and delete the personal data hanging off it, preserving relational
// integrity (AGENTS.md / brief).

export function lostCatName(n: number): string {
  return `Lost Cat #${n}`;
}

/**
 * The `users`-row patch that anonymises an account. Pure (no DB) so it is
 * unit-tested. `authUserId` is severed to `deleted:<id>` so the Neon Auth login
 * no longer maps to this row — a re-login becomes a fresh, access-less user.
 * Keeps `id` and `inviteCode` (who invited them — lineage); drops rank to
 * `member`.
 */
export function sanitisedUserPatch(
  userId: string,
  lostCatNumber: number,
  now: Date,
) {
  return {
    displayName: lostCatName(lostCatNumber),
    authUserId: `deleted:${userId}`,
    // A tombstone must not hold rank. Belt to the braces of the
    // `sanitised = false` filter on the captain count in bootstrap.ts: rows
    // erased BEFORE this change keep `captain` and are caught only by that
    // filter, so both are required.
    rank: "member",
    profileImageUrl: null,
    passportEncrypted: null,
    saIdEncrypted: null,
    eftDetailsEncrypted: null,
    emergencyContacts: null,
    telegramHandle: null,
    telegramUserId: null,
    termsVersion: null,
    termsConsentedAt: null,
    sanitised: true,
    sanitisedAt: now,
    lostCatNumber,
    updatedAt: now,
  } satisfies Partial<typeof schema.users.$inferInsert>;
}

export type SanitiseResult =
  | { ok: true; lostCatNumber: number }
  | { ok: false; reason: "sole_captain" };

/**
 * Erase an account in one pooled transaction: anonymise the users row, delete
 * the personal owned rows (CASCADE-owned children aren't auto-removed since the
 * row is kept), and scrub reimbursement bank PII. Audit / authorship refs and
 * the user's referral subtree are left intact, now resolving to "Lost Cat #N".
 *
 * Refuses the camp's last real captain — see the guard below. `canLeaveCamp`
 * (core) stays the cheap pre-check that gives the caller a good error before
 * any work happens; this is the one that decides.
 */
export async function sanitiseAccount(userId: string): Promise<SanitiseResult> {
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      // The sole-captain guard, recounted HERE so the check and the write
      // cannot be separated: a caller that counted two captains and then took
      // a request's worth of time to get here would otherwise erase the
      // second-to-last one against a stale count, and a camp with no captain
      // is unrecoverable (/setup is latched shut and the admin CLI cannot mint
      // a captain invite with no captain to attribute it to).
      //
      // `for("update")` is what makes it atomic rather than merely fresh: it
      // locks every real-captain row for the rest of the transaction, so a
      // concurrent erasure of a peer blocks here and then re-reads the set
      // this transaction has already shrunk. Same predicate as /setup reads
      // (`isRealCaptain`) and the same `<= 1` as `canLeaveCamp`.
      const captains = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(isRealCaptain)
        .for("update");
      if (captains.length <= 1 && captains.some((c) => c.id === userId)) {
        return { ok: false as const, reason: "sole_captain" as const };
      }

      const [row] = await tx
        .select({
          max: sql<number | null>`max(${schema.users.lostCatNumber})`,
        })
        .from(schema.users);
      const lostCatNumber = (row?.max ?? 0) + 1;
      const now = new Date();

      await tx
        .update(schema.users)
        .set(sanitisedUserPatch(userId, lostCatNumber, now))
        .where(eq(schema.users.id, userId));

      // Personal owned rows — explicit deletes (the kept users row means the
      // CASCADE never fires).
      await tx
        .delete(schema.burnerProfiles)
        .where(eq(schema.burnerProfiles.userId, userId));
      await tx
        .delete(schema.dietaryRequirements)
        .where(eq(schema.dietaryRequirements.userId, userId));
      await tx
        .delete(schema.driverProfiles)
        .where(eq(schema.driverProfiles.userId, userId));
      await tx
        .delete(schema.pushTokens)
        .where(eq(schema.pushTokens.userId, userId));
      await tx
        .delete(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.userId, userId));
      await tx
        .delete(schema.questionnaireEdits)
        .where(eq(schema.questionnaireEdits.userId, userId));
      // The generic builder-questionnaire answer store. The bespoke
      // questionnaires keep their own domain tables (burner_profiles,
      // dietary_requirements, driver_profiles) and are deleted above; this is
      // where every other answer the member ever gave lives.
      await tx
        .delete(schema.questionnaireResponses)
        .where(eq(schema.questionnaireResponses.userId, userId));
      await tx
        .delete(schema.requiredActions)
        .where(eq(schema.requiredActions.userId, userId));
      await tx
        .delete(schema.teamMemberships)
        .where(eq(schema.teamMemberships.userId, userId));
      // car_members is a join table — remove the user whether they were the
      // driver or a passenger.
      await tx
        .delete(schema.carMembers)
        .where(
          or(
            eq(schema.carMembers.driverUserId, userId),
            eq(schema.carMembers.memberUserId, userId),
          ),
        );
      await tx
        .delete(schema.workshopRsvps)
        .where(eq(schema.workshopRsvps.userId, userId));
      await tx
        .delete(schema.broadcastTargets)
        .where(eq(schema.broadcastTargets.userId, userId));
      await tx
        .delete(schema.questionnaireActivationTargets)
        .where(eq(schema.questionnaireActivationTargets.userId, userId));

      // Live access grants. All three declare `onDelete: "cascade"` on
      // users.id, but erasure KEEPS the users row — it anonymises it — so the
      // cascade never fires and the grant outlives the account. Without these
      // an issued MCP access token (and its refresh token) keeps answering for
      // the member until it expires, and a pending Telegram invite stays
      // redeemable. Revoking access is the part of "erase my account" a member
      // would assume happened first.
      await tx
        .delete(schema.mcpAccessTokens)
        .where(eq(schema.mcpAccessTokens.userId, userId));
      await tx
        .delete(schema.mcpAuthCodes)
        .where(eq(schema.mcpAuthCodes.userId, userId));
      await tx
        .delete(schema.telegramInvites)
        .where(eq(schema.telegramInvites.userId, userId));

      // Scrub encrypted bank details (NOT NULL → empty string, not null) while
      // keeping the reimbursement record for accounting.
      await tx
        .update(schema.reimbursements)
        .set({ accountDetailsEncrypted: "" })
        .where(eq(schema.reimbursements.submitterId, userId));

      return { ok: true as const, lostCatNumber };
    });
  } finally {
    await pool.end();
  }
}
