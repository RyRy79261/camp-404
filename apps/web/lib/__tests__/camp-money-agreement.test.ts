// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BALANCE_CHANGED,
  BANK_DETAILS_CHANGED,
  BILL_ALREADY_PAID,
  BILL_CHANGED,
  BILL_GONE,
  BILL_TIMES_BELOW_PAID,
} from "@camp404/core";
import { NOT_A_MONEY_KEEPER } from "@camp404/db/dues";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR, type People } from "./_agreement";

// Camp money (the camp fees sprint), through lib/camp-money.ts, on the
// database and on the E2E store: the bank details, balances and bills, and
// the three reads the screens draw (Who owes what, Camp money, a member's own
// next payment). Same people, same calls, same answers. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addCampBill,
  getCampBankDetails,
  getCampMoney,
  getFeeOverview,
  getMyFeePayment,
  listCampBalances,
  listCampBills,
  markCampBillPaid,
  recordCampBalance,
  removeCampBill,
  saveCampBankDetails,
  updateCampBill,
} from "../camp-money";
import { setTeamBudget } from "../claims";
import { savePledge, setCollectingFees } from "../dues";
import { recordPayment } from "../payments";

const TODAY = "2026-10-27";
const R = (rands: number) => rands * 100;

const DETAILS = {
  southAfrica: {
    bank: "FNB",
    accountName: "Camp 404",
    accountNumber: "62800000000",
    branchCode: "250655",
  },
  abroad: {
    ways: { payLink: true, swift: true, iban: false },
    payLink: "https://wise.com/pay/me/camp404",
    swift: "FIRNZAJJ",
    accountNumber: "62800000000",
    bankAddress: "First National Bank, Johannesburg",
    iban: { accountName: null, iban: null, bic: null, bank: null },
    note: null,
  },
};

const storage = {
  name: "Storage unit",
  payee: "Paarden Eiland Storage",
  amountCents: R(4400),
  dueOn: "2026-11-15",
  repeat: "monthly" as const,
  times: 6,
  planned: false,
};

/** Three Coming members' pledges, one paid in part, and a team budget. */
async function fees(
  p: People,
  seed: Parameters<Parameters<typeof bothWays>[2]>[1],
) {
  await seed.participation(p.member, "accepted");
  await seed.participation(p.other, "applied");
  await seed.participation(p.kitchenLead, "accepted");
  await savePledge({
    userId: p.member,
    cycle: YEAR,
    pledge: { amountCents: R(8000), payBy: "part_by_end_nov", subsidy: false },
  });
  await savePledge({
    userId: p.other,
    cycle: YEAR,
    pledge: { amountCents: R(5000), payBy: "talk_to_captain", subsidy: false },
  });
  await savePledge({
    userId: p.kitchenLead,
    cycle: YEAR,
    pledge: { amountCents: 0, payBy: null, subsidy: true },
  });
  await recordPayment({
    userId: p.member,
    amountCents: R(2000),
    currency: "ZAR",
    status: "reconciled",
    recordedByUserId: p.captain,
  });
  await setTeamBudget({
    team: "kitchen",
    cycle: YEAR,
    amountCents: R(1500),
    expectedCents: null,
    actorId: p.financeLead,
  });
}

describe("camp money: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("keeps the bank details and the bank balances for the Finance team only", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const bank = (actorId: string, expectedVersion: number) =>
        saveCampBankDetails({ details: DETAILS, expectedVersion, actorId });
      const balance = (
        actorId: string,
        amountCents: number,
        asOf: string,
        expectedLatestId: string | null,
      ) => recordCampBalance({ amountCents, asOf, expectedLatestId, actorId });
      const empty = await getCampBankDetails();
      const byKitchen = await bank(p.kitchenLead, 0);
      const saved = await bank(p.financeLead, 0);
      const stale = await bank(p.captain, 0);
      const first = await balance(p.captain, R(96850), "2026-10-01", null);
      const staleBalance = await balance(p.financeLead, 1, "2026-10-02", null);
      const byMember = await balance(p.member, 1, "2026-10-02", null);
      const second = await balance(
        p.financeLead,
        R(100000),
        "2026-10-25",
        first.ok ? first.id : null,
      );
      return {
        empty,
        byKitchen,
        saved,
        stale,
        details: await getCampBankDetails(),
        first,
        staleBalance,
        byMember,
        second,
        balances: (await listCampBalances()).map((b) => ({
          amountCents: b.amountCents,
          asOf: b.asOf,
          recordedBy: b.recordedBy,
        })),
      };
    });
    expect(db).toMatchObject({
      empty: { version: 0 },
      byKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      saved: { ok: true, version: 1 },
      stale: { ok: false, error: BANK_DETAILS_CHANGED },
      details: { details: DETAILS, version: 1 },
      first: { ok: true },
      staleBalance: { ok: false, error: BALANCE_CHANGED },
      byMember: { ok: false, error: NOT_A_MONEY_KEEPER },
      second: { ok: true },
      balances: [
        { amountCents: R(100000), asOf: "2026-10-25", recordedBy: "Fin" },
        { amountCents: R(96850), asOf: "2026-10-01", recordedBy: "Cap" },
      ],
    });
    expect(store).toEqual(db);
  });

  it("adds, changes, pays and removes bills, each a compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const byMember = await addCampBill({ ...storage, actorId: p.member });
      const added = await addCampBill({ ...storage, actorId: p.financeLead });
      const id = added.ok ? added.id : "";
      const pay = (expectedPaidCount: number) =>
        markCampBillPaid({
          billId: id,
          expectedPaidCount,
          paidOn: "2026-11-14",
          actorId: p.captain,
        });
      const change = (expectedVersion: number, times: number) =>
        updateCampBill({
          ...storage,
          times,
          billId: id,
          expectedVersion,
          actorId: p.financeLead,
        });
      return {
        byMember,
        added,
        paid: await pay(0),
        twice: await pay(0),
        staleChange: await change(1, 6),
        belowPaid: await change(2, 0),
        toOnce: await updateCampBill({
          ...storage,
          repeat: "once",
          times: 1,
          billId: id,
          expectedVersion: 2,
          actorId: p.captain,
        }),
        bills: await listCampBills(),
        allPaid: await pay(1),
        staleRemove: await removeCampBill({
          billId: id,
          expectedVersion: 2,
          actorId: p.captain,
        }),
        removed: await removeCampBill({
          billId: id,
          expectedVersion: 3,
          actorId: p.captain,
        }),
        gone: await pay(1),
        after: await listCampBills(),
      };
    });
    expect(db).toMatchObject({
      byMember: { ok: false, error: NOT_A_MONEY_KEEPER },
      added: { ok: true },
      paid: { ok: true, paidCount: 1 },
      twice: { ok: false, error: BILL_CHANGED },
      staleChange: { ok: false, error: BILL_CHANGED },
      belowPaid: { ok: false, error: BILL_TIMES_BELOW_PAID },
      toOnce: { ok: true, version: 3 },
      bills: [
        {
          name: "Storage unit",
          repeat: "once",
          times: 1,
          paidCount: 1,
          paidOn: "2026-11-14",
          state: "paid",
        },
      ],
      allPaid: { ok: false, error: BILL_ALREADY_PAID },
      staleRemove: { ok: false, error: BILL_CHANGED },
      removed: { ok: true },
      gone: { ok: false, error: BILL_GONE },
      after: [],
    });
    expect(store).toEqual(db);
  });

  it("draws Who owes what, Camp money and a member's next payment the same", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await fees(p, seed);
      await saveCampBankDetails({
        details: DETAILS,
        expectedVersion: 0,
        actorId: p.captain,
      });
      await recordCampBalance({
        amountCents: R(100000),
        asOf: "2026-10-25",
        expectedLatestId: null,
        actorId: p.captain,
      });
      await addCampBill({ ...storage, actorId: p.captain });
      await addCampBill({
        name: "Tent hire deposit",
        payee: "Dimensions",
        amountCents: R(70000),
        dueOn: "2026-12-01",
        repeat: "once",
        times: 1,
        planned: false,
        actorId: p.captain,
      });
      const before = await getMyFeePayment(p.member, YEAR, TODAY);
      await setCollectingFees({
        cycle: YEAR,
        on: true,
        expectedVersion: 0,
        actorId: p.financeLead,
      });
      return {
        overview: await getFeeOverview(YEAR, TODAY),
        money: await getCampMoney(YEAR, TODAY),
        before,
        mine: await getMyFeePayment(p.member, YEAR, TODAY),
        subsidy: await getMyFeePayment(p.kitchenLead, YEAR, TODAY),
      };
    });
    expect(db).toMatchObject({
      overview: {
        year: { collectingFees: true },
        recommendedCents: R(7200),
        totals: {
          comingCount: 3,
          subsidyCount: 1,
          pledgedCents: R(13000),
          paidCents: R(2000),
          stillExpectedCents: R(11000),
          owingCount: 2,
          nextDue: { dueOn: "2026-11-30", amountCents: R(2000), count: 1 },
        },
      },
      money: {
        forecast: {
          inBank: { amountCents: R(100000), asOf: "2026-10-25" },
          feesExpectedCents: R(11000),
          billsDueCents: R(70000 + 6 * 4400),
          budgetsUnspentCents: R(1500),
          moneyLeftCents: R(100000 + 11000 - 70000 - 6 * 4400 - 1500),
        },
      },
      before: { collecting: false, showPayGuide: false },
      mine: {
        collecting: true,
        refCode: expect.any(String),
        feeTotalCents: R(8000),
        paidCents: R(2000),
        owingCents: R(6000),
        next: {
          kind: "due",
          dueOn: "2026-11-30",
          amountCents: R(2000),
          first: false,
        },
        bank: DETAILS,
        showPayGuide: true,
      },
      subsidy: { next: { kind: "subsidy" }, showPayGuide: false },
    });
    const rows = (
      db as { overview: { rows: { userId: string; scaleName: unknown }[] } }
    ).overview.rows;
    expect(rows.find((r) => r.userId === "@member")?.scaleName).toEqual({
      name: "Ideal",
      exact: true,
    });
    expect(rows.find((r) => r.userId === "@other")?.scaleName).toEqual({
      name: "Reasonable",
      exact: false,
    });
    expect(store).toEqual(db);
  });
});
