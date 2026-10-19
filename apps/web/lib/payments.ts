import "server-only";

import * as cycles from "@camp404/db/cycles";
import * as db from "@camp404/db/payments";
import type { PaymentRow } from "@camp404/db/payments";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Payments ledger facade. Routes through `@camp404/db/payments` normally, and
// through the in-memory test store's ledger twin under E2E_TEST_MODE, so
// Playwright can drive the payments screen and the Overview's "Dues paid".
// Every caller gates on the Finance rule first (captains and Finance leads);
// the writes check it again themselves and throw MoneyRefused. The rules the
// two sides share (the input checks, in order) are `checkPaymentInput` in
// @camp404/core; lib/__tests__/payments-agreement.test.ts holds them equal.

export type { PaymentRow };

const ledger = twin(db, testStore, [
  "ensureMemberRefCode",
  "listPayments",
  "recordPayment",
  "setPaymentStatus",
  "receivedTotal",
]);
const year = twin(cycles, testStore, ["currentCycleNumber"]);

/** The burn year the ledger records into and reads by default. */
export const ledgerCycle = year.currentCycleNumber;

/**
 * The member's own payment reference, for their profile. Given out the first
 * time it is needed.
 */
export const getMemberRefCode = ledger.ensureMemberRefCode;

/** Every payment in one burn year, newest first. */
export const listPayments = ledger.listPayments;

/**
 * Record a payment for this year. Refuses any currency but ZAR, and throws
 * MoneyRefused for anyone but the Finance team (or a member's own pending
 * payment with a proof file).
 */
export const recordPayment = ledger.recordPayment;

/** Compare-and-set on the status the captain saw: false when it had moved. */
export const setPaymentStatus = ledger.setPaymentStatus;

/** Rands received in one year, in cents. */
export const receivedTotal = ledger.receivedTotal;
