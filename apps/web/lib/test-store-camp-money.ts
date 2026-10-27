import "server-only";

import {
  BALANCE_CHANGED,
  BANK_DETAILS_CHANGED,
  BILL_ALREADY_PAID,
  BILL_CHANGED,
  BILL_GONE,
  BILL_TIMES_BELOW_PAID,
  campBillState,
} from "@camp404/core";
import { NOT_A_MONEY_KEEPER, type MoneyResult } from "@camp404/db/dues";
import type {
  CampBalanceRow,
  CampBankDetailsRow,
  CampBillRow,
} from "@camp404/db/camp-money";
import {
  CampBankDetails,
  EMPTY_CAMP_BANK_DETAILS,
  type CampBalanceInput,
  type CampBillInput,
  type MarkCampBillPaidInput,
} from "@camp404/types";
import { isMoneyKeeperInStore } from "./test-store-dues";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/camp-money (camp fees sprint), for
// E2E_TEST_MODE: the camp's bank details, its bank balances and its bills.
// The same rules and sentences as the database module (the shared ones are
// in @camp404/core); lib/__tests__/camp-money-agreement.test.ts holds the
// two equal. Only a captain or a Finance lead writes (MONEY_KEEPER), every
// write is a compare-and-set. The store keeps no audit log.

interface BalanceRow {
  id: string;
  amountCents: number;
  asOf: string;
  recordedByUserId: string;
  createdAt: Date;
  /** Typed order, so two balances in one millisecond still sort. */
  seq: number;
}

interface BillRow extends CampBillInput {
  id: string;
  paidCount: number;
  paidOn: string | null;
  version: number;
  removed: boolean;
}

interface CampMoneyState {
  bank: CampBankDetailsRow;
  balances: BalanceRow[];
  bills: BillRow[];
  seq: number;
}

const KEY = "__camp404CampMoneyTestStore__";

function state(): CampMoneyState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    bank: { details: EMPTY_CAMP_BANK_DETAILS, version: 0 },
    balances: [],
    bills: [],
    seq: 0,
  } satisfies CampMoneyState;
  return g[KEY] as CampMoneyState;
}

/** Clear the camp's money (testStore.reset calls this). */
export function resetCampMoneyStore(): void {
  const s = state();
  s.bank = { details: EMPTY_CAMP_BANK_DETAILS, version: 0 };
  s.balances.length = 0;
  s.bills.length = 0;
  s.seq = 0;
}

function keeper<T extends object>(
  actorId: string,
  fn: () => T | string,
): MoneyResult<T> {
  if (!isMoneyKeeperInStore(actorId)) {
    return { ok: false, error: NOT_A_MONEY_KEEPER };
  }
  const result = fn();
  return typeof result === "string"
    ? { ok: false, error: result }
    : { ok: true, ...result };
}

function liveBill(billId: string): BillRow | null {
  return state().bills.find((b) => b.id === billId && !b.removed) ?? null;
}

export const campMoneyTestStore = {
  getCampBankDetails(): CampBankDetailsRow {
    return state().bank;
  },

  saveCampBankDetails(input: {
    details: CampBankDetails;
    expectedVersion: number;
    actorId: string;
  }): MoneyResult<{ version: number }> {
    const details = CampBankDetails.parse(input.details);
    return keeper(input.actorId, () => {
      const s = state();
      if (s.bank.version !== input.expectedVersion) return BANK_DETAILS_CHANGED;
      s.bank = { details, version: input.expectedVersion + 1 };
      return { version: s.bank.version };
    });
  },

  listCampBalances(): CampBalanceRow[] {
    return [...state().balances]
      .sort(
        (a, b) =>
          b.asOf.localeCompare(a.asOf) ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.seq - a.seq,
      )
      .map((b) => ({
        id: b.id,
        amountCents: b.amountCents,
        asOf: b.asOf,
        recordedBy:
          testStore.findUserById(b.recordedByUserId)?.displayName?.trim() ||
          null,
        createdAt: b.createdAt,
      }));
  },

  recordCampBalance(
    input: CampBalanceInput & { actorId: string },
  ): MoneyResult<{ id: string }> {
    return keeper(input.actorId, () => {
      const latest = this.listCampBalances()[0];
      if ((latest?.id ?? null) !== input.expectedLatestId) {
        return BALANCE_CHANGED;
      }
      const s = state();
      const id = crypto.randomUUID();
      s.balances.push({
        id,
        amountCents: input.amountCents,
        asOf: input.asOf,
        recordedByUserId: input.actorId,
        createdAt: new Date(),
        seq: ++s.seq,
      });
      return { id };
    });
  },

  listCampBills(): CampBillRow[] {
    return state()
      .bills.filter((b) => !b.removed)
      .sort(
        (a, b) =>
          a.dueOn.localeCompare(b.dueOn) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .map((b) => ({
        id: b.id,
        name: b.name,
        payee: b.payee,
        amountCents: b.amountCents,
        dueOn: b.dueOn,
        repeat: b.repeat,
        times: b.times,
        paidCount: b.paidCount,
        paidOn: b.paidOn,
        planned: b.planned,
        state: campBillState(b),
        version: b.version,
      }));
  },

  addCampBill(
    input: CampBillInput & { actorId: string },
  ): MoneyResult<{ id: string }> {
    return keeper(input.actorId, () => {
      const id = crypto.randomUUID();
      state().bills.push({
        id,
        name: input.name,
        payee: input.payee,
        amountCents: input.amountCents,
        dueOn: input.dueOn,
        repeat: input.repeat,
        times: input.times,
        planned: input.planned,
        paidCount: 0,
        paidOn: null,
        version: 1,
        removed: false,
      });
      return { id };
    });
  },

  updateCampBill(
    input: CampBillInput & {
      billId: string;
      expectedVersion: number;
      actorId: string;
    },
  ): MoneyResult<{ version: number }> {
    return keeper(input.actorId, () => {
      const bill = liveBill(input.billId);
      if (!bill) return BILL_GONE;
      if (bill.version !== input.expectedVersion) return BILL_CHANGED;
      if (input.times < bill.paidCount) return BILL_TIMES_BELOW_PAID;
      Object.assign(bill, {
        name: input.name,
        payee: input.payee,
        amountCents: input.amountCents,
        dueOn: input.dueOn,
        repeat: input.repeat,
        times: input.times,
        planned: input.planned,
        version: bill.version + 1,
      });
      return { version: bill.version };
    });
  },

  markCampBillPaid(
    input: MarkCampBillPaidInput & { actorId: string },
  ): MoneyResult<{ paidCount: number }> {
    return keeper(input.actorId, () => {
      const bill = liveBill(input.billId);
      if (!bill) return BILL_GONE;
      if (bill.paidCount >= bill.times) return BILL_ALREADY_PAID;
      if (bill.paidCount !== input.expectedPaidCount) return BILL_CHANGED;
      bill.paidCount += 1;
      bill.paidOn = input.paidOn;
      bill.version += 1;
      return { paidCount: bill.paidCount };
    });
  },

  removeCampBill(input: {
    billId: string;
    expectedVersion: number;
    actorId: string;
  }): MoneyResult {
    return keeper(input.actorId, () => {
      const bill = liveBill(input.billId);
      if (!bill) return BILL_GONE;
      if (bill.version !== input.expectedVersion) return BILL_CHANGED;
      bill.removed = true;
      bill.version += 1;
      return {};
    });
  },
};
