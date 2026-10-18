// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEE_ALREADY_SET,
  FEE_CHANGED,
  CHARGE_GONE,
  NOT_A_MONEY_KEEPER,
  NOT_YOUR_PAYMENT,
  PLAN_CHANGED,
  REFUND_ALREADY_OPEN,
  REFUND_CHANGED,
  REFUND_NOT_RECEIVED,
  YEAR_CHANGED,
} from "@camp404/db/dues";
import {
  NO_TIERS_YET,
  PLEDGE_NOT_BELOW,
  REFUND_TOO_LARGE,
  SETTLE_UP_CHANGED,
  SETTLE_UP_NOBODY,
  TIER_GONE,
  TOO_MANY_TIERS,
  MAX_FEE_TIERS,
} from "@camp404/core";
import { MANUAL_CHARGE_KINDS } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, outcome, YEAR, type People } from "./_agreement";

// Dues (#240), through lib/dues.ts, on the database and on the E2E store: the
// same people, the same calls, the same answers and refusal sentences. The
// rules both sides apply are one set of functions in @camp404/core; this
// holds the rest (who may write, the compare-and-sets, the reads) equal.
// See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addCharge,
  addFeeTier,
  archiveFeeTier,
  cancelCharge,
  decideRefund,
  editFeeTier,
  getDuesYear,
  getMemberDues,
  getPaymentProof,
  listDuesAccounts,
  listFeeTiers,
  publishSettleUp,
  requestRefund,
  saveDuesYear,
  savePledge,
  setFee,
  setPaymentPlan,
  settleUpCandidates,
  statementContext,
} from "../dues";
import { recordPayment, setPaymentStatus } from "../payments";

const TODAY = `${YEAR}-03-01`;
const NOBODY = "00000000-0000-4000-8000-000000000000";
const OTHER_KIND = MANUAL_CHARGE_KINDS[1];

const noDates = {
  deadline: null,
  fullRefundUntil: null,
  partialRefundUntil: null,
  partialRefundPct: null,
};

/** The year's three tiers, added by the Finance lead; cheapest first. */
async function threeTiers(p: People) {
  for (const [label, amountCents] of [
    ["Supporter", 300_000],
    ["Standard", 200_000],
    ["Low", 100_000],
  ] as const) {
    await addFeeTier({
      label,
      amountCents,
      cycle: YEAR,
      actorId: p.financeLead,
    });
  }
  return listFeeTiers(YEAR);
}

/** The member's live fee id, as a Finance screen sees it. */
async function liveFeeId(userId: string): Promise<string | null> {
  const dues = await getMemberDues(userId, YEAR, {
    forFinance: true,
    today: TODAY,
  });
  return (
    dues?.charges.find((c) => c.kind === "fee" && !c.cancelled)?.id ?? null
  );
}

describe("dues: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("keeps the year's dates and tiers for the Finance team only", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const save = (actorId: string, expectedVersion: number) =>
        saveDuesYear({
          ...noDates,
          deadline: `${YEAR}-04-01`,
          cycle: YEAR,
          expectedVersion,
          actorId,
        });
      const tier = (actorId: string) =>
        addFeeTier({
          label: "Standard",
          amountCents: 200_000,
          cycle: YEAR,
          actorId,
        });
      const out = {
        empty: await getDuesYear(YEAR),
        captain: await save(p.captain, 0),
        stale: await save(p.financeLead, 0),
        finance: await save(p.financeLead, 1),
        leadOfAnotherTeam: await save(p.kitchenLead, 2),
        member: await save(p.member, 2),
        year: await getDuesYear(YEAR),
        tierByMember: await tier(p.member),
        tierByKitchen: await tier(p.kitchenLead),
        tiers: await threeTiers(p),
      };
      const [cheapest, middle] = out.tiers;
      return {
        ...out,
        edit: await editFeeTier({
          tierId: middle!.id,
          label: "Standard plus",
          amountCents: 250_000,
          actorId: p.captain,
        }),
        archive: await archiveFeeTier({
          tierId: cheapest!.id,
          actorId: p.financeLead,
        }),
        archiveAgain: await archiveFeeTier({
          tierId: cheapest!.id,
          actorId: p.financeLead,
        }),
        editGone: await editFeeTier({
          tierId: cheapest!.id,
          label: "Low",
          amountCents: 1,
          actorId: p.captain,
        }),
        editByMember: await editFeeTier({
          tierId: middle!.id,
          label: "Mine",
          amountCents: 1,
          actorId: p.member,
        }),
        live: await listFeeTiers(YEAR),
        all: await listFeeTiers(YEAR, { includeArchived: true }),
      };
    });
    expect(db).toMatchObject({
      captain: { ok: true, version: 1 },
      stale: { ok: false, error: YEAR_CHANGED },
      finance: { ok: true, version: 2 },
      leadOfAnotherTeam: { ok: false, error: NOT_A_MONEY_KEEPER },
      member: { ok: false, error: NOT_A_MONEY_KEEPER },
      year: { deadline: `${YEAR}-04-01`, version: 2 },
      tierByMember: { ok: false, error: NOT_A_MONEY_KEEPER },
      tierByKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      archiveAgain: { ok: false, error: TIER_GONE },
      editGone: { ok: false, error: TIER_GONE },
      editByMember: { ok: false, error: NOT_A_MONEY_KEEPER },
    });
    expect(store).toEqual(db);
  });

  it("stops at the most tiers a year may have", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const results = [];
      for (let i = 0; i <= MAX_FEE_TIERS; i++) {
        results.push(
          await addFeeTier({
            label: `Tier ${i}`,
            amountCents: 1000 * (i + 1),
            cycle: YEAR,
            actorId: p.captain,
          }),
        );
      }
      return { last: results.at(-1), count: (await listFeeTiers(YEAR)).length };
    });
    expect(db).toEqual({
      last: { ok: false, error: TOO_MANY_TIERS },
      count: MAX_FEE_TIERS,
    });
    expect(store).toEqual(db);
  });

  it("takes a member's pledge, charges it once they are accepted, and lets only Finance change the fee", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const pledge = (
        userId: string,
        input: Parameters<typeof savePledge>[0]["pledge"],
      ) => savePledge({ userId, cycle: YEAR, pledge: input });
      const before = await pledge(p.member, {
        kind: "below",
        amountCents: 50_000,
      });
      const tiers = await threeTiers(p);
      await seed.participation(p.member, "accepted");
      await seed.participation(p.other, "applied");
      const out = {
        before,
        notBelow: await pledge(p.other, {
          kind: "below",
          amountCents: tiers[0]!.amountCents,
        }),
        tierGone: await pledge(p.other, { kind: "tier", tierId: NOBODY }),
        nobody: await pledge(NOBODY, { kind: "tier", tierId: tiers[1]!.id }),
        notAccepted: await pledge(p.other, {
          kind: "below",
          amountCents: 40_000,
        }),
        accepted: await pledge(p.member, {
          kind: "tier",
          tierId: tiers[1]!.id,
        }),
        again: await pledge(p.member, { kind: "tier", tierId: tiers[0]!.id }),
      };
      const fee = await liveFeeId(p.member);
      const setTo = (
        actorId: string,
        expectedFeeId: string | null,
        amountCents: number,
        concessionReason: string | null = null,
      ) =>
        setFee({
          userId: p.member,
          amountCents,
          concessionReason,
          cycle: YEAR,
          expectedFeeId,
          actorId,
        });
      return {
        ...out,
        feeByKitchen: await setTo(p.kitchenLead, fee, 1),
        feeByMember: await setTo(p.member, fee, 1),
        feeStale: await setTo(p.captain, null, 150_000),
        concession: await setTo(p.financeLead, fee, 150_000, "Student"),
        feeForOther: await setFee({
          userId: p.other,
          amountCents: 90_000,
          concessionReason: null,
          cycle: YEAR,
          expectedFeeId: null,
          actorId: p.captain,
        }),
        feeForNobody: await setFee({
          userId: NOBODY,
          amountCents: 1,
          concessionReason: null,
          cycle: YEAR,
          expectedFeeId: null,
          actorId: p.captain,
        }),
        forFinance: await getMemberDues(p.member, YEAR, {
          forFinance: true,
          today: TODAY,
        }),
        own: await getMemberDues(p.member, YEAR, {
          forFinance: false,
          today: TODAY,
        }),
        nobodyDues: await getMemberDues(NOBODY, YEAR, {
          forFinance: true,
          today: TODAY,
        }),
        accounts: await listDuesAccounts(YEAR, TODAY),
      };
    });
    expect(db).toMatchObject({
      before: { ok: false, error: NO_TIERS_YET },
      notBelow: { ok: false, error: PLEDGE_NOT_BELOW },
      tierGone: { ok: false, error: TIER_GONE },
      notAccepted: { ok: true, charged: false },
      accepted: { ok: true, charged: true },
      again: { ok: false, error: FEE_ALREADY_SET },
      feeByKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      feeByMember: { ok: false, error: NOT_A_MONEY_KEEPER },
      feeStale: { ok: false, error: FEE_CHANGED },
      concession: { ok: true },
      feeForOther: { ok: true },
      nobodyDues: null,
      own: { charges: [{ concessionReason: null }, { concession: false }] },
    });
    expect(store).toEqual(db);
  });

  it("adds and cancels charges and replaces a plan, each a compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const charge = (actorId: string) =>
        addCharge({
          userId: p.member,
          kind: OTHER_KIND,
          description: "Camp t-shirt",
          amountCents: 25_000,
          cycle: YEAR,
          actorId,
        });
      const added = await charge(p.financeLead);
      const id = added.ok ? added.id : NOBODY;
      const plan = (actorId: string, expectedVersion: number) =>
        setPaymentPlan({
          userId: p.member,
          instalments: [
            { dueOn: `${YEAR}-02-01`, amountCents: 10_000 },
            { dueOn: `${YEAR}-04-01`, amountCents: 15_000 },
          ],
          expectedVersion,
          cycle: YEAR,
          actorId,
        });
      return {
        added,
        byKitchen: await charge(p.kitchenLead),
        cancelByMember: await cancelCharge({ chargeId: id, actorId: p.member }),
        cancel: await cancelCharge({ chargeId: id, actorId: p.captain }),
        cancelAgain: await cancelCharge({ chargeId: id, actorId: p.captain }),
        plan: await plan(p.financeLead, 0),
        planStale: await plan(p.captain, 0),
        planByKitchen: await plan(p.kitchenLead, 1),
        dues: await getMemberDues(p.member, YEAR, {
          forFinance: true,
          today: TODAY,
        }),
      };
    });
    expect(db).toMatchObject({
      added: { ok: true },
      byKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      cancelByMember: { ok: false, error: NOT_A_MONEY_KEEPER },
      cancel: { ok: true },
      cancelAgain: { ok: false, error: CHARGE_GONE },
      plan: { ok: true, version: 1 },
      planStale: { ok: false, error: PLAN_CHANGED },
      planByKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
    });
    expect(store).toEqual(db);
  });

  it("shares a settle-up across the members the Finance team previewed", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const publish = (
        actorId: string,
        previewedUserIds: readonly string[],
        skipConcessions = false,
      ) =>
        publishSettleUp({
          description: "Generator fuel",
          totalCents: 60_000,
          direction: "top_up",
          skipConcessions,
          cycle: YEAR,
          previewedUserIds,
          actorId,
        });
      const nobody = await publish(p.captain, []);
      for (const [userId, reason] of [
        [p.member, null],
        [p.other, null],
        [p.kitchenLead, "Hardship"],
      ] as const) {
        await setFee({
          userId,
          amountCents: 100_000,
          concessionReason: reason,
          cycle: YEAR,
          expectedFeeId: null,
          actorId: p.captain,
        });
      }
      const everyone = [p.member, p.other, p.kitchenLead];
      return {
        nobody,
        candidates: await settleUpCandidates(YEAR),
        byKitchen: await publish(p.kitchenLead, everyone),
        changed: await publish(p.captain, [p.member]),
        skipped: await publish(p.financeLead, [p.member, p.other], true),
        member: await getMemberDues(p.member, YEAR, {
          forFinance: true,
          today: TODAY,
        }),
        concession: await getMemberDues(p.kitchenLead, YEAR, {
          forFinance: true,
          today: TODAY,
        }),
      };
    });
    expect(db).toMatchObject({
      nobody: { ok: false, error: SETTLE_UP_NOBODY },
      byKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      changed: { ok: false, error: SETTLE_UP_CHANGED },
      skipped: { ok: true, members: 2 },
    });
    expect(store).toEqual(db);
  });

  it("refunds a received payment once, at the schedule's amount or Finance's", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await saveDuesYear({
        ...noDates,
        fullRefundUntil: `${YEAR}-02-01`,
        partialRefundUntil: `${YEAR}-04-01`,
        partialRefundPct: 50,
        cycle: YEAR,
        expectedVersion: 0,
        actorId: p.captain,
      });
      const pay = (userId: string, status: "pending" | "reconciled") =>
        recordPayment({
          userId,
          amountCents: 100_000,
          currency: "ZAR",
          status,
          recordedByUserId: p.captain,
        });
      const paid = await pay(p.member, "reconciled");
      const pending = await pay(p.other, "pending");
      const ask = (
        paymentId: string,
        actorId: string,
        amountCents: number | null,
      ) =>
        requestRefund({
          paymentId,
          amountCents,
          note: amountCents === null ? null : "Asked by phone",
          actorId,
          today: TODAY,
        });
      const out = {
        notYours: await ask(paid.id, p.other, null),
        byKitchen: await ask(paid.id, p.kitchenLead, 10_000),
        notReceived: await ask(pending.id, p.other, null),
        tooLarge: await ask(paid.id, p.financeLead, 100_001),
        own: await ask(paid.id, p.member, null),
        again: await ask(paid.id, p.captain, 10_000),
      };
      const refundId = out.own.ok ? out.own.id : NOBODY;
      const decide = (
        actorId: string,
        decision:
          | { to: "refunded"; amountCents: number }
          | { to: "declined"; reason: string },
      ) => decideRefund({ ...decision, refundId, actorId });
      return {
        ...out,
        decideByKitchen: await decide(p.kitchenLead, {
          to: "declined",
          reason: "No",
        }),
        decideTooLarge: await decide(p.financeLead, {
          to: "refunded",
          amountCents: 100_001,
        }),
        decide: await decide(p.financeLead, {
          to: "refunded",
          amountCents: 40_000,
        }),
        decideAgain: await decide(p.captain, { to: "declined", reason: "No" }),
        moveAfter: await outcome(() =>
          setPaymentStatus({
            paymentId: paid.id,
            from: "reconciled",
            to: "pending",
            actorId: p.captain,
          }),
        ),
        dues: await getMemberDues(p.member, YEAR, {
          forFinance: false,
          today: TODAY,
        }),
      };
    });
    expect(db).toMatchObject({
      notYours: { ok: false, error: NOT_YOUR_PAYMENT },
      byKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      notReceived: { ok: false, error: REFUND_NOT_RECEIVED },
      tooLarge: { ok: false, error: REFUND_TOO_LARGE },
      own: { ok: true },
      again: { ok: false, error: REFUND_ALREADY_OPEN },
      decideByKitchen: { ok: false, error: NOT_A_MONEY_KEEPER },
      decideTooLarge: { ok: false, error: REFUND_TOO_LARGE },
      decide: { ok: true },
      decideAgain: { ok: false, error: REFUND_CHANGED },
      moveAfter: { threw: expect.stringContaining("MoneyRefused") },
      dues: {
        payments: [{ refund: { status: "refunded", proposedCents: 50_000 } }],
      },
    });
    expect(store).toEqual(db);
  });

  it("finds a proof file and the statement import's context the same way", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const own = await recordPayment({
        userId: p.member,
        amountCents: 70_000,
        currency: "ZAR",
        status: "pending",
        source: "member",
        paidOn: `${YEAR}-02-02`,
        proofPathname: "payment-proofs/m/1.pdf",
        proofContentType: "application/pdf",
        recordedByUserId: p.member,
      });
      const bare = await recordPayment({
        userId: p.other,
        amountCents: 10_000,
        currency: "ZAR",
        status: "reconciled",
        recordedByUserId: p.captain,
      });
      const context = await statementContext(YEAR);
      return {
        proof: await getPaymentProof(own.id),
        noProof: await getPaymentProof(bare.id),
        nobody: await getPaymentProof(NOBODY),
        // The database reads the members in no order: sort them by name.
        members: [...context.members].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        payments: [...context.payments].sort(
          (a, b) => a.amountCents - b.amountCents,
        ),
      };
    });
    expect(db).toMatchObject({
      proof: { reference: "C404-M001-2027-1", contentType: "application/pdf" },
      noProof: null,
      nobody: null,
    });
    expect(store).toEqual(db);
  });
});
