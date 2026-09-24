import "server-only";

import { del, list } from "@vercel/blob";

// Avatar blob lifecycle. The upload route writes private blobs with
// `addRandomSuffix: true`, so each re-upload leaves the previous object behind;
// account anonymisation nulls `profileImageUrl` but never deletes the object.
// This is the cleanup seam for both — list a member's avatar prefix and delete
// the stale objects. A replaced photo is pruned only once the new one is SAVED
// to the profile (pruneReplacedProfilePhotos), never at upload: an upload the
// member then abandons must not delete the photo their profile still shows. Best-effort: a missing store token is a no-op (E2E / local
// dev), and callers should not let a cleanup failure fail their main operation.
// Questionnaire `image` answers live in nested `answers/<question>/` folders
// under the same prefix — see `questionnaireImageDir` and
// app/api/uploads/questionnaire-image/route.ts.

const PREFIX = (userId: string) => `avatars/${userId}/`;

/**
 * Blob folder holding a member's answer to ONE questionnaire `image` question.
 * Nested under the member's avatar prefix on purpose: `/api/avatar` only serves
 * pathnames under `avatars/`, and account anonymisation sweeps that whole
 * prefix — so an answer is readable and deletable with no extra wiring. The
 * profile-photo cleanup below deliberately skips these nested folders, so a new
 * profile photo no longer destroys a member's image answers (and vice versa).
 */
export function questionnaireImageDir(
  userId: string,
  questionKey: string,
): string {
  return `${PREFIX(userId)}answers/${questionKey}/`;
}

/**
 * Blob-path-safe form of a questionnaire question id (`kitchen.setup_photo` →
 * `kitchen-setup_photo`). The id reaches the upload route from the client, so
 * it is slugged before it can ever become part of a blob path.
 */
export function questionKeySegment(questionId: string): string {
  const slug = questionId
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  return slug || "question";
}

async function pruneBlobs(
  prefix: string,
  keepPathname: string | undefined,
  { flatOnly }: { flatOnly: boolean },
): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // Say so: without the token nothing is deleted, and on the account-erasure
    // path that means a member's photos stay in the store. The upload route
    // refuses loudly in the same state; this must not be the quiet twin.
    console.warn(
      `[avatar-blob] BLOB_READ_WRITE_TOKEN is not set, so blobs under "${prefix}" were not deleted.`,
    );
    return;
  }

  const stale: string[] = [];
  let cursor: string | undefined;
  // Paginate so a member with many orphaned objects is fully cleaned (esp. the
  // delete-all anonymisation path), not just the first page.
  do {
    const page = await list({ prefix, token, cursor });
    for (const b of page.blobs) {
      if (b.pathname === keepPathname) continue;
      // Orphan cleanup stays in the folder it wrote to: anything in a nested
      // sub-folder is a DIFFERENT upload (a questionnaire image answer), not a
      // stale copy of this one.
      if (flatOnly && b.pathname.slice(prefix.length).includes("/")) continue;
      stale.push(b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (stale.length > 0) await del(stale, { token });
}

/**
 * Delete a member's stored avatar blobs. Pass `keepPathname` to retain the
 * just-uploaded object (orphan cleanup on re-upload) — that path prunes only
 * the objects sitting DIRECTLY in the member's folder, leaving questionnaire
 * image answers alone. Omit it to delete everything under the member, nested
 * answers included (account anonymisation). No-op when the Blob token is absent.
 */
export async function deleteAvatarBlobs(
  userId: string,
  keepPathname?: string,
): Promise<void> {
  await pruneBlobs(PREFIX(userId), keepPathname, {
    flatOnly: keepPathname !== undefined,
  });
}

/** The same-origin proxy URL the upload route hands back for a stored photo. */
export function avatarProxyUrl(pathname: string): string {
  return `/api/avatar?pathname=${encodeURIComponent(pathname)}`;
}

/**
 * The blob pathname a saved profile photo URL points at, when it is one of this
 * member's own flat avatar objects. Anything else (another member's path, a
 * nested answer, a foreign URL) is null, so it can never steer a prune.
 */
export function ownProfilePhotoPathname(
  authUserId: string,
  url: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://camp404.invalid");
  } catch {
    return null;
  }
  if (parsed.pathname !== "/api/avatar") return null;
  const pathname = parsed.searchParams.get("pathname");
  if (!pathname?.startsWith(PREFIX(authUserId))) return null;
  if (pathname.slice(PREFIX(authUserId).length).includes("/")) return null;
  return pathname;
}

/**
 * After a profile save commits: delete every photo object sitting directly in
 * the member's folder except the one the profile now points at. A cleared photo
 * keeps none. A saved URL this module did not mint prunes nothing, because we
 * cannot tell which object it means. Best-effort: logs and never throws, since
 * the save already succeeded.
 */
export async function pruneReplacedProfilePhotos(
  authUserId: string,
  savedUrl: string | null,
): Promise<void> {
  const keep = savedUrl ? ownProfilePhotoPathname(authUserId, savedUrl) : null;
  if (savedUrl && !keep) return;
  try {
    await pruneBlobs(PREFIX(authUserId), keep ?? undefined, { flatOnly: true });
  } catch (err) {
    console.error("avatar-cleanup error", err);
  }
}

/**
 * Prune a member's previous answers to one questionnaire image question,
 * keeping the just-uploaded object. Scoped to that question's own folder, so it
 * can never touch the profile photo or another question's answer.
 */
export async function deleteQuestionnaireImageBlobs(
  userId: string,
  questionKey: string,
  keepPathname?: string,
): Promise<void> {
  await pruneBlobs(questionnaireImageDir(userId, questionKey), keepPathname, {
    flatOnly: false,
  });
}

// --- Orphan sweep ------------------------------------------------------------
// Before commit 1f1f16d, account erasure swept `avatars/<camp id>/`, but uploads
// live under `avatars/<auth id>/`, so every member erased then left their photos
// behind. The daily upkeep (lib/background-work.ts, run on a page load) removes any avatar folder whose owner has
// no camp account, so those photos go without anyone running a script, and any
// future leak is cleaned the same way.

/** A blob as the store lists it. */
export interface StoredBlob {
  pathname: string;
  url: string;
  uploadedAt: Date;
}

/**
 * A blob younger than this is never swept, even in an orphan folder: the
 * upload route creates the camp row before it stores the file, but a day of
 * margin costs nothing and rules out any race with a sign-up.
 */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** The id a blob is filed under: `avatars/<id>/…` → `<id>`. */
function avatarOwner(pathname: string): string | null {
  const match = /^avatars\/([^/]+)\//.exec(pathname);
  return match ? match[1]! : null;
}

/**
 * The blobs to delete: under a folder whose id is no live account's auth id,
 * and at least ORPHAN_MIN_AGE_MS old.
 */
export function orphanAvatarBlobs(
  blobs: readonly StoredBlob[],
  liveAuthIds: ReadonlySet<string>,
  now: Date,
): { folders: string[]; urls: string[] } {
  const folders = new Set<string>();
  const urls: string[] = [];
  for (const blob of blobs) {
    const owner = avatarOwner(blob.pathname);
    if (!owner || liveAuthIds.has(owner)) continue;
    if (now.getTime() - blob.uploadedAt.getTime() < ORPHAN_MIN_AGE_MS) continue;
    folders.add(owner);
    urls.push(blob.url);
  }
  return { folders: [...folders], urls };
}

export type OrphanSweepResult =
  | { status: "swept"; folders: number; deleted: number }
  | { status: "not_configured"; message: string }
  | { status: "refused"; message: string };

const DELETE_BATCH = 500;

/**
 * Delete every orphaned avatar blob. `liveAuthIds` must come from the database
 * that holds every member: pointed at a copy that misses recent members (a
 * preview branch), this would delete their photos. The caller runs it only on
 * the production deployment. With no live accounts at all it refuses, because
 * that means the wrong database, not an empty camp.
 */
export async function sweepOrphanAvatarBlobs(
  liveAuthIds: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<OrphanSweepResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      status: "not_configured",
      message: "BLOB_READ_WRITE_TOKEN is not set, so no photos were checked.",
    };
  }
  if (liveAuthIds.size === 0) {
    return {
      status: "refused",
      message: "No live accounts were found, so no photos were deleted.",
    };
  }

  const blobs: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "avatars/", token, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const { folders, urls } = orphanAvatarBlobs(blobs, liveAuthIds, now);
  for (let i = 0; i < urls.length; i += DELETE_BATCH) {
    await del(urls.slice(i, i + DELETE_BATCH), { token });
  }
  return { status: "swept", folders: folders.length, deleted: urls.length };
}
