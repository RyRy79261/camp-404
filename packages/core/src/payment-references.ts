// Payment references (owner's call, 2026-09-16: a full payments ledger with
// amounts and references). The app never moves money. A member pays the camp
// by EFT and quotes their member reference; a captain matches the bank
// statement against the ledger and records the payment.
//
// Two kinds of reference:
// - A member reference, stable for life: `C404-M017`.
// - A payment reference, one per ledger row: `C404-M017-2027-1`, the member's
//   reference, the burn year, and that member's payment count that year.
//
// Camp 404 is one camp, so the prefix is a constant rather than something
// derived from a camp name the config does not hold. Pure.

/** The prefix every Camp 404 reference starts with. */
export const MEMBER_REF_PREFIX = "C404";

const MEMBER_REF = /^C404-M(\d{3,})$/;

/** `formatMemberRefCode(17)` → `"C404-M017"`. 1-based, at least 3 digits. */
export function formatMemberRefCode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("A member reference sequence must be a positive integer.");
  }
  return `${MEMBER_REF_PREFIX}-M${String(sequence).padStart(3, "0")}`;
}

/** The sequence inside a member reference, or null when it is not one. */
export function memberRefSequence(code: string): number | null {
  const match = MEMBER_REF.exec(code);
  return match?.[1] ? Number(match[1]) : null;
}

/** `paymentReference("C404-M017", 2027, 2)` → `"C404-M017-2027-2"`. */
export function paymentReference(
  memberRefCode: string,
  year: number,
  count: number,
): string {
  if (memberRefSequence(memberRefCode) === null) {
    throw new Error(`Not a member reference: ${memberRefCode}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("A payment count must be a positive integer.");
  }
  return `${memberRefCode}-${year}-${count}`;
}

/** The ledger statuses, in the order a payment usually moves through them. */
export const PAYMENT_STATUSES = ["pending", "reconciled", "waived"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A payment counts toward "dues paid" once it is seen in the bank or waived. */
export function paymentSettlesDues(status: PaymentStatus): boolean {
  return status === "reconciled" || status === "waived";
}

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
});

/** Cents as rands, the way a South African reads them: `R 1 250,00`. */
export function formatRands(amountCents: number): string {
  return zar.format(amountCents / 100);
}

/**
 * Rands typed by a captain ("1250", "1 250,50", "R1250.5") as whole cents,
 * or null when it is not an amount. At most two decimals, never negative.
 */
export function parseRandsToCents(input: string): number | null {
  const cleaned = input.replace(/^\s*R\s*/i, "").replace(/[\s ]/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
