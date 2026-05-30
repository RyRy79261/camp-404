import "server-only";

import { sanitiseAccount, type SanitiseResult } from "@camp404/db/account";
import { isE2ETestMode } from "./test-mode";

/**
 * Erase a member's account (anonymise to a "Lost Cat #N" stub). No-op under
 * E2E test mode (no DB) — account erasure isn't exercised by Playwright.
 */
export async function deleteAccount(userId: string): Promise<SanitiseResult> {
  if (isE2ETestMode()) return { lostCatNumber: 0 };
  return sanitiseAccount(userId);
}
