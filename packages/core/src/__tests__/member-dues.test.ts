import { describe, expect, it } from "vitest";
import {
  duesAccountRow,
  feeChargeFromPledge,
  memberDues,
  type MemberDuesRows,
} from "../member-dues";

// A member's dues record, built once for both dues stores: what the Finance
// team reads, what the member reads of their own (no concession, no notes),
// the Finance list's line, and the fee a pledge charges.

const AT = new Date("2026-10-01T10:00:00.000Z");
const TODAY = "2026-11-10";

function rows(over: Partial<MemberDuesRows> = {}): MemberDuesRows {
  return {
    userId: "u1",
    cycle: 2027,
    name: "  Dusty  ",
    refCode: "C404-M017",
    account: {
      tierId: null,
      tierLabel: null,
      amountCents: 300_000,
      pledgedAt: AT,
      payBy: "all_by_end_dec",
      subsidy: false,
      planVersion: 2,
    },
    charges: [
      {
        id: "c-old",
        kind: "fee",
        description: "Camp fee: pledged amount",
        amountCents: 300_000,
        currency: "ZAR",
        standardAmountCents: null,
        concessionReason: null,
        cancelledAt: AT,
        createdAt: AT,
      },
      {
        id: "c-fee",
        kind: "fee",
        description: "Camp fee",
        amountCents: 200_000,
        currency: "ZAR",
        standardAmountCents: 300_000,
        concessionReason: "Student this year",
        cancelledAt: null,
        createdAt: AT,
      },
    ],
    payments: [
      {
        id: "p2",
        reference: "C404-M017",
        amountCents: 50_000,
        currency: "ZAR",
        status: "pending",
        source: "member",
        method: "bank_transfer",
        paidOn: "2026-11-01",
        proofPathname: "proofs/u1/p2.pdf",
        note: "Matched by hand",
        createdAt: AT,
      },
      {
        id: "p1",
        reference: "C404-M017",
        amountCents: 100_000,
        currency: "ZAR",
        status: "reconciled",
        source: "statement",
        method: null,
        paidOn: "2026-10-20",
        proofPathname: null,
        note: "From the October statement",
        createdAt: AT,
      },
    ],
    refunds: [
      {
        id: "r1",
        paymentId: "p1",
        status: "requested",
        proposedCents: 20_000,
        amountCents: 20_000,
        currency: "ZAR",
        note: "Leaving early, asked on the phone",
        declineReason: null,
        decidedAt: null,
        createdAt: AT,
      },
    ],
    instalments: [
      { dueOn: "2026-11-30", amountCents: 100_000 },
      { dueOn: "2026-12-31", amountCents: 100_000 },
    ],
    participation: {
      status: "not_attending",
      updatedAt: new Date("2026-10-05T23:30:00.000Z"),
    },
    ...over,
  };
}

describe("memberDues", () => {
  it("gives the Finance team the concession and every note", () => {
    const dues = memberDues(rows(), { forFinance: true, today: TODAY });
    const fee = dues.charges.find((c) => c.id === "c-fee")!;
    expect(fee).toMatchObject({
      standardAmountCents: 300_000,
      concessionReason: "Student this year",
      concession: true,
      cancelled: false,
    });
    expect(dues.payments.map((p) => p.note)).toEqual([
      "Matched by hand",
      "From the October statement",
    ]);
    expect(dues.payments[1]!.refund?.note).toBe(
      "Leaving early, asked on the phone",
    );
  });

  it("leaves the concession and the notes out of the member's own read", () => {
    const dues = memberDues(rows(), { forFinance: false, today: TODAY });
    for (const c of dues.charges) {
      expect(c).toMatchObject({
        standardAmountCents: null,
        concessionReason: null,
        concession: false,
      });
    }
    expect(dues.payments.map((p) => p.note)).toEqual([null, null]);
    expect(dues.payments[1]!.refund?.note).toBeNull();
    // What is theirs to see stays.
    expect(dues.payments[1]!.refund?.amountCents).toBe(20_000);
    expect(dues.charges.find((c) => c.id === "c-fee")!.amountCents).toBe(
      200_000,
    );
    expect(JSON.stringify(dues)).not.toMatch(
      /Student|Matched|October statement|Leaving early/,
    );
  });

  it("counts live charges only, with the same figures for both readers", () => {
    const finance = memberDues(rows(), { forFinance: true, today: TODAY });
    const own = memberDues(rows(), { forFinance: false, today: TODAY });
    expect(finance.balance).toEqual({
      chargedCents: 200_000,
      paidCents: 100_000,
      pendingCents: 50_000,
      refundedCents: 0,
      balanceCents: 100_000,
    });
    expect(own.balance).toEqual(finance.balance);
    expect(own.feeTotalCents).toBe(200_000);
    expect(own.feeOwingCents).toBe(100_000);
    expect(own.burnYear).toBe(2027);
    expect(own.next).toEqual(finance.next);
    expect(own.feeNext).toEqual(finance.feeNext);
  });

  it("names the member, their pledge, proof and the day they withdrew", () => {
    const dues = memberDues(rows(), { forFinance: false, today: TODAY });
    expect(dues.name).toBe("Dusty");
    expect(dues.pledge).toEqual({
      tierId: null,
      tierLabel: null,
      amountCents: 300_000,
      pledgedAt: AT,
    });
    expect(dues.planVersion).toBe(2);
    expect(dues.payments.map((p) => p.hasProof)).toEqual([true, false]);
    // 23:30 UTC is the next camp day (GMT+2).
    expect(dues.participation).toEqual({
      status: "not_attending",
      withdrewOn: "2026-10-06",
    });
  });

  it("reads a member with no account and no place", () => {
    const dues = memberDues(
      rows({
        name: " ",
        account: null,
        charges: [],
        payments: [],
        refunds: [],
        instalments: [],
        participation: null,
      }),
      { forFinance: true, today: TODAY },
    );
    expect(dues).toMatchObject({
      name: "Unnamed burner",
      pledge: null,
      payBy: null,
      subsidy: false,
      planVersion: 0,
      participation: null,
      feeTotalCents: 0,
      feeNext: { kind: "no_pledge" },
    });
  });
});

describe("duesAccountRow", () => {
  it("is the Finance team's line, concession included", () => {
    const row = duesAccountRow(rows(), TODAY);
    expect(row).toMatchObject({
      userId: "u1",
      name: "Dusty",
      participation: "not_attending",
      pledgeCents: 300_000,
      pledgeLabel: null,
      feeCents: 200_000,
      concession: true,
      pendingProofs: 1,
      openRefunds: 1,
      plan: rows().instalments,
    });
    expect(row.figures).toMatchObject({
      inBankCents: 100_000,
      toCheckCents: 50_000,
      toCheckCount: 1,
    });
  });

  it("has no fee when the only fee is cancelled", () => {
    const row = duesAccountRow(
      rows({ charges: rows().charges.slice(0, 1) }),
      TODAY,
    );
    expect(row.feeCents).toBeNull();
    expect(row.concession).toBe(false);
  });
});

describe("feeChargeFromPledge", () => {
  it("charges the pledged amount, worded by its tier or as pledged", () => {
    expect(
      feeChargeFromPledge({ amountCents: 250_000, tierLabel: "Builder" }),
    ).toEqual({ description: "Camp fee: Builder", amountCents: 250_000 });
    expect(
      feeChargeFromPledge({ amountCents: 250_000, tierLabel: null }),
    ).toEqual({
      description: "Camp fee: pledged amount",
      amountCents: 250_000,
    });
  });

  it("charges nothing for no pledge or a subsidy pledge of R0", () => {
    expect(feeChargeFromPledge(null)).toBeNull();
    expect(feeChargeFromPledge(undefined)).toBeNull();
    expect(
      feeChargeFromPledge({ amountCents: null, tierLabel: null }),
    ).toBeNull();
    expect(feeChargeFromPledge({ amountCents: 0, tierLabel: null })).toBeNull();
  });
});
