// Words and small shapes the budget and claim screens share (#242). Pure, and
// safe in a browser: it says nothing about who may see what.

import { CLAIM_STATUS_LABELS } from "@camp404/core";
import type { ClaimAccountType, ClaimStatus } from "@camp404/types";

/** A claim's status as a badge. */
export const CLAIM_BADGE: Readonly<
  Record<
    ClaimStatus,
    { label: string; variant: "warning" | "secondary" | "success" | "outline" }
  >
> = {
  submitted: { label: CLAIM_STATUS_LABELS.submitted, variant: "warning" },
  approved: { label: CLAIM_STATUS_LABELS.approved, variant: "secondary" },
  paid: { label: CLAIM_STATUS_LABELS.paid, variant: "success" },
  rejected: { label: CLAIM_STATUS_LABELS.rejected, variant: "outline" },
};

export const ACCOUNT_TYPE_LABELS: Readonly<Record<ClaimAccountType, string>> = {
  sa: "South African bank",
  international: "Bank abroad",
};

/** "Receipt 1 (PDF)" or "Receipt 2 (photo)": the stored file keeps no name. */
export function receiptLabel(index: number, contentType: string): string {
  const kind = contentType === "application/pdf" ? "PDF" : "photo";
  return `Receipt ${index + 1} (${kind})`;
}

/**
 * Who did what to a claim, for the Finance team: "approved by Kit Lead",
 * "approved by Kit Lead; paid". Null while it waits for the team, and for a
 * turned-down claim: its section already says so, and a claim stores one
 * decider, the team's (approver_id), which a claim the Finance team turns
 * down after the team's yes keeps, so naming them could blame the wrong
 * person.
 */
export function decisionLine(claim: {
  status: ClaimStatus;
  approverName: string | null;
}): string | null {
  const who = claim.approverName?.trim() || "someone no longer in the camp";
  switch (claim.status) {
    case "submitted":
      return null;
    case "approved":
      return `approved by ${who}`;
    case "paid":
      return `approved by ${who}; paid`;
    case "rejected":
      return null;
  }
}
