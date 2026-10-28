import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FINANCE_TEAM, type AuditAction } from "@camp404/core";
import { EMPTY_CAMP_BANK_DETAILS, type Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  addCampBill,
  BALANCE_CHANGED,
  BANK_DETAILS_CHANGED,
  BILL_ALREADY_PAID,
  BILL_CHANGED,
  BILL_GONE,
  BILL_TIMES_BELOW_PAID,
  getCampBankDetails,
  listCampBalances,
  listCampBills,
  markCampBillPaid,
  recordCampBalance,
  removeCampBill,
  saveCampBankDetails,
  updateCampBill,
} from "../camp-money";
import { NOT_A_MONEY_KEEPER } from "../dues";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The camp's own money on a real Postgres (PGlite): only the Finance team
// writes (re-checked inside each write), every write is a compare-and-set and
// leaves its audit row in the same transaction.

const YEAR = 2027;
const NOBODY = "00000000-0000-4000-8000-000000000000";

describe("camp money", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const cycles: CampConfig["cycles"] = [
      { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
    ];
    await db.insert(schema.campSettings).values({ id: true });
    const [row] = await db
      .select({ config: schema.campSettings.config })
      .from(schema.campSettings);
    await db
      .update(schema.campSettings)
      .set({ config: { ...row!.config, cycles } })
      .where(eq(schema.campSettings.id, true));
    const captain = await makeUser(db, {
      rank: "captain",
      displayName: "Caitlin",
    });
    const financeLead = await makeUser(db, { displayName: "Fin" });
    await assignTeam({ userId: financeLead.id, team: FINANCE_TEAM as Team });
    await setLead({
      userId: financeLead.id,
      team: FINANCE_TEAM as Team,
      isLead: true,
    });
    const kitchenLead = await makeUser(db);
    await assignTeam({ userId: kitchenLead.id, team: "kitchen" });
    await setLead({ userId: kitchenLead.id, team: "kitchen", isLead: true });
    const member = await makeUser(db);
    return { captain, financeLead, kitchenLead, member };
  }

  async function audits(action: AuditAction) {
    return h
      .db()
      .select({
        target: schema.auditLog.target,
        metadata: schema.auditLog.metadata,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  const storage = {
    name: "Storage unit",
    payee: "Paarden Eiland Storage",
    amountCents: 440_000,
    dueOn: "2026-11-15",
    repeat: "monthly" as const,
    times: 6,
    planned: false,
  };

  it("keeps the bank details, a compare-and-set for the Finance team", async () => {
    const { captain, financeLead, kitchenLead } = await people();
    expect(await getCampBankDetails()).toEqual({
      details: EMPTY_CAMP_BANK_DETAILS,
      version: 0,
    });
    const details = {
      southAfrica: {
        bank: "FNB",
        accountName: "Camp 404",
        accountNumber: "62800000000",
        branchCode: "250655",
      },
      abroad: {
        ways: { payLink: false, swift: true, iban: false },
        payLink: null,
        swift: "FIRNZAJJ",
        accountNumber: "62800000000",
        bankAddress: "First National Bank, Johannesburg",
        iban: { accountName: null, iban: null, bic: null, bank: null },
        note: "Choose OUR for the fees, or add R150.",
      },
    };
    expect(
      await saveCampBankDetails({
        details,
        expectedVersion: 0,
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
    expect(
      await saveCampBankDetails({
        details,
        expectedVersion: 0,
        actorId: financeLead.id,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(
      await saveCampBankDetails({
        details: EMPTY_CAMP_BANK_DETAILS,
        expectedVersion: 0,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: BANK_DETAILS_CHANGED });
    expect(await getCampBankDetails()).toEqual({ details, version: 1 });
    expect(await audits("camp_money.bank_details_saved")).toHaveLength(1);
  });

  it("keeps every bank balance, the latest first, each a compare-and-set", async () => {
    const { captain, financeLead, member } = await people();
    const record = (
      actorId: string,
      amountCents: number,
      asOf: string,
      expectedLatestId: string | null,
    ) => recordCampBalance({ amountCents, asOf, expectedLatestId, actorId });
    expect(await record(member.id, 1, "2026-10-01", null)).toEqual({
      ok: false,
      error: NOT_A_MONEY_KEEPER,
    });
    const first = await record(captain.id, 9_685_000, "2026-10-01", null);
    expect(first.ok).toBe(true);
    expect(await record(financeLead.id, 1, "2026-10-02", null)).toEqual({
      ok: false,
      error: BALANCE_CHANGED,
    });
    const second = await record(
      financeLead.id,
      10_000_000,
      "2026-10-25",
      first.ok ? first.id : null,
    );
    expect(second.ok).toBe(true);
    // An overdraft is a balance too.
    expect(
      (
        await record(
          captain.id,
          -50_000,
          "2026-10-26",
          second.ok ? second.id : null,
        )
      ).ok,
    ).toBe(true);
    const list = await listCampBalances();
    expect(list.map((b) => [b.amountCents, b.asOf, b.recordedBy])).toEqual([
      [-50_000, "2026-10-26", "Caitlin"],
      [10_000_000, "2026-10-25", "Fin"],
      [9_685_000, "2026-10-01", "Caitlin"],
    ]);
    expect(await audits("camp_money.balance_recorded")).toHaveLength(3);
  });

  it("adds, changes, pays month by month and removes a bill", async () => {
    const { captain, financeLead, kitchenLead } = await people();
    expect(await addCampBill({ ...storage, actorId: kitchenLead.id })).toEqual({
      ok: false,
      error: NOT_A_MONEY_KEEPER,
    });
    const added = await addCampBill({ ...storage, actorId: financeLead.id });
    if (!added.ok) throw new Error(added.error);
    expect(await listCampBills()).toMatchObject([
      {
        id: added.id,
        name: "Storage unit",
        times: 6,
        paidCount: 0,
        state: "not_paid",
        version: 1,
      },
    ]);

    const pay = (expectedPaidCount: number, paidOn = "2026-11-14") =>
      markCampBillPaid({
        billId: added.id,
        expectedPaidCount,
        paidOn,
        actorId: captain.id,
      });
    expect(await pay(0)).toEqual({ ok: true, paidCount: 1 });
    // A double press marks one month, not two.
    expect(await pay(0)).toEqual({ ok: false, error: BILL_CHANGED });
    expect(await pay(1, "2026-12-14")).toEqual({ ok: true, paidCount: 2 });

    const change = (expectedVersion: number, times: number) =>
      updateCampBill({
        ...storage,
        amountCents: 450_000,
        times,
        billId: added.id,
        expectedVersion,
        actorId: financeLead.id,
      });
    expect(await change(1, 6)).toEqual({ ok: false, error: BILL_CHANGED });
    expect(await change(3, 1)).toEqual({
      ok: false,
      error: BILL_TIMES_BELOW_PAID,
    });
    expect(await change(3, 2)).toEqual({ ok: true, version: 4 });
    expect(await listCampBills()).toMatchObject([
      {
        amountCents: 450_000,
        paidCount: 2,
        state: "paid",
        paidOn: "2026-12-14",
      },
    ]);
    expect(await pay(2)).toEqual({ ok: false, error: BILL_ALREADY_PAID });

    expect(
      await removeCampBill({
        billId: added.id,
        expectedVersion: 3,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: BILL_CHANGED });
    expect(
      await removeCampBill({
        billId: added.id,
        expectedVersion: 4,
        actorId: captain.id,
      }),
    ).toEqual({ ok: true });
    expect(await listCampBills()).toEqual([]);
    expect(await pay(2)).toEqual({ ok: false, error: BILL_GONE });
    expect(
      await removeCampBill({
        billId: NOBODY,
        expectedVersion: 1,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: BILL_GONE });

    expect(await audits("camp_money.bill_paid")).toEqual([
      {
        target: added.id,
        metadata: {
          name: "Storage unit",
          amountCents: 440_000,
          paidOn: "2026-11-14",
          index: 0,
        },
      },
      {
        target: added.id,
        metadata: {
          name: "Storage unit",
          amountCents: 440_000,
          paidOn: "2026-12-14",
          index: 1,
        },
      },
    ]);
    expect(await audits("camp_money.bill_added")).toHaveLength(1);
    expect(await audits("camp_money.bill_changed")).toHaveLength(1);
    expect(await audits("camp_money.bill_removed")).toHaveLength(1);
  });

  it("refuses a one-time bill paid twice and a bill of no money, in the database too", async () => {
    await people();
    await expect(
      h
        .db()
        .insert(schema.campBills)
        .values({ name: "x", amountCents: 100, dueOn: "2026-12-01", times: 2 }),
    ).rejects.toThrow();
    await expect(
      h
        .db()
        .insert(schema.campBills)
        .values({ name: "x", amountCents: 0, dueOn: "2026-12-01" }),
    ).rejects.toThrow();
  });
});
