import "server-only";

import { del, list } from "@vercel/blob";

// A pet's two photos (Camp pets, owner 2026-10-09): private blobs in the
// member's own folder, `pets/<member id>/`, never handed out by their own
// address. They are only for a captain to draw the pet from, so
// /api/pet-photo streams one to the member who sent it and to the captains,
// and to nobody else. Erasure deletes the member's folder. The file checks
// (a JPEG, PNG or WebP by its first bytes, its EXIF stripped) are the proof
// upload's: proofBytesToStore in ./payment-proof.

export function petPhotoFolder(userId: string): string {
  return `pets/${userId}/`;
}

/** The photo route's address for one of a pet's photos. */
export function petPhotoHref(petId: string, side: "front" | "side"): string {
  return `/api/pet-photo/${encodeURIComponent(petId)}/${side}`;
}

/**
 * Delete every pet photo a member uploaded. Best-effort, like the receipts:
 * a missing store token deletes nothing and says so.
 */
export async function deletePetPhotoBlobs(userId: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn(
      "[pet-photos] BLOB_READ_WRITE_TOKEN is not set, so pet photos were not deleted.",
    );
    return;
  }
  const prefix = petPhotoFolder(userId);
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, cursor });
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (urls.length > 0) await del(urls, { token });
}
