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
 *
 * The blobs are filed under the member's NEON AUTH id (the upload routes use
 * the session user's id), not the camp `users.id`. Sweeping the camp id found
 * an empty folder, so erasure left every photo and image answer behind. And
 * after erasure nothing links the folder to the member, because
 * `authUserId` is rewritten to `deleted:<id>`. So the caller passes the auth
 * id it holds from the session.
 */
export async function deleteAccount(input: {
  userId: string;
  authUserId: string;
}): Promise<SanitiseResult> {
  if (isE2ETestMode()) return { ok: true, lostCatNumber: 0 };
  const result = await sanitiseAccount(input.userId);
  if (!result.ok) return result;
  try {
    await deleteAvatarBlobs(input.authUserId);
  } catch (err) {
    console.error("avatar-cleanup error (account erasure)", err);
  }
  return result;
}
