import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { UnknownCurrencyError } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getCampManagementRoster } from "../roster";
import {
  ensureMemberRefCode,
  listPayments,
  recordPayment,
  setPaymentStatus,
} from "../payments";
import { sanitiseAccount } from "../account";
import * as schema from "../schema";

// The payments ledger on real rows: references, numbering, the audit trail,
// the compare-and-set on status, and the roster's paid state for the year.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** Tell the camp what year it is, the way setFoundingYear would. */
async function foundedAt(db: DB, year: number): Promise<void> {
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({
      config: {
        ...row!.config,
        cycles: [
          { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
        ],
      },
    })
    .where(eq(schema.campSettings.id, true));
}

describe("ensureMemberRefCode", () => {
  const h = useTestDb();

  it("gives out the next number once, and keeps it", async () => {
    const db = h.db();
    const earlier = await makeUser(db, { refCode: "C404-M041" } as never);
    const member = await makeUser(db);

    expect(await ensureMemberRefCode(member.id)).toBe("C404-M042");
    expect(await ensureMemberRefCode(member.id)).toBe("C404-M042");
    expect(await ensureMemberRefCode(earlier.id)).toBe("C404-M041");
  });

  it("gives none to the system account, an erased account, or nobody", async () => {
    const db = h.db();
    const system = await makeUser(db, { isSystem: true });
    const erased = await makeUser(db, { sanitised: true });

    expect(await ensureMemberRefCode(system.id)).toBeNull();
    expect(await ensureMemberRefCode(erased.id)).toBeNull();
    expect(
      await ensureMemberRefCode("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

describe("recordPayment and setPaymentStatus", () => {
  const h = useTestDb();

  it("numbers a member's payments within the year and audits each", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain", displayName: "Jo" });
    const member = await makeUser(db, { displayName: "Nova" });

    const first = await recordPayment({
      userId: member.id,
      amountCents: 50000,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });
    const second = await recordPayment({
      userId: member.id,
      amountCents: 75000,
      currency: "ZAR",
      status: "reconciled",
      note: "  FNB 12 Mar  ",
      recordedByUserId: captain.id,
    });

    const refCode = await ensureMemberRefCode(member.id);
    expect(first.reference).toBe(`${refCode}-2027-1`);
    expect(second.reference).toBe(`${refCode}-2027-2`);

    const rows = await listPayments(2027);
    expect(
      rows.map((r) => [r.reference, r.amountCents, r.status, r.note]),
    ).toEqual([
      [second.reference, 75000, "reconciled", "FNB 12 Mar"],
      [first.reference, 50000, "pending", null],
    ]);
    expect(rows[0]).toMatchObject({ memberName: "Nova", recordedByName: "Jo" });
    expect(await listPayments(2026)).toEqual([]);

    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "payment.recorded"));
    expect(audit).toHaveLength(2);
  });

  it("moves a status only from the one the captain saw", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const { id } = await recordPayment({
      userId: member.id,
      amountCents: 50000,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: captain.id,
    });

    expect(
      await setPaymentStatus({
        paymentId: id,
        from: "pending",
        to: "reconciled",
        actorId: captain.id,
      }),
    ).toBe(true);
    // A second captain still looking at "pending" changes nothing.
    expect(
      await setPaymentStatus({
        paymentId: id,
        from: "pending",
        to: "waived",
        actorId: captain.id,
      }),
    ).toBe(false);
    const [row] = await listPayments(2027);
    expect(row?.status).toBe("reconciled");
    const changes = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "payment.status_changed"));
    expect(changes.map((c) => c.metadata)).toEqual([
      { reference: row!.reference, from: "pending", to: "reconciled" },
    ]);
  });

  it("refuses a negative or fractional amount", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    for (const amountCents of [-1, 10.5]) {
      await expect(
        recordPayment({
          userId: member.id,
          amountCents,
          currency: "ZAR",
          status: "pending",
          recordedByUserId: captain.id,
        }),
      ).rejects.toThrow();
    }
  });
});

describe("the currency of a payment", () => {
  const h = useTestDb();

  it("stores a payment in USD and audits its currency", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await recordPayment({
      userId: member.id,
      amountCents: 1234,
      currency: "USD",
      status: "pending",
      recordedByUserId: captain.id,
    });

    const [row] = await listPayments(2027);
    expect(row).toMatchObject({ amountCents: 1234, currency: "USD" });
    const [audit] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "payment.recorded"));
    expect(audit!.metadata).toMatchObject({ currency: "USD" });
  });

  it("refuses GBP or a lower-case code before writing anything", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    for (const currency of ["GBP", "zar"]) {
      await expect(
        recordPayment({
          userId: member.id,
          amountCents: 999,
          currency: currency as never,
          status: "pending",
          recordedByUserId: captain.id,
        }),
      ).rejects.toThrow(UnknownCurrencyError);
    }

    expect(await db.select().from(schema.payments)).toEqual([]);
    expect(await db.select().from(schema.auditLog)).toEqual([]);
    // Refused before the reference read, so the member was not given one.
    const [user] = await db
      .select({ refCode: schema.users.refCode })
      .from(schema.users)
      .where(eq(schema.users.id, member.id));
    expect(user!.refCode).toBeNull();
  });
});

describe("dues paid on the roster", () => {
  const h = useTestDb();

  it("is this year's reconciled or waived payment, never a pending one", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain" });
    const paid = await makeUser(db, { displayName: "Paid" });
    const waived = await makeUser(db, { displayName: "Waived" });
    const promised = await makeUser(db, { displayName: "Promised" });
    const lastYear = await makeUser(db, { displayName: "Last year" });
    for (const [userId, status] of [
      [paid.id, "reconciled"],
      [waived.id, "waived"],
      [promised.id, "pending"],
    ] as const) {
      await recordPayment({
        userId,
        amountCents: 50000,
        currency: "ZAR",
        status,
        recordedByUserId: captain.id,
      });
    }
    await db.insert(schema.payments).values({
      userId: lastYear.id,
      cycle: 2026,
      amountCents: 50000,
      reference: "C404-M999-2026-1",
      status: "reconciled",
    });

    const roster = await getCampManagementRoster();
    const dues = Object.fromEntries(
      roster.map((m) => [m.displayName, m.duesPaid]),
    );
    expect(dues).toMatchObject({
      Paid: true,
      Waived: true,
      Promised: false,
      "Last year": false,
    });
  });
});

describe("erasure and the ledger", () => {
  const h = useTestDb();

  it("keeps the payment for accounting and drops the captain's note", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await recordPayment({
      userId: member.id,
      amountCents: 50000,
      currency: "ZAR",
      status: "reconciled",
      note: "EFT from N. Reyes",
      recordedByUserId: captain.id,
    });

    expect((await sanitiseAccount(member.id)).ok).toBe(true);

    const [row] = await listPayments(2027);
    expect(row).toMatchObject({ amountCents: 50000, note: null });
  });
});
