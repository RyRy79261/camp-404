import "server-only";

import {
  consumeInviteCode as dbConsumeInviteCode,
  findUsableInviteCode as dbFindUsableInviteCode,
  type AssignedRank,
} from "@camp404/db/invite-codes";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

export interface ClaimedInvite {
  code: string;
  assignedRank: AssignedRank | null;
  /** Redeemer must be vetted by a captain before access. Env codes: false. */
  requiresApproval: boolean;
}

// Name of the HttpOnly cookie that proves a user redeemed an invite code on
// `/signup` before being sent to Stack's sign-up UI. Read on the first
// authenticated request to copy the code onto the camp user row, then
// cleared.
export const INVITE_COOKIE = "camp404_invite";

// Cookie lifetime — long enough to survive the OAuth round trip and a
// distracted user finishing email verification, short enough that a stale
// cookie isn't useful indefinitely.
export const INVITE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2; // 2 hours

function csv(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns true if the given email address is in GOD_EMAILS (case-insensitive).
 * God accounts bypass the invite-code requirement.
 */
export function isGodEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = csv(process.env.GOD_EMAILS).map((e) => e.toLowerCase());
  return list.includes(email.toLowerCase());
}

/**
 * Non-consuming validity check. Returns true if the code matches either:
 *   - the INVITE_CODES env list (bootstrap codes, unlimited uses), or
 *   - an unrevoked, unexpired DB row with capacity remaining.
 *
 * Use this at `/signup` to decide whether to set the cookie. Don't use it
 * as the source of truth for granting account access — race against other
 * redeemers means a code that's valid here may be exhausted by the time
 * the user finishes Neon Auth signup. `redeemInviteCode` is the authoritative
 * "claim this code" call.
 */
export async function isValidInviteCode(code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (isEnvCode(trimmed)) return true;
  return !!(await findUsableDbCode(trimmed));
}

/**
 * Atomically claim a code. For env codes (unlimited bootstrap) this is a
 * pure validity check and never assigns a rank. For DB codes this
 * increments `use_count` inside a single UPDATE so two concurrent
 * redeemers can't both succeed on the last remaining use; the returned
 * row carries any `assignedRank` the code stamps onto its redeemer.
 * Returns null on failure (invalid, expired, revoked, exhausted, or
 * race-loser).
 */
export async function claimInviteCode(
  code: string,
): Promise<ClaimedInvite | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (isEnvCode(trimmed))
    return { code: trimmed, assignedRank: null, requiresApproval: false };
  const consumed = await consumeDbCode(trimmed);
  if (!consumed) return null;
  return {
    code: trimmed,
    assignedRank: consumed.assignedRank,
    requiresApproval: consumed.requiresApproval,
  };
}

function isEnvCode(code: string): boolean {
  return csv(process.env.INVITE_CODES).includes(code);
}

async function findUsableDbCode(code: string) {
  if (isE2ETestMode()) {
    return testStore.findUsableInviteCode(code);
  }
  return dbFindUsableInviteCode(code);
}

async function consumeDbCode(code: string) {
  if (isE2ETestMode()) {
    return testStore.consumeInviteCode(code);
  }
  return dbConsumeInviteCode(code);
}
