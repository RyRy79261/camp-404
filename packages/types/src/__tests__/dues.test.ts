import { describe, expect, it } from "vitest";
import {
  ChargeInput,
  DuesYearInput,
  EditFeeTierInput,
  FeeTierInput,
  MemberRefundRequestInput,
  PaymentPlanInput,
  PaymentProofInput,
  PledgeInput,
  RefundDecisionInput,
  RefundRequestInput,
  SetFeeInput,
  SettleUpInput,
  StatementConfirmInput,
} from "../dues";

// The dues shapes (#240): whole positive cents only, real calendar days, a
// blank note is none, and each refusal is a sentence a person can act on.

const TIER = "5f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";
const first = (r: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (r.success ? null : r.error!.issues[0]!.message);

describe("dues shapes", () => {
  it("takes whole positive cents and refuses anything else", () => {
    expect(
      FeeTierInput.parse({ label: " Base ", amountCents: 150_000 }),
    ).toEqual({ label: "Base", amountCents: 150_000 });
    expect(
      first(FeeTierInput.safeParse({ label: "Base", amountCents: 0 })),
    ).toBe("The amount must be more than R0.");
    expect(
      first(FeeTierInput.safeParse({ label: "Base", amountCents: 1.5 })),
    ).toBe("Type an amount in rands, like 1250 or 1250,50.");
    expect(first(FeeTierInput.safeParse({ label: "", amountCents: 1 }))).toBe(
      "Give the tier a name.",
    );
    expect(
      EditFeeTierInput.safeParse({ tierId: TIER, label: "B", amountCents: 1 })
        .success,
    ).toBe(true);
  });

  it("takes only calendar days that exist", () => {
    const proof = (paidOn: string) =>
      PaymentProofInput.safeParse({
        amountCents: 100,
        paidOn,
        method: "bank_transfer",
        note: "  ",
      });
    expect(proof("2027-02-28").data?.note).toBeNull();
    expect(first(proof("2027-02-30"))).toBe("Pick a date.");
    expect(first(proof("tomorrow"))).toBe("Pick a date.");
  });

  it("needs a partial refund's day and percentage together, after the full refund", () => {
    const year = (over: object) =>
      DuesYearInput.safeParse({
        deadline: null,
        fullRefundUntil: "2027-01-31",
        partialRefundUntil: "2027-02-28",
        partialRefundPct: 50,
        expectedVersion: 0,
        ...over,
      });
    expect(year({}).success).toBe(true);
    expect(first(year({ partialRefundPct: null }))).toBe(
      "A partial refund needs both its last day and its percentage.",
    );
    expect(first(year({ partialRefundUntil: "2027-01-01" }))).toBe(
      "The partial refund must end after the full refund does.",
    );
    expect(first(year({ partialRefundPct: 100 }))).toBe(
      "Type a percentage from 1 to 99.",
    );
  });

  it("gives each instalment its own day", () => {
    const plan = (days: string[]) =>
      PaymentPlanInput.safeParse({
        userId: "m1",
        instalments: days.map((dueOn) => ({ dueOn, amountCents: 100 })),
        expectedVersion: 0,
      });
    expect(plan(["2027-01-01", "2027-02-01"]).success).toBe(true);
    expect(first(plan(["2027-01-01", "2027-01-01"]))).toBe(
      "Give each instalment its own date.",
    );
  });

  it("takes any whole-rand pledge with a by-when, or a subsidy with R0", () => {
    const pledge = (over: Record<string, unknown>) =>
      PledgeInput.safeParse({
        amountCents: 720_000,
        payBy: "part_by_end_nov",
        subsidy: false,
        ...over,
      });
    expect(pledge({}).success).toBe(true);
    expect(pledge({ amountCents: 5_000_000 }).success).toBe(true);
    expect(first(pledge({ amountCents: 720_050 }))).toBe(
      "Type a whole number of rands.",
    );
    expect(first(pledge({ amountCents: 0 }))).toBe(
      "The amount must be more than R0, or tick that you need a subsidy.",
    );
    expect(first(pledge({ payBy: null }))).toBe("Pick when you can pay it.");
    expect(first(pledge({ payBy: "someday" }))).toBe(
      "Pick when you can pay it.",
    );
    expect(pledge({ amountCents: 0, payBy: null, subsidy: true }).success).toBe(
      true,
    );
    expect(first(pledge({ amountCents: -100, subsidy: true }))).toBe(
      "The amount can't be below R0.",
    );
  });

  it("reads the other shapes", () => {
    expect(
      ChargeInput.safeParse({
        userId: "m1",
        kind: "fee",
        description: "x",
        amountCents: 1,
      }).success,
    ).toBe(false);
    expect(
      SetFeeInput.parse({ userId: "m1", amountCents: 1, concessionReason: "" })
        .concessionReason,
    ).toBeNull();
    expect(
      SettleUpInput.safeParse({
        description: "Gas",
        totalCents: 100,
        direction: "sideways",
        skipConcessions: false,
      }).success,
    ).toBe(false);
    expect(
      StatementConfirmInput.safeParse({ kind: "reconcile", paymentId: "p1" })
        .success,
    ).toBe(true);
    expect(
      RefundRequestInput.safeParse({ paymentId: "p1", amountCents: 1 }).success,
    ).toBe(true);
    expect(
      first(
        RefundDecisionInput.safeParse({
          refundId: TIER,
          to: "declined",
          reason: " ",
        }),
      ),
    ).toBe("Say why the refund is declined.");
    expect(MemberRefundRequestInput.parse({ paymentId: "p1" }).note).toBeNull();
  });
});
