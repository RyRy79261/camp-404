import "server-only";

import { del, list } from "@vercel/blob";

// Avatar blob lifecycle. The upload route writes private blobs with
// `addRandomSuffix: true`, so each re-upload leaves the previous object behind;
// account anonymisation nulls `profileImageUrl` but never deletes the object.
// This is the cleanup seam for both — list a member's avatar prefix and delete
// the stale objects. Best-effort: a missing store token is a no-op (E2E / local
// dev), and callers should not let a cleanup failure fail their main operation.

const PREFIX = (userId: string) => `avatars/${userId}/`;

/**
 * Delete a member's stored avatar blobs. Pass `keepPathname` to retain the
 * just-uploaded object (orphan cleanup on re-upload); omit it to delete them all
 * (account anonymisation). No-op when the Blob store token is absent.
 */
export async function deleteAvatarBlobs(
  userId: string,
  keepPathname?: string,
): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;

  const prefix = PREFIX(userId);
  const stale: string[] = [];
  let cursor: string | undefined;
  // Paginate so a member with many orphaned objects is fully cleaned (esp. the
  // delete-all anonymisation path), not just the first page.
  do {
    const page = await list({ prefix, token, cursor });
    for (const b of page.blobs) {
      if (b.pathname !== keepPathname) stale.push(b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (stale.length > 0) await del(stale, { token });
}
