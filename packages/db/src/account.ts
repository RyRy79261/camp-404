import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { canLeaveCamp, lostCatName, nextLostCatNumber } from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { isRealCaptain } from "./bootstrap";
import { withTransaction, type Tx } from "./index";
import * as schema from "./schema";
import { ERASURE_DELETES, type ScrubStep } from "./table-lifecycle";

// Account erasure ("right to be forgotten"). We do NOT hard-delete the users
// row — that would break referral lineage and every audit/authorship FK.
// Instead we anonymise the row in place to a "Lost Cat #N" stub, sever the
// auth link, and delete the personal data hanging off it, preserving relational
// integrity (AGENTS.md / brief).

/** "Lost Cat #N", from @camp404/core; exported here by its old name too. */
export { lostCatName };

/**
 * The `users`-row patch that anonymises an account. Pure (no DB) so it is
 * unit-tested. `authUserId` is severed to `deleted:<id>` so the old login id
 * no longer maps to this row — a re-login becomes a fresh, access-less user.
 * Keeps `id` and `inviteCode` (who invited them — lineage); drops rank to
 * `member`. Every other `users` column is either cleared here or kept on
 * purpose; the list of kept columns is pinned in __tests__/account.test.ts, so
 * a new column fails that test until someone decides which it is.
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
    // A captain's words about this person.
    approvalDecisionReason: null,
    // What they told the camp about themselves.
    skills: [],
    previousAfrikaburns: null,
    previousBurningMans: null,
    firstTime: null,
    // Consent belongs to a person; a tombstone gives none.
    aiDataConsent: false,
    aiDataConsentAt: null,
    voiceConsentAt: null,
    telegramHandle: null,
    telegramUserId: null,
    telegramDmAt: null,
    telegramNotices: "all",
    // Their words about themselves, and their place on the public join site.
    campTitle: null,
    campBlurb: null,
    showOnJoin: false,
    termsVersion: null,
    termsConsentedAt: null,
    sanitised: true,
    sanitisedAt: now,
    lostCatNumber,
    updatedAt: now,
  } satisfies Partial<typeof schema.users.$inferInsert>;
}

/** Who is being erased, as each hand step needs it. */
type ErasedMember = {
  userId: string;
  /** Their Better Auth `user.id`, read before the patch rewrites it. */
  authUserId: string | null;
  lostCatNumber: number;
  now: Date;
};

/**
 * The hand steps of an erasure: the `scrub` decisions in table-lifecycle.ts,
 * by name. Everything a step does not touch is either a plain `del` (the loop
 * in sanitiseAccount), cascades from a row a step or the loop deletes, or is
 * kept on purpose. Run in this order, in the erasure's transaction.
 */
const SCRUB_STEPS: {
  readonly [S in ScrubStep]: (tx: Tx, member: ErasedMember) => Promise<void>;
} = {
  usersRow: async (tx, { userId, lostCatNumber, now }) => {
    await tx
      .update(schema.users)
      .set(sanitisedUserPatch(userId, lostCatNumber, now))
      .where(eq(schema.users.id, userId));
  },
  // The sign-in identity goes entirely: email, password hash, sessions,
  // second factors and passkeys (the last four cascade from `user`). Under
  // Neon Auth this lived on a service erasure could not reach, so an erased
  // member's email and login outlived them.
  signInIdentity: async (tx, { authUserId }) => {
    if (authUserId === null) return;
    await tx.delete(schema.user).where(eq(schema.user.id, authUserId));
  },
  // Transport (#270): a request that named their car becomes "any car",
  // since its rider still needs a lift (their own requests are a `del`).
  liftRequestDriver: async (tx, { userId }) => {
    await tx
      .update(schema.liftRequests)
      .set({ driverUserId: null })
      .where(eq(schema.liftRequests.driverUserId, userId));
  },
  // A trailer they towed stays the camp's, with no car.
  trailerTower: async (tx, { userId }) => {
    await tx
      .update(schema.transportTrailers)
      .set({ towedByUserId: null })
      .where(eq(schema.transportTrailers.towedByUserId, userId));
  },
  // The fuel cans (#255): a can they owned becomes the camp's, and a can in
  // their car goes on no car; the can stays on the sheet.
  fuelCans: async (tx, { userId }) => {
    await tx
      .update(schema.fuelCans)
      .set({ ownerUserId: null })
      .where(eq(schema.fuelCans.ownerUserId, userId));
    await tx
      .update(schema.fuelCans)
      .set({ travelsWithUserId: null })
      .where(eq(schema.fuelCans.travelsWithUserId, userId));
  },
  // Their pets (Camp pets): a pet they sent in (it has photos) is their own
  // words and photos, so it goes; the photo folder goes with the erasure in
  // apps/web (lib/account.ts). A pet with no photos is one of the camp's
  // seeded cats a founder linked to them: it stays, linked to nobody.
  pets: async (tx, { userId }) => {
    await tx
      .delete(schema.pets)
      .where(
        and(
          eq(schema.pets.ownerId, userId),
          or(
            isNotNull(schema.pets.frontPhotoPath),
            isNotNull(schema.pets.sidePhotoPath),
          ),
        ),
      );
    await tx
      .update(schema.pets)
      .set({ ownerId: null })
      .where(eq(schema.pets.ownerId, userId));
  },
  // The Claude connector's log of their calls stays, like audit_log (which
  // tool, when, and whether it worked), but what they passed in and the
  // error text go: either can hold their own answers.
  connectorLog: async (tx, { userId }) => {
    await tx
      .update(schema.mcpAuditLog)
      .set({ argsJson: null, errorMessage: null })
      .where(eq(schema.mcpAuditLog.userId, userId));
  },
  // The dues ledger stays for accounting, like reimbursements below, but the
  // captain's free-text note may name the person, so it goes. Their
  // proof-of-payment files go too (the web app deletes the files themselves
  // after the erasure commits).
  paymentNotes: async (tx, { userId }) => {
    await tx
      .update(schema.payments)
      .set({ note: null, proofPathname: null, proofContentType: null })
      .where(eq(schema.payments.userId, userId));
  },
  // The words the Finance team wrote about them: a concession's reason...
  chargeReasons: async (tx, { userId }) => {
    await tx
      .update(schema.duesCharges)
      .set({ concessionReason: null })
      .where(eq(schema.duesCharges.userId, userId));
  },
  // ...and a refund's note and reason.
  refundNotes: async (tx, { userId }) => {
    await tx
      .update(schema.paymentRefunds)
      .set({ note: null, declineReason: null })
      .where(eq(schema.paymentRefunds.userId, userId));
  },
  // Scrub encrypted bank details (NOT NULL → empty string, not null) while
  // keeping the reimbursement record for accounting, and the reason a lead or
  // the Finance team wrote about a claim, which may name them. Their claims'
  // receipt rows go too (the web app deletes the files themselves after the
  // erasure commits, like the proof-of-payment files).
  claims: async (tx, { userId }) => {
    await tx
      .update(schema.reimbursements)
      .set({ accountDetailsEncrypted: "", decisionNote: null })
      .where(eq(schema.reimbursements.submitterId, userId));
    await tx
      .delete(schema.reimbursementFiles)
      .where(
        inArray(
          schema.reimbursementFiles.reimbursementId,
          tx
            .select({ id: schema.reimbursements.id })
            .from(schema.reimbursements)
            .where(eq(schema.reimbursements.submitterId, userId)),
        ),
      );
  },
};

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
  return await withTransaction(async (tx) => {
    // The sole-captain guard, recounted HERE so the check and the write
    // cannot be separated: a caller that counted two captains and then took
    // a request's worth of time to get here would otherwise erase the
    // second-to-last one against a stale count, and a camp with no captain
    // is unrecoverable (/setup is latched shut and only a captain can mint a
    // captain invite).
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
    const leave = canLeaveCamp({
      isCaptain: captains.some((c) => c.id === userId),
      captainCount: captains.length,
    });
    if (!leave.ok) return leave;

    // The login this member signs in with. Read before the patch below
    // rewrites `auth_user_id` to its `deleted:` tombstone.
    const [identity] = await tx
      .select({ authUserId: schema.users.authUserId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    const [row] = await tx
      .select({
        max: sql<number | null>`max(${schema.users.lostCatNumber})`,
      })
      .from(schema.users);
    const member: ErasedMember = {
      userId,
      authUserId: identity?.authUserId ?? null,
      lostCatNumber: nextLostCatNumber(row?.max ?? null),
      now: new Date(),
    };
    const { lostCatNumber } = member;

    // The hand steps first, in SCRUB_STEPS' order (the users row and the
    // sign-in identity lead), then every `del` column of table-lifecycle.ts.
    // Order between the two does not matter: nothing restricts a delete, and
    // every foreign key into a deleted row cascades.
    for (const step of Object.values(SCRUB_STEPS)) {
      await step(tx, member);
    }
    // Personal owned rows, explicit deletes (the kept users row means the
    // users-level CASCADE never fires). Deliberately NOT year-scoped, unlike
    // every read of the per-year tables: erasure is erasure, so every year's
    // memberships, answers, tickets, seats and orders go.
    for (const { table, column } of ERASURE_DELETES) {
      await tx.delete(table).where(eq(column, userId));
    }

    // The proof row. Without it a finished erasure and a data-loss incident
    // look the same afterwards. It names only the tombstone number: the row
    // exists to say "this was erased on purpose", not who the person was.
    await writeAuditEvent(tx, {
      actorId: userId,
      action: "account.sanitized",
      target: userId,
      metadata: { lostCatNumber },
    });

    return { ok: true as const, lostCatNumber };
  });
}
