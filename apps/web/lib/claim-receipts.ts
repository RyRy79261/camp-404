import "server-only";

import { del, list } from "@vercel/blob";

// A claim's receipt files (#242), stored like proof of payment (#240):
// private blobs in the member's own folder, `claim-receipts/<member id>/`,
// never handed out by their own address. /api/claim-receipt streams one to
// the member and to the Finance team, and records every other person's read.
// Erasure deletes the member's folder. The file checks (a PDF, JPEG, PNG or
// WebP by its first bytes) are the proof upload's: proofBytesMatch and
// proofExtension in ./payment-proof.

export function claimReceiptFolder(userId: string): string {
  return `claim-receipts/${userId}/`;
}

/**
 * Delete every receipt a member uploaded. Best-effort, like the proof files:
 * a missing store token deletes nothing and says so.
 */
export async function deleteClaimReceiptBlobs(userId: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn(
      "[claim-receipts] BLOB_READ_WRITE_TOKEN is not set, so receipt files were not deleted.",
    );
    return;
  }
  const prefix = claimReceiptFolder(userId);
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, cursor });
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (urls.length > 0) await del(urls, { token });
}
