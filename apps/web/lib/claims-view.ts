// Words and small shapes the budget and claim screens share (#242). Pure, and
// safe in a browser: it says nothing about who may see what.

import {
  CLAIM_STATUS_LABELS,
  formatMoney,
  type BudgetTotals,
} from "@camp404/core";
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
  reconciled: { label: CLAIM_STATUS_LABELS.reconciled, variant: "success" },
  rejected: { label: CLAIM_STATUS_LABELS.rejected, variant: "outline" },
};

export const ACCOUNT_TYPE_LABELS: Readonly<Record<ClaimAccountType, string>> = {
  sa: "South African bank",
  international: "Bank abroad",
};

/** "R 300,00 of R 1 000,00 spent", or what there is without a budget. */
export function budgetHeadline(totals: BudgetTotals): string {
  if (totals.budgetCents === null) {
    return totals.spentCents > 0
      ? `${formatMoney(totals.spentCents)} spent, no budget set`
      : "No budget set yet";
  }
  return `${formatMoney(totals.spentCents)} of ${formatMoney(totals.budgetCents)} spent`;
}

/** "R 700,00 left", "R 50,00 over", or null without a budget. */
export function budgetLeftLine(totals: BudgetTotals): string | null {
  if (totals.leftCents === null) return null;
  return totals.leftCents < 0
    ? `${formatMoney(-totals.leftCents)} over`
    : `${formatMoney(totals.leftCents)} left`;
}

/** "2 claims waiting (R 150,00)", or null with none. */
export function waitingLine(totals: BudgetTotals): string | null {
  if (totals.waitingCount === 0) return null;
  const claims =
    totals.waitingCount === 1 ? "1 claim" : `${totals.waitingCount} claims`;
  return `${claims} waiting for a yes (${formatMoney(totals.waitingCents)})`;
}
