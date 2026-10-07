import {
  formatForeignAmount,
  formatMoney,
  parseMoneyToMinor,
  sumMinor,
} from "@camp404/core";
import type { JoinFeeTier } from "@camp404/types";

// The fee's money, by the camp's own rules (@camp404/core money: rands only,
// whole cents, one formatter, a dollar figure only as a label at the rate a
// captain typed). The site's content holds whole rands (a tier, a line of
// where it goes); the calculator works in cents.

/** Whole rands from the site's content, as cents. */
export function randsToMinor(rands: number): number {
  return Math.round(rands) * 100;
}

/** Cents as the site shows them: "R 3 500" (the camp's one formatter). */
export function formatRandsMinor(minor: number): string {
  return formatMoney(minor, "ZAR", { wholeRands: true });
}

/** Whole rands from the content, shown the same way. */
export function formatRands(rands: number): string {
  return formatRandsMinor(randsToMinor(rands));
}

/** A rand amount's dollar label at the rate a captain typed: "≈ US$218.75". */
export function formatUsdLabel(minor: number, randsPerDollar: number): string {
  return `≈ ${formatForeignAmount({
    amountZarMinor: minor,
    currency: "USD",
    ratePerUnit: randsPerDollar,
  })}`;
}

/**
 * What a visitor typed, in cents, read by the camp's one parser ("15 000",
 * "15000,50", "R15000"). Blank is nothing; text that is not an amount counts
 * as nothing too, and says so, so the box can ask for it again.
 */
export function readAmount(text: string): { minor: number; unread: boolean } {
  if (text.trim() === "") return { minor: 0, unread: false };
  const minor = parseMoneyToMinor(text);
  return minor === null ? { minor: 0, unread: true } : { minor, unread: false };
}

/** What is left for the camp fee once the other costs are paid, in cents. */
export function feeFromBudget(
  budgetMinor: number,
  costsMinor: number[],
): number {
  return Math.max(0, budgetMinor - sumMinor(costsMinor));
}

/** The highest tier an amount in cents reaches, or undefined below the first. */
export function tierFor(
  minor: number,
  tiers: readonly JoinFeeTier[],
): JoinFeeTier | undefined {
  let reached: JoinFeeTier | undefined;
  for (const t of tiers) if (minor >= randsToMinor(t.rands)) reached = t;
  return reached;
}
