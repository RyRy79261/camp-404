import { describe, expect, it } from "vitest";
import { formatMoney } from "@camp404/core";
import {
  FINANCE_LINKS,
  FINANCE_MEMBER_NOTE,
  financeGlance,
  type FinanceGlanceInput,
} from "../team-glance/finance";

// The Finance team page's panel: a member reads only their own fees; a money
// keeper reads the camp's figures, with what needs attention first.

const keeper = (
  over: Partial<Extract<FinanceGlanceInput, { view: "keeper" }>> = {},
): FinanceGlanceInput => ({
  view: "keeper",
  today: "2027-03-10",
  collecting: true,
  totals: {
    pledgedCents: 9_600_000,
    paidCents: 4_200_000,
    paidUpCount: 6,
    nextDue: { dueOn: "2027-04-01", amountCents: 1_200_000, count: 4 },
  },
  pendingPayments: 4,
  claimsToPay: { count: 2, cents: 185_000 },
  bills: [
    { dueOn: "2027-03-01", amountCents: 50_000 },
    { dueOn: "2027-04-09", amountCents: 600_000 },
    { dueOn: "2027-04-10", amountCents: 1_000_000 },
  ],
  inBank: { amountCents: 2_480_000, asOf: "2027-03-08" },
  overBudget: [{ label: "Kitchen", overCents: 60_000 }],
  ...over,
});

describe("financeGlance", () => {
  it("shows a member only their own fees, with the next payment", () => {
    const g = financeGlance({
      view: "member",
      mine: {
        feeTotalCents: 480_000,
        paidCents: 360_000,
        owingCents: 120_000,
        subsidy: false,
        next: {
          kind: "due",
          dueOn: "2027-03-01",
          amountCents: 120_000,
          overdue: false,
          first: false,
          source: "plan",
        },
      },
    });
    expect(g.tiles).toHaveLength(1);
    expect(g.tiles[0]).toMatchObject({
      label: "Your fees",
      value: `${formatMoney(120_000)} left`,
      progress: { value: 360_000, max: 480_000 },
    });
    expect(g.tiles[0]!.hint).toContain(formatMoney(480_000));
    expect(g.tiles[0]!.hint).toContain("1 Mar");
    expect(g.links).toEqual([FINANCE_LINKS.myDues]);
    expect(g.note).toBe(FINANCE_MEMBER_NOTE);
    expect(g.attention).toEqual([]);
  });

  it("flags a member's overdue payment, says paid up, and says nothing yet", () => {
    const overdue = financeGlance({
      view: "member",
      mine: {
        feeTotalCents: 480_000,
        paidCents: 0,
        owingCents: 480_000,
        subsidy: false,
        next: {
          kind: "due",
          dueOn: "2027-03-01",
          amountCents: 240_000,
          overdue: true,
          first: true,
          source: "plan",
        },
      },
    });
    expect(overdue.tiles[0]!.tone).toBe("bad");
    expect(overdue.attention[0]).toMatchObject({ tone: "bad" });

    const paid = financeGlance({
      view: "member",
      mine: {
        feeTotalCents: 480_000,
        paidCents: 480_000,
        owingCents: 0,
        subsidy: false,
        next: { kind: "paid_up" },
      },
    });
    expect(paid.tiles[0]).toMatchObject({ value: "Paid up", tone: "ok" });

    expect(financeGlance({ view: "member", mine: null }).tiles[0]!.value).toBe(
      "Nothing yet",
    );
  });

  it("gives a money keeper the camp's figures, and never a member's name", () => {
    const g = financeGlance(keeper());
    const byKey = Object.fromEntries(g.tiles.map((t) => [t.key, t]));
    expect(byKey.collected).toMatchObject({
      value: formatMoney(4_200_000),
      progress: { value: 4_200_000, max: 9_600_000 },
    });
    expect(byKey.payments).toMatchObject({ value: "4", tone: "warn" });
    expect(byKey.claims).toMatchObject({ value: "2", tone: "warn" });
    expect(byKey.claims!.hint).toContain(formatMoney(185_000));
    // The overdue one and the one 30 days out count; the 31st day does not.
    expect(byKey.bills).toMatchObject({
      value: formatMoney(650_000),
      tone: "bad",
    });
    expect(byKey.bills!.hint).toContain("2 payments");
    expect(byKey.bills!.hint).toContain(formatMoney(2_480_000));
    expect(g.attention.map((a) => a.key)).toEqual([
      "bills-overdue",
      "over-Kitchen",
      "payments",
      "claims",
      "next-due",
    ]);
    expect(g.note).toBeUndefined();
    expect(g.links).toContainEqual(FINANCE_LINKS.claims);
  });

  it("says when fees are not being collected", () => {
    const g = financeGlance(
      keeper({
        collecting: false,
        overBudget: [],
        pendingPayments: 0,
        claimsToPay: { count: 0, cents: 0 },
        bills: [],
      }),
    );
    expect(g.attention).toEqual([
      expect.objectContaining({ key: "collecting", tone: "warn" }),
    ]);
  });
});
