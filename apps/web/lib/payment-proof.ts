import "server-only";

import { del, list } from "@vercel/blob";
import { PROOF_TYPES } from "./dues-copy";
import { stripImageMetadata } from "./image-metadata";

// Proof-of-payment files (#240). Private blobs under `payment-proofs/<member
// id>/`, never handed out by their own address: /api/payment-proof streams
// one to its member and to the Finance team, and records every other
// person's read. Erasure deletes the member's folder.

export function proofFolder(userId: string): string {
  return `payment-proofs/${userId}/`;
}

/**
 * Whether a file's first bytes are what its type says: a PDF, a JPEG, a PNG
 * or a WebP. The browser's type is only a claim.
 */
export function proofBytesMatch(type: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (type) {
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      return (
        starts(0x52, 0x49, 0x46, 0x46) && // RIFF
        head[8] === 0x57 &&
        head[9] === 0x45 &&
        head[10] === 0x42 &&
        head[11] === 0x50 // WEBP
      );
    default:
      return false;
  }
}

/**
 * The bytes to store for a proof or a receipt: a PDF as it came, a photo
 * without its EXIF, XMP and comments (lib/image-metadata.ts), so a phone's GPS
 * position does not reach the Finance team's store. Null when the first bytes
 * are not what the type says, or the photo is not well formed.
 */
export function proofBytesToStore(
  type: string,
  bytes: Uint8Array,
): Uint8Array | null {
  if (!proofBytesMatch(type, bytes.subarray(0, 16))) return null;
  return type === "application/pdf" ? bytes : stripImageMetadata(type, bytes);
}

/** The file extension for a proof type the upload takes, or null. */
export function proofExtension(type: string): string | null {
  return Object.hasOwn(PROOF_TYPES, type) ? PROOF_TYPES[type]! : null;
}

/**
 * Delete every proof file a member uploaded. Best-effort, like the avatar
 * cleanup: a missing store token deletes nothing and says so.
 */
export async function deletePaymentProofBlobs(userId: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn(
      "[payment-proof] BLOB_READ_WRITE_TOKEN is not set, so proof files were not deleted.",
    );
    return;
  }
  const prefix = proofFolder(userId);
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, cursor });
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (urls.length > 0) await del(urls, { token });
}
