import { eq } from "drizzle-orm";
import { lockActor } from "./actor";
import { writeAuditEvent } from "./audit";
import { withTransaction } from "./index";
import * as schema from "./schema";

// A captain's "Send password reset link" on the member panel (owner's mock-up,
// step 7, 2026-10-27). The email itself is Better Auth's own reset email, sent
// by the caller after this returns (it is not a database write, so it cannot
// share this transaction). This module checks the captain and the member and
// writes the audit row.

export const RESET_CAPTAINS_ONLY = "Only captains can send a reset link.";
export const RESET_NO_SIGN_IN =
  "They have no sign-in to reset. Their account may have been deleted.";

export type PasswordResetLinkResult =
  | {
      ok: true;
      /**
       * The member's sign-in email, for the caller to ask Better Auth for the
       * link. Null only in the E2E test store, which keeps no email.
       */
      email: string | null;
    }
  | { ok: false; error: string };

/**
 * Check a captain may send `userId` a reset link and record that they did.
 *
 * The audit row is written FIRST, and the caller sends the email only after
 * it commits: an email can't be taken back, so a link that went out must
 * never be missing from the audit trail. The cost is a row for a send that
 * then fails, which the screen reports as a failure ("Every link sent is
 * logged" stays true; a logged attempt is the safe side to err on).
 *
 * The captain is re-read under lock (`lockActor`), so a captain demoted since
 * the page loaded is refused. An erased member, a system actor or a member
 * with no sign-in row is refused with a sentence.
 */
export async function recordPasswordResetLink(input: {
  actorId: string;
  userId: string;
}): Promise<PasswordResetLinkResult> {
  return withTransaction(async (tx): Promise<PasswordResetLinkResult> => {
    const actor = await lockActor(tx, input.actorId);
    if (actor?.rank !== "captain") {
      return { ok: false, error: RESET_CAPTAINS_ONLY };
    }
    const [member] = await tx
      .select({
        sanitised: schema.users.sanitised,
        isSystem: schema.users.isSystem,
        email: schema.user.email,
      })
      .from(schema.users)
      .leftJoin(schema.user, eq(schema.user.id, schema.users.authUserId))
      .where(eq(schema.users.id, input.userId))
      .limit(1);
    if (!member || member.sanitised || member.isSystem || !member.email) {
      return { ok: false, error: RESET_NO_SIGN_IN };
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "member.password_reset_sent",
      target: input.userId,
      metadata: { via: "member_panel" },
    });
    return { ok: true, email: member.email };
  });
}
