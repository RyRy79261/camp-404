import "server-only";

import {
  consumeInviteCode as dbConsumeInviteCode,
  type AssignedRank,
} from "@camp404/db/invite-codes";
import { normalizeInviteCode } from "@camp404/core";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

export interface ClaimedInvite {
  code: string;
  assignedRank: AssignedRank | null;
  /** Redeemer must be vetted by a captain before access. Env codes: false. */
  requiresApproval: boolean;
}

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
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  if (isEnvCode(normalized))
    return { code: normalized, assignedRank: null, requiresApproval: false };
  const consumed = await consumeDbCode(normalized);
  if (!consumed) return null;
  return {
    code: normalized,
    assignedRank: consumed.assignedRank,
    requiresApproval: consumed.requiresApproval,
  };
}

function isEnvCode(code: string): boolean {
  return csv(process.env.INVITE_CODES).map(normalizeInviteCode).includes(code);
}

async function consumeDbCode(code: string) {
  if (isE2ETestMode()) {
    return testStore.consumeInviteCode(code);
  }
  return dbConsumeInviteCode(code);
}
