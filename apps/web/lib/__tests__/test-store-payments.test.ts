import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { UnknownCurrencyError } from "@camp404/core";
import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import { testStore } from "../test-store";

// The E2E ledger twin. Playwright drives the payments screen and the
// Overview's "Dues paid" through this store, so it must keep the real
// ledger's rules: these cases mirror packages/db/src/__tests__/payments.test.ts
// (rands kept, any other currency refused, the compare-and-set on status,
// the rands received totalled, dues settled by received or waived only).

/** Tell the camp what year it is, the mirror of the PGlite suite's `foundedAt`. */
function foundedAt(year: number): void {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [{ year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null }],
  };
  testStore.setTeamsConfig(config satisfies TeamsConfig);
}

function makeUser(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

beforeEach(() => {
  testStore.reset();
  foundedAt(2027);
});

describe("recordPayment and setPaymentStatus (store)", () => {
  it("numbers a member's payments within the year, newest first", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");

    const first = testStore.recordPayment({
      userId: member.id,
      amountCents: 1234,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });
    const second = testStore.recordPayment({
      userId: member.id,
      amountCents: 5678,
      currency: "ZAR",
      status: "reconciled",
      note: "  FNB 12 Mar  ",
      recordedByUserId: captain.id,
    });

    expect(first.reference).toBe("C404-M001-2027-1");
    expect(second.reference).toBe("C404-M001-2027-2");
    const rows = testStore.listPayments(2027);
    expect(
      rows.map((r) => [r.reference, r.amountCents, r.status, r.note]),
    ).toEqual([
      [second.reference, 5678, "reconciled", "FNB 12 Mar"],
      [first.reference, 1234, "pending", null],
    ]);
    expect(rows[0]).toMatchObject({
      memberName: "Nova",
      memberRefCode: "C404-M001",
      recordedByName: "Jo",
    });
    expect(testStore.listPayments(2026)).toEqual([]);
  });

  it("gives each member their own reference", () => {
    const captain = makeUser("Jo", "captain");
    const a = makeUser("Ash");
    const b = makeUser("Bo");
    testStore.recordPayment({
      userId: a.id,
      amountCents: 100,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });
    const { reference } = testStore.recordPayment({
      userId: b.id,
      amountCents: 100,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });
    expect(reference).toBe("C404-M002-2027-1");
    expect(testStore.ensureMemberRefCode(a.id)).toBe("C404-M001");
    expect(testStore.ensureMemberRefCode("nobody")).toBeNull();
  });

  it("moves a status only from the one the captain saw", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    const { id } = testStore.recordPayment({
      userId: member.id,
      amountCents: 1234,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });

    expect(
      testStore.setPaymentStatus({
        paymentId: id,
        from: "pending",
        to: "reconciled",
      }),
    ).toBe(true);
    // A second captain still looking at "pending" changes nothing.
    expect(
      testStore.setPaymentStatus({
        paymentId: id,
        from: "pending",
        to: "waived",
      }),
    ).toBe(false);
    expect(testStore.listPayments(2027)[0]?.status).toBe("reconciled");
  });

  it("refuses a negative or fractional amount", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    for (const amountCents of [-1, 12.5]) {
      expect(() =>
        testStore.recordPayment({
          userId: member.id,
          amountCents,
          currency: "ZAR",
          status: "pending",
          recordedByUserId: captain.id,
        }),
      ).toThrow();
    }
    expect(testStore.listPayments(2027)).toEqual([]);
  });
});

describe("the currency of a payment (store)", () => {
  it("keeps a payment in rands", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    testStore.recordPayment({
      userId: member.id,
      amountCents: 1234,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });
    expect(testStore.listPayments(2027)[0]).toMatchObject({
      amountCents: 1234,
      currency: "ZAR",
    });
  });

  it("refuses dollars, euros or a misspelt code before writing anything", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    for (const currency of ["USD", "EUR", "GBP", "zar", " ZAR"]) {
      expect(() =>
        testStore.recordPayment({
          userId: member.id,
          amountCents: 999,
          currency: currency as never,
          status: "pending",
          recordedByUserId: captain.id,
        }),
      ).toThrow(UnknownCurrencyError);
    }
    expect(testStore.listPayments(2027)).toEqual([]);
    // Refused before the reference, so the member was not given one: the next
    // member to pay is still M001.
    const other = makeUser("Ash");
    expect(testStore.ensureMemberRefCode(other.id)).toBe("C404-M001");
  });
});

describe("money received (store)", () => {
  it("totals the rands that reached the bank this year", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    const record = (
      amountCents: number,
      status: "pending" | "reconciled" | "waived",
    ) =>
      testStore.recordPayment({
        userId: member.id,
        amountCents,
        currency: "ZAR",
        status,
        recordedByUserId: captain.id,
      });
    record(1234, "reconciled");
    record(1000, "reconciled");
    record(700, "pending");
    record(9900, "waived");

    expect(testStore.receivedTotal(2027)).toBe(2234);

    // Next year, the same rows are last year's money.
    foundedAt(2028);
    record(4200, "reconciled");
    expect(testStore.receivedTotal(2028)).toBe(4200);
    expect(testStore.receivedTotal(2027)).toBe(2234);
    expect(testStore.receivedTotal(2025)).toBe(0);
  });
});

describe("dues paid on the store's roster", () => {
  it("is this year's received or waived payment, never a pending one", () => {
    const captain = makeUser("Jo", "captain");
    const paid = makeUser("Paid");
    const waived = makeUser("Waived");
    const promised = makeUser("Promised");
    for (const [userId, status] of [
      [paid.id, "reconciled"],
      [waived.id, "waived"],
      [promised.id, "pending"],
    ] as const) {
      testStore.recordPayment({
        userId,
        amountCents: 1234,
        currency: "ZAR",
        status,
        recordedByUserId: captain.id,
      });
    }
    const dues = () =>
      Object.fromEntries(
        testStore
          .getCampManagementRoster()
          .map((m) => [m.displayName, m.duesPaid]),
      );
    expect(dues()).toMatchObject({
      Paid: true,
      Waived: true,
      Promised: false,
      Jo: false,
    });

    // A new year: last year's payment settles nothing.
    foundedAt(2028);
    expect(dues()).toMatchObject({ Paid: false, Waived: false });
  });

  it("forgets the ledger on reset", () => {
    const captain = makeUser("Jo", "captain");
    const member = makeUser("Nova");
    testStore.recordPayment({
      userId: member.id,
      amountCents: 100,
      currency: "ZAR",
      status: "reconciled",
      recordedByUserId: captain.id,
    });
    testStore.reset();
    foundedAt(2027);
    expect(testStore.listPayments(2027)).toEqual([]);
    expect(testStore.receivedTotal(2027)).toBe(0);
  });
});
