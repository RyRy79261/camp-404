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
 * authoritative step and must not be undone by a blob-store hiccup. A refused
 * erasure (the camp's last captain) wrote nothing, so it takes no blobs with
 * it either.
 */
export async function deleteAccount(userId: string): Promise<SanitiseResult> {
  if (isE2ETestMode()) return { ok: true, lostCatNumber: 0 };
  const result = await sanitiseAccount(userId);
  if (!result.ok) return result;
  try {
    await deleteAvatarBlobs(userId);
  } catch (err) {
    console.error("avatar-cleanup error (account erasure)", err);
  }
  return result;
}
