import "server-only";

import type { MoneyTotal, PaymentStatus } from "@camp404/core";
import { currentCycleNumber as dbCurrentCycleNumber } from "@camp404/db/cycles";
import {
  ensureMemberRefCode as dbEnsureMemberRefCode,
  listPayments as dbListPayments,
  receivedTotalsByCurrency as dbReceivedTotalsByCurrency,
  recordPayment as dbRecordPayment,
  setPaymentStatus as dbSetPaymentStatus,
  type PaymentRow,
  type RecordPaymentInput,
} from "@camp404/db/payments";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Payments ledger facade. Routes through `@camp404/db/payments` normally, and
// through the in-memory test store's ledger twin under E2E_TEST_MODE, so
// Playwright can drive the payments screen and the Overview's "Dues paid".
// Every caller is captain-gated; this module gates nothing.

export type { PaymentRow };

interface PaymentsBackend {
  currentCycleNumber(): Promise<number>;
  ensureMemberRefCode(userId: string): Promise<string | null>;
  listPayments(cycle: number): Promise<PaymentRow[]>;
  recordPayment(
    input: RecordPaymentInput,
  ): Promise<{ id: string; reference: string }>;
  setPaymentStatus(input: {
    paymentId: string;
    from: PaymentStatus;
    to: PaymentStatus;
    actorId: string;
  }): Promise<boolean>;
  receivedTotalsByCurrency(cycle: number): Promise<MoneyTotal[]>;
}

// Each entry calls through at CALL time, so a unit test's vi.mock of the db
// module still intercepts it.
const realBackend: PaymentsBackend = {
  currentCycleNumber: () => dbCurrentCycleNumber(),
  ensureMemberRefCode: (userId) => dbEnsureMemberRefCode(userId),
  listPayments: (cycle) => dbListPayments(cycle),
  recordPayment: (input) => dbRecordPayment(input),
  setPaymentStatus: (input) => dbSetPaymentStatus(input),
  receivedTotalsByCurrency: (cycle) => dbReceivedTotalsByCurrency(cycle),
};

const testBackend: PaymentsBackend = {
  async currentCycleNumber() {
    return testStore.currentCycleNumber();
  },
  async ensureMemberRefCode(userId) {
    return testStore.ensureMemberRefCode(userId);
  },
  async listPayments(cycle) {
    return testStore.listPayments(cycle);
  },
  async recordPayment(input) {
    return testStore.recordPayment(input);
  },
  // The store keeps no audit log, so the captain's id stops here.
  async setPaymentStatus({ paymentId, from, to }) {
    return testStore.setPaymentStatus({ paymentId, from, to });
  },
  async receivedTotalsByCurrency(cycle) {
    return testStore.receivedTotalsByCurrency(cycle);
  },
};

function backend(): PaymentsBackend {
  return usesTestStore() ? testBackend : realBackend;
}

/** The burn year the ledger records into and reads by default. */
export function ledgerCycle(): Promise<number> {
  return backend().currentCycleNumber();
}

/**
 * The member's own payment reference, for their profile. Given out the first
 * time it is needed.
 */
export function getMemberRefCode(userId: string): Promise<string | null> {
  return backend().ensureMemberRefCode(userId);
}

/** Every payment in one burn year, newest first. */
export function listPayments(cycle: number): Promise<PaymentRow[]> {
  return backend().listPayments(cycle);
}

/** Record a payment for this year. Refuses an unknown currency. */
export function recordPayment(
  input: RecordPaymentInput,
): Promise<{ id: string; reference: string }> {
  return backend().recordPayment(input);
}

/** Compare-and-set on the status the captain saw: false when it had moved. */
export function setPaymentStatus(input: {
  paymentId: string;
  from: PaymentStatus;
  to: PaymentStatus;
  actorId: string;
}): Promise<boolean> {
  return backend().setPaymentStatus(input);
}

/** Money received in one year, one total per currency, no FX. */
export function receivedTotalsByCurrency(cycle: number): Promise<MoneyTotal[]> {
  return backend().receivedTotalsByCurrency(cycle);
}
