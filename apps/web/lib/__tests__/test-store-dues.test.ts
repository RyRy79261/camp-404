import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FEE_ALREADY_SET,
  FEE_CHANGED,
  NOT_A_MONEY_KEEPER,
  REFUND_ALREADY_OPEN,
  SETTLE_UP_CHANGED,
} from "@camp404/db/dues";
import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import { testStore } from "../test-store";
import { duesTestStore } from "../test-store-dues";

// The E2E twin of @camp404/db/dues (#240). Playwright drives the dues screens
// through it, so it keeps the database module's rules, case for case with
// packages/db/src/__tests__/dues.test.ts: only a captain or a Finance lead
// writes, a pledge becomes the fee when the member is accepted, the
// compare-and-sets, the settle-up adding up, and the roster's paid state.

const YEAR = 2027;

function foundedAt(year: number): void {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [{ year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null }],
  };
  testStore.setTeamsConfig(config satisfies TeamsConfig);
}

function user(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function people() {
  const captain = user("Cap", "captain");
  const financeLead = user("Fin");
  testStore.seedTeamMembership({
    userId: financeLead.id,
    team: "finance",
    isLead: true,
  });
  const kitchenLead = user("Kit");
  testStore.seedTeamMembership({
    userId: kitchenLead.id,
    team: "kitchen",
    isLead: true,
  });
  const member = user("Nova");
  return { captain, financeLead, kitchenLead, member };
}

beforeEach(() => {
  testStore.reset();
  foundedAt(YEAR);
});

describe("the dues twin", () => {
  it("lets a captain and a Finance lead write, and refuses a lead of another team", () => {
    const { captain, financeLead, kitchenLead, member } = people();
    for (const actor of [captain, financeLead]) {
      expect(
        duesTestStore.addFeeTier({
          cycle: YEAR,
          label: `Tier ${actor.displayName}`,
          amountCents: 100_000,
          actorId: actor.id,
        }).ok,
      ).toBe(true);
    }
    for (const actor of [kitchenLead, member]) {
      expect(
        duesTestStore.addFeeTier({
          cycle: YEAR,
          label: "Sneaky",
          amountCents: 1,
          actorId: actor.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
      expect(() =>
        testStore.recordPayment({
          userId: member.id,
          amountCents: 1,
          currency: "ZAR",
          status: "reconciled",
          recordedByUserId: actor.id,
        }),
      ).toThrow(NOT_A_MONEY_KEEPER);
    }
    expect(duesTestStore.listFeeTiers(YEAR)).toHaveLength(2);
  });

  it("charges the pledged fee when a captain accepts the member, once, and locks the pledge", () => {
    const { captain, member } = people();
    const tier = duesTestStore.addFeeTier({
      cycle: YEAR,
      label: "Base",
      amountCents: 200_000,
      actorId: captain.id,
    });
    if (!tier.ok) throw new Error(tier.error);
    testStore.seedParticipation({ userId: member.id, status: "applied" });
    expect(
      duesTestStore.savePledge({
        userId: member.id,
        cycle: YEAR,
        pledge: { kind: "tier", tierId: tier.id },
      }),
    ).toEqual({ ok: true, charged: false });
    testStore.decideParticipation({
      userId: member.id,
      from: "applied",
      to: "accepted",
      decidedByUserId: captain.id,
    });
    const dues = duesTestStore.getMemberDues(member.id, YEAR, {
      forFinance: true,
    })!;
    expect(dues.charges).toMatchObject([
      { kind: "fee", description: "Camp fee: Base", amountCents: 200_000 },
    ]);
    expect(
      duesTestStore.savePledge({
        userId: member.id,
        cycle: YEAR,
        pledge: { kind: "below", amountCents: 1 },
      }),
    ).toEqual({ ok: false, error: FEE_ALREADY_SET });

    // A stale fee id loses the compare-and-set.
    const feeId = dues.charges[0]!.id;
    expect(
      duesTestStore.setFee({
        userId: member.id,
        cycle: YEAR,
        amountCents: 100_000,
        concessionReason: "Student",
        expectedFeeId: feeId,
        actorId: captain.id,
      }).ok,
    ).toBe(true);
    expect(
      duesTestStore.setFee({
        userId: member.id,
        cycle: YEAR,
        amountCents: 1,
        concessionReason: null,
        expectedFeeId: feeId,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: FEE_CHANGED });
    const own = duesTestStore.getMemberDues(member.id, YEAR, {
      forFinance: false,
    })!;
    expect(own.charges.map((c) => c.concessionReason)).toEqual([null, null]);
    expect(own.balance.balanceCents).toBe(100_000);
  });

  it("drives the roster's paid state by the balance", () => {
    const { captain, member } = people();
    const paid = () =>
      testStore.getCampManagementRoster().find((r) => r.id === member.id)
        ?.duesPaid;
    duesTestStore.addCharge({
      userId: member.id,
      kind: "other",
      description: "Camp fee",
      amountCents: 5_000,
      cycle: YEAR,
      actorId: captain.id,
    });
    testStore.recordPayment({
      userId: member.id,
      amountCents: 1_000,
      currency: "ZAR",
      status: "reconciled",
      recordedByUserId: captain.id,
    });
    expect(paid()).toBe(false);
    testStore.recordPayment({
      userId: member.id,
      amountCents: 4_000,
      currency: "ZAR",
      status: "waived",
      recordedByUserId: captain.id,
    });
    expect(paid()).toBe(true);
  });

  it("publishes a settle-up that adds up, and refuses a stale preview", () => {
    const { captain } = people();
    const members = ["A", "B", "C"].map((n) => user(n));
    for (const m of members) {
      duesTestStore.setFee({
        userId: m.id,
        cycle: YEAR,
        amountCents: 1_000,
        concessionReason: null,
        expectedFeeId: null,
        actorId: captain.id,
      });
    }
    expect(
      duesTestStore.publishSettleUp({
        description: "Gas",
        totalCents: 100,
        direction: "top_up",
        skipConcessions: false,
        cycle: YEAR,
        previewedUserIds: members.slice(0, 2).map((m) => m.id),
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: SETTLE_UP_CHANGED });
    const result = duesTestStore.publishSettleUp({
      description: "Gas",
      totalCents: 100,
      direction: "top_up",
      skipConcessions: false,
      cycle: YEAR,
      previewedUserIds: members.map((m) => m.id),
      actorId: captain.id,
    });
    expect(result).toMatchObject({ ok: true, members: 3 });
    const shares = members.map(
      (m) =>
        duesTestStore
          .getMemberDues(m.id, YEAR, { forFinance: true })!
          .charges.find((c) => c.kind === "settle_up")!.amountCents,
    );
    expect(shares.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it("asks for one refund per payment, and counts a paid one as money going out", () => {
    const { captain, financeLead, member } = people();
    duesTestStore.addCharge({
      userId: member.id,
      kind: "other",
      description: "Camp fee",
      amountCents: 10_000,
      cycle: YEAR,
      actorId: captain.id,
    });
    const payment = testStore.recordPayment({
      userId: member.id,
      amountCents: 10_000,
      currency: "ZAR",
      status: "reconciled",
      recordedByUserId: captain.id,
    });
    const asked = duesTestStore.requestRefund({
      paymentId: payment.id,
      amountCents: null,
      note: null,
      actorId: member.id,
      today: "2027-02-01",
    });
    if (!asked.ok) throw new Error(asked.error);
    expect(
      duesTestStore.requestRefund({
        paymentId: payment.id,
        amountCents: 1,
        note: null,
        actorId: captain.id,
        today: "2027-02-01",
      }),
    ).toEqual({ ok: false, error: REFUND_ALREADY_OPEN });
    expect(
      duesTestStore.decideRefund({
        refundId: asked.id,
        to: "refunded",
        amountCents: 4_000,
        actorId: financeLead.id,
      }),
    ).toEqual({ ok: true });
    expect(
      duesTestStore.getMemberDues(member.id, YEAR, { forFinance: false })!
        .balance.balanceCents,
    ).toBe(4_000);
    expect(testStore.listPayments(YEAR)[0]!.refundStatus).toBe("refunded");
  });
});
