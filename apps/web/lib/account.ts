import "server-only";

import { errorLogText } from "@camp404/core";
import * as account from "@camp404/db/account";
import type { SanitiseResult } from "@camp404/db/account";
import { deleteAvatarBlobs } from "./avatar-blob";
import { deleteClaimReceiptBlobs } from "./claim-receipts";
import { deletePaymentProofBlobs } from "./payment-proof";
import { deletePetPhotoBlobs } from "./pet-photos";
import { deleteReportScreenshotBlobs } from "./report-screenshots";
import { isE2ETestMode, usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The erasure itself, from the database or, under E2E, the test store, which
// erases what it holds the same way (lib/__tests__/account-agreement.test.ts).
// Who may leave is canLeaveCamp and the stub's name lostCatName, both in
// @camp404/core. The store keeps its files in memory, so it has no blob
// folders to sweep afterwards.
const erasure = twin(
  {
    sanitiseAccount: (userId: string) => account.sanitiseAccount(userId),
    sweepBlobs: (input: { userId: string; authUserId: string }) =>
      sweepBlobs(input),
  },
  {
    sanitiseAccount: (userId: string) => testStore.sanitiseAccount(userId),
    sweepBlobs: (_input: { userId: string; authUserId: string }) => undefined,
  },
  ["sanitiseAccount", "sweepBlobs"],
);

/**
 * Erase a member's account (anonymise to a "Lost Cat #N" stub). Under E2E with
 * the test store it erases the store's rows the same way; in the real-database
 * E2E run (no blob store, nothing a spec drives) it does nothing.
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
  if (isE2ETestMode() && !usesTestStore()) {
    return { ok: true, lostCatNumber: 0 };
  }
  const result = await erasure.sanitiseAccount(input.userId);
  if (!result.ok) return result;
  await erasure.sweepBlobs(input);
  return result;
}

/** Every blob folder an erased member leaves, each best-effort. */
async function sweepBlobs(input: {
  userId: string;
  authUserId: string;
}): Promise<void> {
  try {
    await deleteAvatarBlobs(input.authUserId);
  } catch (err) {
    console.error("avatar-cleanup error (account erasure)", err);
  }
  // Proof-of-payment files are filed under the camp id (#240), and the row
  // that pointed at each one is already cleared.
  try {
    await deletePaymentProofBlobs(input.userId);
  } catch (err) {
    console.error("payment-proof cleanup error (account erasure)", err);
  }
  // So are a claim's receipts (#242); their rows are already gone.
  try {
    await deleteClaimReceiptBlobs(input.userId);
  } catch (err) {
    console.error("claim-receipt cleanup error (account erasure)", err);
  }
  // And the screenshots they attached to bug reports (#313), filed under the
  // camp id; their rows went with the erasure's transaction.
  try {
    await deleteReportScreenshotBlobs(input.userId);
  } catch (err) {
    console.error("report-screenshot cleanup error (account erasure)", err);
  }
  // And their pets' photos (Camp pets), filed under the camp id; the pets'
  // rows went with the erasure's transaction.
  try {
    await deletePetPhotoBlobs(input.userId);
  } catch (err) {
    console.error(
      "pet-photo cleanup error (account erasure)",
      errorLogText(err, process.env),
    );
  }
}
