import "server-only";

import { sanitiseAccount, type SanitiseResult } from "@camp404/db/account";
import { deleteAvatarBlobs } from "./avatar-blob";
import { isE2ETestMode } from "./test-mode";

/**
 * Erase a member's account (anonymise to a "Lost Cat #N" stub). No-op under
 * E2E test mode (no DB) — account erasure isn't exercised by Playwright.
 *
 * Anonymisation nulls `profileImageUrl` in the DB but the avatar blob object
 * outlives the row, so delete it here too. Best-effort: the DB scrub is the
 * authoritative step and must not be undone by a blob-store hiccup.
 */
export async function deleteAccount(userId: string): Promise<SanitiseResult> {
  if (isE2ETestMode()) return { lostCatNumber: 0 };
  const result = await sanitiseAccount(userId);
  try {
    await deleteAvatarBlobs(userId);
  } catch (err) {
    console.error("avatar-cleanup error (account erasure)", err);
  }
  return result;
}
