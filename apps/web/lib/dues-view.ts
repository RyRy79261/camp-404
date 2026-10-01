// Words and small shapes the dues screens share (#240). Pure, and safe in a
// browser: it says nothing about who may see what.

import {
  campDayKey,
  CHARGE_KIND_LABELS,
  formatMoney,
  type DuesBalance,
  type PaymentStatus,
} from "@camp404/core";
import type {
  ChargeKind,
  ParticipationStatus,
  PaymentMethod,
  PaymentSource,
} from "@camp404/types";

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

/**
 * True while the member still owes money that no proof they sent covers: the
 * proof form stays open. Paid up, or a proof for the rest being checked, and
 * it folds to a "Send another proof" button.
 */
export function owesMoreThanSent(balance: DuesBalance): boolean {
  return balance.balanceCents - balance.pendingCents > 0;
}

/**
 * The small line under a charge: its kind, unless the description already
 * says it ("Camp fee: Base" over "Camp fee"), and the day it was charged.
 */
export function chargeSubline(charge: {
  kind: ChargeKind;
  description: string;
  createdAt: Date;
}): string {
  const kind = CHARGE_KIND_LABELS[charge.kind];
  const day = `charged ${formatDay(campDayKey(charge.createdAt))}`;
  return charge.description.toLowerCase().startsWith(kind.toLowerCase())
    ? day.charAt(0).toUpperCase() + day.slice(1)
    : `${kind} · ${day}`;
}

/**
 * A payment's state in words. The member reads "Being checked" and
 * "Received". The Finance team uses one vocabulary on every tab: "In the
 * bank" (money seen), "Excused" (waived: settles dues, brings in nothing),
 * "To check" (a member sent proof) and "Promised" (recorded by hand, not in
 * the bank yet).
 */
export const PAYMENT_STATUS_WORDS = {
  member: {
    pending: { label: "Being checked", variant: "warning" },
    reconciled: { label: "Received", variant: "success" },
    waived: { label: "Excused", variant: "secondary" },
  },
} as const;

export function financeStatusWords(
  status: PaymentStatus,
  source: PaymentSource,
): { label: string; variant: "warning" | "success" | "secondary" } {
  if (status === "reconciled")
    return { label: "In the bank", variant: "success" };
  if (status === "waived") return { label: "Excused", variant: "secondary" };
  return source === "member"
    ? { label: "To check", variant: "warning" }
    : { label: "Promised", variant: "warning" };
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
  applied: "Coming",
  maybe: "Maybe",
  accepted: "Accepted",
  waitlisted: "Waiting list",
  not_attending: "Not coming",
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
