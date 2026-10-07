import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FINANCE_TEAM, type AuditAction } from "@camp404/core";
import type { ParticipationStatus, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { sanitiseAccount } from "../account";
import {
  addCharge,
  addFeeTier,
  archiveFeeTier,
  cancelCharge,
  CHARGE_GONE,
  decideRefund,
  FEE_ALREADY_SET,
  FEE_CHANGED,
  getDuesYear,
  getMemberDues,
  listDuesAccounts,
  listFeeTiers,
  NO_TIERS_YET,
  NOT_A_MONEY_KEEPER,
  NOT_YOUR_PAYMENT,
  PLAN_CHANGED,
  PLEDGE_NOT_BELOW,
  publishSettleUp,
  REFUND_ALREADY_OPEN,
  REFUND_CHANGED,
  REFUND_HOLDS_PAYMENT,
  REFUND_PAID_HOLDS_PAYMENT,
  REFUND_NOT_RECEIVED,
  REFUND_PAYMENT_NOT_RECEIVED,
  requestRefund,
  saveDuesYear,
  savePledge,
  setFee,
  setPaymentPlan,
  SETTLE_UP_CHANGED,
  settleUpCandidates,
  YEAR_CHANGED,
  MoneyRefused,
} from "../dues";
import { decideParticipation } from "../participations";
import { listPayments, recordPayment, setPaymentStatus } from "../payments";
import { getCampManagementRoster } from "../roster";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Dues (#240) on a real Postgres (PGlite): who may keep the money (a captain
// or a Finance lead, re-checked inside each write), the balance, the fee a
// pledge becomes on acceptance, the compare-and-sets, the settle-up rounding,
// refunds, and the audit row each Finance write leaves in its transaction.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 2027;

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
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
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

async function auditActions(db: DB, target?: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditLog.action, target: schema.auditLog.target })
    .from(schema.auditLog);
  return rows
    .filter((r) => target === undefined || r.target === target)
    .map((r) => r.action);
}

async function place(
  db: DB,
  userId: string,
  status: ParticipationStatus,
  updatedAt = new Date(),
) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: YEAR,
    status,
    intent: status === "not_attending" ? "no" : "yes",
    updatedAt,
  });
}

describe("dues", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    expect(await setLead({ userId: user.id, team, isLead: true })).toEqual({
      ok: true,
      changed: true,
    });
    return user;
  }

  async function people() {
    await campYear(h.db(), YEAR);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const financeLead = await leadOf(FINANCE_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db(), { refCode: "C404-M017" });
    return { captain, financeLead, kitchenLead, member };
  }

  async function tiers(actorId: string) {
    const base = await addFeeTier({
      cycle: YEAR,
      label: "Base",
      amountCents: 200_000,
      actorId,
    });
    const supporter = await addFeeTier({
      cycle: YEAR,
      label: "Supporter",
      amountCents: 300_000,
      actorId,
    });
    if (!base.ok || !supporter.ok) throw new Error("tiers");
    return { base: base.id, supporter: supporter.id };
  }

  describe("who may keep the money", () => {
    it("lets a captain and a Finance lead in, and records each write", async () => {
      const { captain, financeLead } = await people();
      expect(
        (
          await addFeeTier({
            cycle: YEAR,
            label: "Base",
            amountCents: 100,
            actorId: captain.id,
          })
        ).ok,
      ).toBe(true);
      expect(
        (
          await addFeeTier({
            cycle: YEAR,
            label: "Plus",
            amountCents: 200,
            actorId: financeLead.id,
          })
        ).ok,
      ).toBe(true);
      const added: AuditAction = "dues.tier_added";
      expect(await auditActions(h.db())).toEqual(
        expect.arrayContaining([added, added]),
      );
      expect(await listFeeTiers(YEAR)).toHaveLength(2);
    });

    it("refuses a lead of another team and a member inside the write", async () => {
      const { kitchenLead, member, financeLead } = await people();
      for (const actor of [kitchenLead, member]) {
        expect(
          await addFeeTier({
            cycle: YEAR,
            label: "Sneaky",
            amountCents: 1,
            actorId: actor.id,
          }),
        ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
        expect(
          await addCharge({
            userId: financeLead.id,
            kind: "other",
            description: "x",
            amountCents: 1,
            cycle: YEAR,
            actorId: actor.id,
          }),
        ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
      }
      await expect(
        recordPayment({
          userId: member.id,
          amountCents: 100,
          currency: "ZAR",
          status: "reconciled",
          recordedByUserId: kitchenLead.id,
        }),
      ).rejects.toBeInstanceOf(MoneyRefused);
      expect(await listFeeTiers(YEAR)).toEqual([]);
      expect(await listPayments(YEAR)).toEqual([]);
      expect(await auditActions(h.db())).not.toContain("dues.tier_added");
    });

    it("sees a Finance lead stepping down: the next write is refused", async () => {
      const { financeLead } = await people();
      await setLead({
        userId: financeLead.id,
        team: FINANCE_TEAM as Team,
        isLead: false,
      });
      expect(
        await addFeeTier({
          cycle: YEAR,
          label: "Base",
          amountCents: 1,
          actorId: financeLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
    });

    it("lets a member add only their own pending payment", async () => {
      const { member, captain } = await people();
      const own = await recordPayment({
        userId: member.id,
        amountCents: 50_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: member.id,
        source: "member",
        method: "bank_transfer",
        paidOn: "2027-01-10",
        proofPathname: `payment-proofs/${member.id}/proof.pdf`,
        proofContentType: "application/pdf",
      });
      expect(own.reference).toBe("C404-M017-2027-1");
      await expect(
        recordPayment({
          userId: captain.id,
          amountCents: 1,
          currency: "ZAR",
          status: "pending",
          recordedByUserId: member.id,
          source: "member",
        }),
      ).rejects.toBeInstanceOf(MoneyRefused);
      await expect(
        recordPayment({
          userId: member.id,
          amountCents: 1,
          currency: "ZAR",
          status: "reconciled",
          recordedByUserId: member.id,
          source: "member",
        }),
      ).rejects.toBeInstanceOf(MoneyRefused);
      await expect(
        setPaymentStatus({
          paymentId: own.id,
          from: "pending",
          to: "reconciled",
          actorId: member.id,
        }),
      ).rejects.toBeInstanceOf(MoneyRefused);
      const [row] = await listPayments(YEAR);
      expect(row).toMatchObject({
        source: "member",
        method: "bank_transfer",
        paidOn: "2027-01-10",
        hasProof: true,
        status: "pending",
      });
    });
  });

  describe("the year's dates", () => {
    it("is a compare-and-set: a second save from the same version loses", async () => {
      const { captain, financeLead } = await people();
      const first = await saveDuesYear({
        cycle: YEAR,
        deadline: "2027-03-01",
        fullRefundUntil: "2027-01-31",
        partialRefundUntil: "2027-02-28",
        partialRefundPct: 50,
        expectedVersion: 0,
        actorId: captain.id,
      });
      expect(first).toEqual({ ok: true, version: 1 });
      const second = await saveDuesYear({
        cycle: YEAR,
        deadline: "2027-04-01",
        fullRefundUntil: null,
        partialRefundUntil: null,
        partialRefundPct: null,
        expectedVersion: 0,
        actorId: financeLead.id,
      });
      expect(second).toEqual({ ok: false, error: YEAR_CHANGED });
      expect(await getDuesYear(YEAR)).toMatchObject({
        deadline: "2027-03-01",
        partialRefundPct: 50,
        version: 1,
      });
    });
  });

  describe("pledges and the fee", () => {
    it("needs tiers, and a below-the-base pledge below the lowest tier", async () => {
      const { member, captain } = await people();
      expect(
        await savePledge({
          userId: member.id,
          cycle: YEAR,
          pledge: { kind: "below", amountCents: 100 },
        }),
      ).toEqual({ ok: false, error: NO_TIERS_YET });
      await tiers(captain.id);
      expect(
        await savePledge({
          userId: member.id,
          cycle: YEAR,
          pledge: { kind: "below", amountCents: 200_000 },
        }),
      ).toEqual({ ok: false, error: PLEDGE_NOT_BELOW });
      expect(
        await savePledge({
          userId: member.id,
          cycle: YEAR,
          pledge: { kind: "below", amountCents: 120_000 },
        }),
      ).toEqual({ ok: true, charged: false });
      const dues = await getMemberDues(member.id, YEAR, { forFinance: false });
      expect(dues?.pledge).toMatchObject({
        tierId: null,
        tierLabel: null,
        amountCents: 120_000,
      });
    });

    it("becomes the fee when a captain accepts the member, once", async () => {
      const { member, captain } = await people();
      const { supporter } = await tiers(captain.id);
      await place(h.db(), member.id, "applied");
      await savePledge({
        userId: member.id,
        cycle: YEAR,
        pledge: { kind: "tier", tierId: supporter },
      });
      expect(
        await decideParticipation({
          userId: member.id,
          from: "applied",
          to: "accepted",
          decidedByUserId: captain.id,
        }),
      ).toBe(true);
      const dues = await getMemberDues(member.id, YEAR, { forFinance: true });
      expect(dues?.charges).toMatchObject([
        {
          kind: "fee",
          description: "Camp fee: Supporter",
          amountCents: 300_000,
          cancelled: false,
        },
      ]);
      expect(dues?.balance.balanceCents).toBe(300_000);
      const charged: AuditAction = "dues.fee_charged";
      expect(await auditActions(h.db(), member.id)).toContain(charged);

      // Waitlisted and accepted again: still one fee.
      await decideParticipation({
        userId: member.id,
        from: "accepted",
        to: "waitlisted",
        decidedByUserId: captain.id,
      });
      await decideParticipation({
        userId: member.id,
        from: "waitlisted",
        to: "accepted",
        decidedByUserId: captain.id,
      });
      const again = await getMemberDues(member.id, YEAR, { forFinance: true });
      expect(again?.charges.filter((c) => c.kind === "fee")).toHaveLength(1);
      // And the pledge is locked now the fee is charged.
      expect(
        await savePledge({
          userId: member.id,
          cycle: YEAR,
          pledge: { kind: "below", amountCents: 1 },
        }),
      ).toEqual({ ok: false, error: FEE_ALREADY_SET });
    });

    it("charges an already accepted member at once when they pledge", async () => {
      const { member, captain } = await people();
      const { base } = await tiers(captain.id);
      await place(h.db(), member.id, "accepted");
      expect(
        await savePledge({
          userId: member.id,
          cycle: YEAR,
          pledge: { kind: "tier", tierId: base },
        }),
      ).toEqual({ ok: true, charged: true });
      // An archived tier keeps the pledge's label and amount.
      await archiveFeeTier({ tierId: base, actorId: captain.id });
      const dues = await getMemberDues(member.id, YEAR, { forFinance: false });
      expect(dues?.pledge?.tierLabel).toBe("Base");
      expect(dues?.balance.chargedCents).toBe(200_000);
    });

    it("sets a concession as a compare-and-set, its reason for the Finance team only", async () => {
      const { member, captain, financeLead } = await people();
      const { base } = await tiers(captain.id);
      await place(h.db(), member.id, "accepted");
      await savePledge({
        userId: member.id,
        cycle: YEAR,
        pledge: { kind: "tier", tierId: base },
      });
      const before = await getMemberDues(member.id, YEAR, { forFinance: true });
      const feeId = before!.charges[0]!.id;

      const set = await setFee({
        userId: member.id,
        cycle: YEAR,
        amountCents: 100_000,
        concessionReason: "Student this year",
        expectedFeeId: feeId,
        actorId: financeLead.id,
      });
      expect(set.ok).toBe(true);
      // The same stale fee id again loses.
      expect(
        await setFee({
          userId: member.id,
          cycle: YEAR,
          amountCents: 50_000,
          concessionReason: null,
          expectedFeeId: feeId,
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: FEE_CHANGED });

      const finance = await getMemberDues(member.id, YEAR, {
        forFinance: true,
      });
      const live = finance!.charges.filter((c) => !c.cancelled);
      expect(live).toMatchObject([
        {
          kind: "fee",
          amountCents: 100_000,
          standardAmountCents: 200_000,
          concessionReason: "Student this year",
          concession: true,
        },
      ]);
      const own = await getMemberDues(member.id, YEAR, { forFinance: false });
      expect(own!.charges.map((c) => c.concessionReason)).toEqual([null, null]);
      expect(own!.charges.map((c) => c.concession)).toEqual([false, false]);
      expect(own!.balance.balanceCents).toBe(100_000);

      // The audit row says there was a concession, never why.
      const [audit] = await h
        .db()
        .select({ metadata: schema.auditLog.metadata })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "dues.fee_set"));
      expect(JSON.stringify(audit!.metadata)).not.toContain("Student");
      expect(audit!.metadata).toMatchObject({ concession: true });
    });
  });

  describe("the balance", () => {
    it("is charges less payments received or waived, plus refunds paid out", async () => {
      const { member, captain } = await people();
      await addCharge({
        userId: member.id,
        kind: "rental",
        description: "Tent",
        amountCents: 250_000,
        cycle: YEAR,
        actorId: captain.id,
      });
      const cancelled = await addCharge({
        userId: member.id,
        kind: "other",
        description: "Mistake",
        amountCents: 999_900,
        cycle: YEAR,
        actorId: captain.id,
      });
      if (!cancelled.ok) throw new Error("charge");
      expect(
        await cancelCharge({ chargeId: cancelled.id, actorId: captain.id }),
      ).toEqual({ ok: true });
      expect(
        await cancelCharge({ chargeId: cancelled.id, actorId: captain.id }),
      ).toEqual({ ok: false, error: CHARGE_GONE });

      for (const [cents, status] of [
        [100_000, "reconciled"],
        [20_000, "waived"],
        [30_000, "pending"],
      ] as const) {
        await recordPayment({
          userId: member.id,
          amountCents: cents,
          currency: "ZAR",
          status,
          recordedByUserId: captain.id,
        });
      }
      const dues = await getMemberDues(member.id, YEAR, { forFinance: false });
      expect(dues!.balance).toEqual({
        chargedCents: 250_000,
        paidCents: 120_000,
        pendingCents: 30_000,
        refundedCents: 0,
        balanceCents: 130_000,
      });
      const [row] = (await listDuesAccounts(YEAR, "2027-01-01")).filter(
        (r) => r.userId === member.id,
      );
      expect(row!.balance.balanceCents).toBe(130_000);
      // A captain's pending payment is promised, not a proof to check, and the
      // waived money is excused, not in the bank.
      expect(row!.figures).toEqual({
        inBankCents: 100_000,
        excusedCents: 20_000,
        toCheckCents: 0,
        toCheckCount: 0,
        promisedCents: 30_000,
        promisedCount: 1,
      });
    });

    it("drives the roster's paid state: settled only once the balance is paid", async () => {
      const { member, captain } = await people();
      const paid = async () =>
        (await getCampManagementRoster()).find((r) => r.id === member.id)
          ?.duesPaid;
      await recordPayment({
        userId: member.id,
        amountCents: 1_000,
        currency: "ZAR",
        status: "reconciled",
        recordedByUserId: captain.id,
      });
      // No charges yet: the ledger's old rule.
      expect(await paid()).toBe(true);
      await addCharge({
        userId: member.id,
        kind: "other",
        description: "Camp fee",
        amountCents: 5_000,
        cycle: YEAR,
        actorId: captain.id,
      });
      expect(await paid()).toBe(false);
      await recordPayment({
        userId: member.id,
        amountCents: 4_000,
        currency: "ZAR",
        status: "reconciled",
        recordedByUserId: captain.id,
      });
      expect(await paid()).toBe(true);
    });

    it("lets only one of two captains reconcile the same pending payment", async () => {
      const { member, captain, financeLead } = await people();
      const { id } = await recordPayment({
        userId: member.id,
        amountCents: 10_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: member.id,
        source: "member",
      });
      const results = await Promise.all([
        setPaymentStatus({
          paymentId: id,
          from: "pending",
          to: "reconciled",
          actorId: captain.id,
        }),
        setPaymentStatus({
          paymentId: id,
          from: "pending",
          to: "waived",
          actorId: financeLead.id,
        }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const moved = await h
        .db()
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "payment.status_changed"));
      expect(moved).toHaveLength(1);
    });
  });

  describe("payment plans", () => {
    it("replace the whole plan as a compare-and-set", async () => {
      const { member, captain, financeLead } = await people();
      const plan = [
        { dueOn: "2027-02-01", amountCents: 50_000 },
        { dueOn: "2027-03-01", amountCents: 50_000 },
      ];
      expect(
        await setPaymentPlan({
          userId: member.id,
          instalments: plan,
          expectedVersion: 0,
          cycle: YEAR,
          actorId: captain.id,
        }),
      ).toEqual({ ok: true, version: 1 });
      expect(
        await setPaymentPlan({
          userId: member.id,
          instalments: [],
          expectedVersion: 0,
          cycle: YEAR,
          actorId: financeLead.id,
        }),
      ).toEqual({ ok: false, error: PLAN_CHANGED });
      const dues = await getMemberDues(member.id, YEAR, {
        forFinance: false,
        today: "2027-02-10",
      });
      expect(dues!.instalments).toEqual(plan);
      expect(dues!.next).toEqual({
        dueOn: "2027-02-01",
        amountCents: 50_000,
        overdue: true,
      });
    });
  });

  describe("settle-up", () => {
    async function threeFees(captainId: string) {
      const members = await Promise.all([1, 2, 3].map(() => makeUser(h.db())));
      for (const m of members) {
        await setFee({
          userId: m.id,
          cycle: YEAR,
          amountCents: 100_000,
          concessionReason: null,
          expectedFeeId: null,
          actorId: captainId,
        });
      }
      return members;
    }

    it("shares a total so the shares add up to it exactly, in one audited write", async () => {
      const { captain } = await people();
      const members = await threeFees(captain.id);
      const candidates = await settleUpCandidates(YEAR);
      expect(candidates).toHaveLength(3);
      const result = await publishSettleUp({
        description: "Gas top-up",
        totalCents: 10_000,
        direction: "top_up",
        skipConcessions: false,
        cycle: YEAR,
        previewedUserIds: candidates.map((c) => c.userId),
        actorId: captain.id,
      });
      expect(result).toMatchObject({ ok: true, members: 3 });
      const shares = await h
        .db()
        .select({ amountCents: schema.duesCharges.amountCents })
        .from(schema.duesCharges)
        .where(eq(schema.duesCharges.kind, "settle_up"));
      expect(shares.map((s) => s.amountCents).sort()).toEqual([
        3_333, 3_333, 3_334,
      ]);
      expect(shares.reduce((s, r) => s + r.amountCents, 0)).toBe(10_000);
      const published: AuditAction = "dues.settle_up_published";
      expect(await auditActions(h.db())).toContain(published);
      expect(members).toHaveLength(3);
    });

    it("gives money back as negative shares, and skips concessions when asked", async () => {
      const { captain } = await people();
      const members = await threeFees(captain.id);
      const fee = await getMemberDues(members[0]!.id, YEAR, {
        forFinance: true,
      });
      await setFee({
        userId: members[0]!.id,
        cycle: YEAR,
        amountCents: 10_000,
        concessionReason: "Hardship",
        expectedFeeId: fee!.charges[0]!.id,
        actorId: captain.id,
      });
      const others = members.slice(1).map((m) => m.id);
      const result = await publishSettleUp({
        description: "Leftover budget",
        totalCents: 1_001,
        direction: "refund",
        skipConcessions: true,
        cycle: YEAR,
        previewedUserIds: others,
        actorId: captain.id,
      });
      expect(result).toMatchObject({ ok: true, members: 2 });
      const shares = await h
        .db()
        .select({
          userId: schema.duesCharges.userId,
          amountCents: schema.duesCharges.amountCents,
        })
        .from(schema.duesCharges)
        .where(eq(schema.duesCharges.kind, "settle_up"));
      expect(shares.map((s) => s.userId).sort()).toEqual([...others].sort());
      expect(shares.reduce((s, r) => s + r.amountCents, 0)).toBe(-1_001);
    });

    it("refuses when the members changed since the preview", async () => {
      const { captain } = await people();
      const members = await threeFees(captain.id);
      expect(
        await publishSettleUp({
          description: "Gas",
          totalCents: 100,
          direction: "top_up",
          skipConcessions: false,
          cycle: YEAR,
          previewedUserIds: members.slice(0, 2).map((m) => m.id),
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: SETTLE_UP_CHANGED });
      const shares = await h
        .db()
        .select()
        .from(schema.duesCharges)
        .where(eq(schema.duesCharges.kind, "settle_up"));
      expect(shares).toEqual([]);
    });
  });

  describe("refunds", () => {
    async function received(memberId: string, captainId: string) {
      return recordPayment({
        userId: memberId,
        amountCents: 200_000,
        currency: "ZAR",
        status: "reconciled",
        recordedByUserId: captainId,
      });
    }

    it("proposes the schedule's amount for a member who withdrew, and asks once", async () => {
      const { member, captain, kitchenLead } = await people();
      await saveDuesYear({
        cycle: YEAR,
        deadline: null,
        fullRefundUntil: "2027-01-31",
        partialRefundUntil: "2027-03-31",
        partialRefundPct: 50,
        expectedVersion: 0,
        actorId: captain.id,
      });
      await place(
        h.db(),
        member.id,
        "not_attending",
        new Date("2027-02-15T10:00:00.000Z"),
      );
      const payment = await received(member.id, captain.id);

      expect(
        await requestRefund({
          paymentId: payment.id,
          amountCents: null,
          note: null,
          actorId: kitchenLead.id,
          today: "2027-02-20",
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_PAYMENT });

      const asked = await requestRefund({
        paymentId: payment.id,
        amountCents: null,
        note: "I can't come this year",
        actorId: member.id,
        today: "2027-02-20",
      });
      expect(asked.ok).toBe(true);
      expect(
        await requestRefund({
          paymentId: payment.id,
          amountCents: 1,
          note: null,
          actorId: captain.id,
          today: "2027-02-20",
        }),
      ).toEqual({ ok: false, error: REFUND_ALREADY_OPEN });

      const dues = await getMemberDues(member.id, YEAR, { forFinance: true });
      expect(dues!.payments[0]!.refund).toMatchObject({
        status: "requested",
        proposedCents: 100_000,
        amountCents: 100_000,
        note: "I can't come this year",
      });
      const own = await getMemberDues(member.id, YEAR, { forFinance: false });
      expect(own!.payments[0]!.refund?.note).toBeNull();
    });

    it("pays out once, and counts the refund as money going out", async () => {
      const { member, captain, financeLead } = await people();
      await addCharge({
        userId: member.id,
        kind: "other",
        description: "Camp fee",
        amountCents: 200_000,
        cycle: YEAR,
        actorId: captain.id,
      });
      const payment = await received(member.id, captain.id);
      const asked = await requestRefund({
        paymentId: payment.id,
        amountCents: 50_000,
        note: null,
        actorId: financeLead.id,
        today: "2027-02-20",
      });
      if (!asked.ok) throw new Error(asked.error);
      const both = await Promise.all([
        decideRefund({
          refundId: asked.id,
          to: "refunded",
          amountCents: 50_000,
          actorId: captain.id,
        }),
        decideRefund({
          refundId: asked.id,
          to: "declined",
          reason: "Too late",
          actorId: financeLead.id,
        }),
      ]);
      expect(both.filter((r) => r.ok)).toHaveLength(1);
      expect(both.filter((r) => !r.ok)).toEqual([
        { ok: false, error: REFUND_CHANGED },
      ]);
      const dues = await getMemberDues(member.id, YEAR, { forFinance: true });
      const refund = dues!.payments[0]!.refund!;
      if (refund.status === "refunded") {
        expect(dues!.balance.refundedCents).toBe(50_000);
        expect(dues!.balance.balanceCents).toBe(50_000);
      } else {
        expect(refund.declineReason).toBe("Too late");
        expect(dues!.balance.balanceCents).toBe(0);
      }
    });

    it("keeps a received payment received while its refund waits for a decision", async () => {
      const { member, captain } = await people();
      const payment = await received(member.id, captain.id);
      const asked = await requestRefund({
        paymentId: payment.id,
        amountCents: 50_000,
        note: null,
        actorId: captain.id,
        today: "2027-02-20",
      });
      if (!asked.ok) throw new Error(asked.error);

      await expect(
        setPaymentStatus({
          paymentId: payment.id,
          from: "reconciled",
          to: "pending",
          actorId: captain.id,
        }),
      ).rejects.toThrow(REFUND_HOLDS_PAYMENT);
      const [row] = await h
        .db()
        .select({ status: schema.payments.status })
        .from(schema.payments)
        .where(eq(schema.payments.id, payment.id));
      expect(row!.status).toBe("reconciled");

      // Once the refund is decided the payment may move again.
      expect(
        await decideRefund({
          refundId: asked.id,
          to: "declined",
          reason: "Too late",
          actorId: captain.id,
        }),
      ).toEqual({ ok: true });
      expect(
        await setPaymentStatus({
          paymentId: payment.id,
          from: "reconciled",
          to: "pending",
          actorId: captain.id,
        }),
      ).toBe(true);
    });

    it("keeps a received payment received once its refund is paid out", async () => {
      const { member, captain } = await people();
      const payment = await received(member.id, captain.id);
      const asked = await requestRefund({
        paymentId: payment.id,
        amountCents: 50_000,
        note: null,
        actorId: captain.id,
        today: "2027-02-20",
      });
      if (!asked.ok) throw new Error(asked.error);
      expect(
        await decideRefund({
          refundId: asked.id,
          to: "refunded",
          amountCents: 50_000,
          actorId: captain.id,
        }),
      ).toEqual({ ok: true });

      // The paid-out refund still counts in the balance, so a payment moved
      // back to pending would have the member owe the payment and the refund.
      await expect(
        setPaymentStatus({
          paymentId: payment.id,
          from: "reconciled",
          to: "pending",
          actorId: captain.id,
        }),
      ).rejects.toThrow(REFUND_PAID_HOLDS_PAYMENT);
      const [row] = await h
        .db()
        .select({ status: schema.payments.status })
        .from(schema.payments)
        .where(eq(schema.payments.id, payment.id));
      expect(row!.status).toBe("reconciled");
    });

    it("decides a refund only while its payment is still received", async () => {
      const { member, captain } = await people();
      const payment = await received(member.id, captain.id);
      const asked = await requestRefund({
        paymentId: payment.id,
        amountCents: 50_000,
        note: null,
        actorId: captain.id,
        today: "2027-02-20",
      });
      if (!asked.ok) throw new Error(asked.error);
      // A payment moved off received some other way (data from before the
      // hold above): the refund can't be paid out against it.
      await h
        .db()
        .update(schema.payments)
        .set({ status: "pending" })
        .where(eq(schema.payments.id, payment.id));

      expect(
        await decideRefund({
          refundId: asked.id,
          to: "refunded",
          amountCents: 50_000,
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: REFUND_PAYMENT_NOT_RECEIVED });
      const [refund] = await h
        .db()
        .select({ status: schema.paymentRefunds.status })
        .from(schema.paymentRefunds)
        .where(eq(schema.paymentRefunds.id, asked.id));
      expect(refund!.status).toBe("requested");
    });

    it("refuses a refund of a payment not received", async () => {
      const { member, captain } = await people();
      const pending = await recordPayment({
        userId: member.id,
        amountCents: 1_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: captain.id,
      });
      expect(
        await requestRefund({
          paymentId: pending.id,
          amountCents: 1_000,
          note: null,
          actorId: captain.id,
          today: "2027-02-20",
        }),
      ).toEqual({ ok: false, error: REFUND_NOT_RECEIVED });
    });
  });

  describe("erasure", () => {
    it("clears proof files, a concession's reason and refund words", async () => {
      const { member, captain } = await people();
      await setFee({
        userId: member.id,
        cycle: YEAR,
        amountCents: 1_000,
        concessionReason: "Private circumstances",
        expectedFeeId: null,
        actorId: captain.id,
      });
      await recordPayment({
        userId: member.id,
        amountCents: 1_000,
        currency: "ZAR",
        status: "pending",
        recordedByUserId: member.id,
        source: "member",
        proofPathname: `payment-proofs/${member.id}/a.pdf`,
        proofContentType: "application/pdf",
      });
      expect((await sanitiseAccount(member.id)).ok).toBe(true);
      const [charge] = await h
        .db()
        .select({ reason: schema.duesCharges.concessionReason })
        .from(schema.duesCharges)
        .where(eq(schema.duesCharges.userId, member.id));
      expect(charge!.reason).toBeNull();
      const [payment] = await h
        .db()
        .select({ proof: schema.payments.proofPathname })
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.userId, member.id),
            eq(schema.payments.cycle, YEAR),
          ),
        );
      expect(payment!.proof).toBeNull();
    });
  });
});
