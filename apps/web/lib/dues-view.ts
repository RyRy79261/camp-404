// Words and small shapes the dues screens share (#240). Pure, and safe in a
// browser: it says nothing about who may see what.

import { formatMoney, type DuesBalance } from "@camp404/core";
import type { ParticipationStatus, PaymentMethod } from "@camp404/types";

const DAY = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Rands as a person would type them back: "1250" or "1250,50". */
export function typedRands(cents: number): string {
  return cents % 100 === 0
    ? String(cents / 100)
    : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** A YYYY-MM-DD day as "15 Jan 2027". */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : DAY.format(date);
}

/** The balance in one line, the way a member reads it. */
export function balanceSentence(balance: DuesBalance): string {
  if (balance.balanceCents > 0) {
    return `You owe ${formatMoney(balance.balanceCents)}.`;
  }
  if (balance.balanceCents < 0) {
    return `The camp owes you ${formatMoney(-balance.balanceCents)}.`;
  }
  return balance.chargedCents > 0 ? "You're paid up." : "Nothing to pay yet.";
}

/** The balance as a short label for a table cell. */
export function balanceLabel(balance: DuesBalance): {
  text: string;
  tone: "owes" | "clear" | "credit" | "none";
} {
  if (balance.balanceCents > 0) {
    return { text: formatMoney(balance.balanceCents), tone: "owes" };
  }
  if (balance.balanceCents < 0) {
    return {
      text: `${formatMoney(-balance.balanceCents)} to give back`,
      tone: "credit",
    };
  }
  return balance.chargedCents > 0
    ? { text: "Paid up", tone: "clear" }
    : { text: "Nothing charged", tone: "none" };
}

/**
 * Where someone stands this year, in a few words. "Coming" is the member's own
 * answer; "Accepted" and "Waiting list" are the captains' decision (owner,
 * 2026-09-28: never mix them in one label).
 */
export const PLACE_WORDS: Readonly<Record<ParticipationStatus, string>> = {
  applied: "Says coming",
  maybe: "Says maybe",
  accepted: "Accepted",
  waitlisted: "Waiting list",
  not_attending: "Says not coming",
};

/** How a member says they paid, for the proof form's picker. */
export const METHOD_CHOICES: readonly {
  value: PaymentMethod;
  label: string;
}[] = [
  { value: "bank_transfer", label: "Bank transfer (EFT)" },
  { value: "international_transfer", label: "International transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Something else" },
];

/** Who put a payment on the ledger, as the Finance team reads it. */
export const SOURCE_WORDS = {
  captain: "Recorded by hand",
  member: "Sent in by the member",
  statement: "From the bank statement",
} as const;
