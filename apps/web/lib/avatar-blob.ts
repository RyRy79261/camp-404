import "server-only";

import { del, list } from "@vercel/blob";

// Avatar blob lifecycle. The upload route writes private blobs with
// `addRandomSuffix: true`, so each re-upload leaves the previous object behind;
// account anonymisation nulls `profileImageUrl` but never deletes the object.
// This is the cleanup seam for both — list a member's avatar prefix and delete
// the stale objects. Best-effort: a missing store token is a no-op (E2E / local
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
  if (!token) return;

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
