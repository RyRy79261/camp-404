import { z } from "zod";

// The currency the camp keeps money in. Owner's call (2026-09-24):
// "Everything should be in South African rands." A payment, a reimbursement
// claim and a team budget are all in ZAR, and every write path refuses any
// other code, so a total is always a plain rand total. A foreign amount is at
// most a label beside a rand figure (formatForeignEquivalent in
// @camp404/core), never a stored currency. The list lives here, not in
// @camp404/core, because core depends on types. Strict: "zar" or " ZAR" is
// refused, not fixed up.

/** Every currency the camp records money in: rands only. */
export const CURRENCY_CODES = ["ZAR"] as const;

export const Currency = z.enum(CURRENCY_CODES, {
  error: "Money is recorded in rands (ZAR) only.",
});
export type Currency = z.infer<typeof Currency>;
