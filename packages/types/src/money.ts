import { z } from "zod";

// The currencies the camp takes money in (#237). Members pay from several
// countries, so a payment, a reimbursement claim and a team budget each say
// which currency they are in, and totals are never added across currencies.
// The list lives here, not in @camp404/core, because core depends on types.
// Codes are strict ISO 4217: "zar" or " ZAR" is refused, not fixed up.

/** Every currency the camp handles, ZAR (the default) first. */
export const CURRENCY_CODES = ["ZAR", "USD", "EUR"] as const;

export const Currency = z.enum(CURRENCY_CODES, {
  error: "Currency must be ZAR, USD or EUR.",
});
export type Currency = z.infer<typeof Currency>;
