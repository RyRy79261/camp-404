import { eq, sql } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";

// First-time-setup data access. A fresh system has no captain; the /setup
// wizard elects the first one here. This is the single sanctioned bypass of the
// two-sided promotion handshake, authorised purely by the invariant "no captain
// exists yet". After the first captain exists the wizard is unreachable, so it
// can only ever fire once.

const { users, inviteCodes, campSettings } = schema;

export interface BootstrapState {
  /** Stamped when the wizard completed; null on a fresh system. */
  bootstrappedAt: Date | null;
  /** How many stored captains exist — the real "is the camp set up" signal. */
  captainCount: number;
}

/** Read whether the camp has been set up (a captain exists / the latch is set). */
export async function getBootstrapState(): Promise<BootstrapState> {
  const db = createHttpDb();
  const [captains] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.rank, "captain"));
  const [settings] = await db
    .select({ bootstrappedAt: campSettings.bootstrappedAt })
    .from(campSettings)
    .limit(1);
  return {
    bootstrappedAt: settings?.bootstrappedAt ?? null,
    captainCount: captains?.count ?? 0,
  };
}

export type BootstrapResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "already-bootstrapped" };

/**
 * Elect the given authenticated user as the first captain, mint the root invite
 * code, and stamp the latch — atomically, only while no captain exists.
 *
 * Concurrency: all attempts serialize behind a `SELECT … FOR UPDATE` on the
 * singleton `camp_settings` row, so exactly one caller can see an unstamped
 * latch and proceed; the rest block, then observe it stamped and return
 * `already-bootstrapped`. A pre-existing captain (e.g. a legacy account that
 * never ran the wizard) is also treated as already set up. Idempotent: a second
 * call after success simply returns `already-bootstrapped`.
 */
export async function bootstrapFirstCaptain(input: {
  authUserId: string;
  displayName: string | null;
  /** The fixed root invite code (e.g. "meowzit"). */
  founderCode: string;
}): Promise<BootstrapResult> {
  const { authUserId, displayName, founderCode } = input;
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      // Serialize every bootstrap attempt on the singleton row: ensure it
      // exists, then lock it for the duration of the transaction.
      await tx
        .insert(campSettings)
        .values({ id: true })
        .onConflictDoNothing({ target: campSettings.id });
      const [locked] = await tx
        .select({ bootstrappedAt: campSettings.bootstrappedAt })
        .from(campSettings)
        .where(eq(campSettings.id, true))
        .for("update");

      // Already set up — by the latch, or by an existing captain.
      const [captains] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.rank, "captain"));
      if (locked?.bootstrappedAt || (captains?.count ?? 0) > 0) {
        return { ok: false as const, reason: "already-bootstrapped" as const };
      }

      // Elect this user the founding captain: promote an existing row, or
      // create one (a non-god first user has no row until now). Approved so they
      // skip the vetting queue; inviteCode = the root code so the invite gate
      // passes while keeping them a clean family-tree root.
      const promoted = await tx
        .update(users)
        .set({ rank: "captain", approvalStatus: "approved", inviteCode: founderCode })
        .where(eq(users.authUserId, authUserId))
        .returning({ id: users.id });
      let userId = promoted[0]?.id;
      if (!userId) {
        const [created] = await tx
          .insert(users)
          .values({
            authUserId,
            displayName,
            rank: "captain",
            approvalStatus: "approved",
            inviteCode: founderCode,
          })
          .returning({ id: users.id });
        userId = created?.id;
      }
      if (!userId) {
        throw new Error("Bootstrap failed to create the founding captain");
      }

      // Mint the root invite code (idempotent — leave an existing one as-is).
      // createdByUserId = NULL keeps the founder a clean family-tree root while
      // members who later redeem it attach beneath the root.
      await tx
        .insert(inviteCodes)
        .values({
          code: founderCode,
          createdByUserId: null,
          note: "Camp root invite (first-time setup)",
          maxUses: null,
          requiresApproval: false,
        })
        .onConflictDoNothing({ target: inviteCodes.code });

      // Stamp the once-only latch.
      await tx
        .update(campSettings)
        .set({
          bootstrappedAt: new Date(),
          bootstrappedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(campSettings.id, true));

      return { ok: true as const, userId };
    });
  } finally {
    await pool.end();
  }
}
