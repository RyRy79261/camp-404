import "server-only";

import {
  consumeInviteCode as dbConsumeInviteCode,
  type AssignedRank,
} from "@camp404/db/invite-codes";
import { normalizeInviteCode } from "@camp404/core";
import { envList, MIN_PREAPPROVED_ENV_CODE_LENGTH } from "./integration-config";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

export interface ClaimedInvite {
  code: string;
  assignedRank: AssignedRank | null;
  /**
   * Redeemer must be vetted by a captain before access. Env codes: only when
   * shorter than MIN_PREAPPROVED_ENV_CODE_LENGTH.
   */
  requiresApproval: boolean;
}

export { MIN_PREAPPROVED_ENV_CODE_LENGTH };

/**
 * Returns true if the given email address is in GOD_EMAILS (case-insensitive).
 * God accounts bypass the invite-code requirement.
 */
export function isGodEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = envList(process.env.GOD_EMAILS).map((e) => e.toLowerCase());
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
  if (isEnvCode(normalized)) {
    const requiresApproval =
      normalized.length < MIN_PREAPPROVED_ENV_CODE_LENGTH;
    if (requiresApproval) {
      console.warn(
        `[invite] an INVITE_CODES value shorter than ${MIN_PREAPPROVED_ENV_CODE_LENGTH} characters was redeemed; the member needs a captain's approval.`,
      );
    }
    return { code: normalized, assignedRank: null, requiresApproval };
  }
  const consumed = await consumeDbCode(normalized);
  if (!consumed) return null;
  return {
    code: normalized,
    assignedRank: consumed.assignedRank,
    requiresApproval: consumed.requiresApproval,
  };
}

function isEnvCode(code: string): boolean {
  return envList(process.env.INVITE_CODES)
    .map(normalizeInviteCode)
    .includes(code);
}

async function consumeDbCode(code: string) {
  if (usesTestStore()) {
    return testStore.consumeInviteCode(code);
  }
  return dbConsumeInviteCode(code);
}
