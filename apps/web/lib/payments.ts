import "server-only";

import { ensureMemberRefCode } from "@camp404/db/payments";
import { isE2ETestMode } from "./test-mode";

/**
 * The member's own payment reference, for their profile. Given out the first
 * time it is needed. The E2E store keeps no ledger, so a test profile shows
 * none.
 */
export async function getMemberRefCode(userId: string): Promise<string | null> {
  if (isE2ETestMode()) return null;
  return ensureMemberRefCode(userId);
}
