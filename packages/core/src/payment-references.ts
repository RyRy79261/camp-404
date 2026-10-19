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

import { isCurrency, UnknownCurrencyError } from "./money";

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

/**
 * The ledger's own checks on a payment to record, before any read or write,
 * in the order recordPayment applies them: any currency but ZAR throws
 * UnknownCurrencyError, then an amount that is not whole, non-negative cents
 * throws. The database's recordPayment and the E2E store's both call this.
 */
export function checkPaymentInput(input: {
  currency: unknown;
  amountCents: number;
}): void {
  if (!isCurrency(input.currency)) {
    throw new UnknownCurrencyError(input.currency);
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new Error(
      "recordPayment: the amount must be whole cents, not negative",
    );
  }
}

/**
 * Whether a payment a MEMBER puts on the ledger (`source: "member"`) may go
 * on: only their own, and only pending (it waits for a proof check). False
 * refuses it with the Finance team's sentence. A payment from any other
 * source passes here and is held to the Finance rule (MONEY_KEEPER) instead.
 */
export function memberPaymentAllowed(input: {
  source?: string;
  userId: string;
  recordedByUserId: string;
  status: PaymentStatus;
}): boolean {
  if ((input.source ?? "captain") !== "member") return true;
  return input.recordedByUserId === input.userId && input.status === "pending";
}
