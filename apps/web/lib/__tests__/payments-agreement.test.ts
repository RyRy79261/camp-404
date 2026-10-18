// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_METHODS } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, outcome, YEAR } from "./_agreement";

// The payments ledger, through lib/payments.ts, on the database and on the
// E2E store: the same people, the same calls, the same answers and refusals.
// The input checks both sides make are one function (checkPaymentInput in
// @camp404/core); this holds the rest (who may record, the numbering, the
// compare-and-set, the total) equal. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  getMemberRefCode,
  ledgerCycle,
  listPayments,
  receivedTotal,
  recordPayment,
  setPaymentStatus,
} from "../payments";

const NOBODY = "00000000-0000-4000-8000-000000000000";

describe("the payments ledger: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("records, numbers, lists and totals the Finance team's payments", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const first = await recordPayment({
        userId: p.member,
        amountCents: 150_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: p.captain,
      });
      const second = await recordPayment({
        userId: p.member,
        amountCents: 50_000,
        currency: "ZAR",
        status: "reconciled",
        note: "  FNB 12 Mar  ",
        method: PAYMENT_METHODS[0],
        paidOn: "2027-03-12",
        recordedByUserId: p.financeLead,
      });
      const third = await recordPayment({
        userId: p.other,
        amountCents: 20_000,
        currency: "ZAR",
        status: "waived",
        recordedByUserId: p.captain,
      });
      return {
        cycle: await ledgerCycle(),
        refs: [first.reference, second.reference, third.reference],
        memberRef: await getMemberRefCode(p.member),
        nobodyRef: await getMemberRefCode(NOBODY),
        list: await listPayments(YEAR),
        lastYear: await listPayments(YEAR - 1),
        received: await receivedTotal(YEAR),
      };
    });
    expect(db).toMatchObject({
      cycle: YEAR,
      refs: ["C404-M001-2027-1", "C404-M001-2027-2", "C404-M002-2027-1"],
      memberRef: "C404-M001",
      nobodyRef: null,
      received: 50_000,
    });
    expect(store).toEqual(db);
  });

  it("lets a member add only their own pending payment, and refuses everyone else who is not Finance", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const attempt = (
        recordedByUserId: string,
        extra: Partial<Parameters<typeof recordPayment>[0]> = {},
      ) =>
        outcome(() =>
          recordPayment({
            userId: p.member,
            amountCents: 10_000,
            currency: "ZAR",
            status: "pending",
            recordedByUserId,
            ...extra,
          }),
        );
      return {
        own: await attempt(p.member, {
          source: "member",
          proofPathname: "payment-proofs/x.pdf",
          proofContentType: "application/pdf",
        }),
        ownReceived: await attempt(p.member, {
          source: "member",
          status: "reconciled",
        }),
        forSomeoneElse: await attempt(p.other, { source: "member" }),
        memberAsFinance: await attempt(p.member),
        leadOfAnotherTeam: await attempt(p.kitchenLead),
        list: await listPayments(YEAR),
      };
    });
    expect(db).toMatchObject({
      own: { ok: { reference: "C404-M001-2027-1" } },
      ownReceived: { threw: expect.stringContaining("MoneyRefused") },
      forSomeoneElse: { threw: expect.stringContaining("MoneyRefused") },
      memberAsFinance: { threw: expect.stringContaining("MoneyRefused") },
      leadOfAnotherTeam: { threw: expect.stringContaining("MoneyRefused") },
    });
    expect(store).toEqual(db);
  });

  it("checks the input first, then the member, then who is recording, in the same order", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const attempt = (input: Partial<Parameters<typeof recordPayment>[0]>) =>
        outcome(() =>
          recordPayment({
            userId: p.member,
            amountCents: 10_000,
            currency: "ZAR",
            status: "pending",
            recordedByUserId: p.captain,
            ...input,
          }),
        );
      return {
        dollars: await attempt({ currency: "USD" as never }),
        lowerCase: await attempt({ currency: "zar" as never }),
        dollarsByAnyone: await attempt({
          currency: "USD" as never,
          recordedByUserId: p.kitchenLead,
        }),
        halfCent: await attempt({ amountCents: 10.5 }),
        negative: await attempt({ amountCents: -1 }),
        halfCentByAnyone: await attempt({
          amountCents: 10.5,
          recordedByUserId: p.kitchenLead,
        }),
        nobody: await attempt({ userId: NOBODY }),
        nobodyByAnyone: await attempt({
          userId: NOBODY,
          recordedByUserId: p.kitchenLead,
        }),
        list: await listPayments(YEAR),
      };
    });
    expect(db).toMatchObject({
      dollars: { threw: expect.stringContaining("UnknownCurrencyError") },
      dollarsByAnyone: {
        threw: expect.stringContaining("UnknownCurrencyError"),
      },
      halfCent: { threw: expect.stringContaining("whole cents") },
      halfCentByAnyone: { threw: expect.stringContaining("whole cents") },
      nobodyByAnyone: { threw: expect.stringContaining("no such member") },
      list: [],
    });
    expect(store).toEqual(db);
  });

  it("moves a status only from the one the Finance team saw", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { id } = await recordPayment({
        userId: p.member,
        amountCents: 30_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: p.captain,
      });
      const move = (
        actorId: string,
        from: "pending" | "reconciled" | "waived",
        to: "pending" | "reconciled" | "waived",
      ) =>
        outcome(() => setPaymentStatus({ paymentId: id, from, to, actorId }));
      return {
        same: await move(p.captain, "pending", "pending"),
        leadOfAnotherTeam: await move(p.kitchenLead, "pending", "reconciled"),
        member: await move(p.member, "pending", "reconciled"),
        finance: await move(p.financeLead, "pending", "reconciled"),
        stale: await move(p.captain, "pending", "waived"),
        back: await move(p.captain, "reconciled", "pending"),
        received: await receivedTotal(YEAR),
        list: await listPayments(YEAR),
      };
    });
    expect(db).toMatchObject({
      same: { ok: false },
      leadOfAnotherTeam: { threw: expect.stringContaining("MoneyRefused") },
      member: { threw: expect.stringContaining("MoneyRefused") },
      finance: { ok: true },
      stale: { ok: false },
      back: { ok: true },
      received: 0,
    });
    expect(store).toEqual(db);
  });
});
