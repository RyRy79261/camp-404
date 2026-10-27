import { describe, expect, it } from "vitest";
import {
  feePaymentReminderNotification,
  feePledgeAskNotification,
  feeReminderAudience,
  feeReminderDue,
  formatMoney,
  isPersonalNotification,
  notificationLink,
  pledgeAskAudience,
  shouldEmailNotification,
  type FeeReminderMember,
} from "../index";

// Who the Finance team's fee reminders reach, and what each member is told
// (camp fees sprint, 2026-10-27).

function member(
  name: string,
  over: Partial<FeeReminderMember> = {},
): FeeReminderMember {
  return {
    userId: name,
    name,
    participation: "applied",
    subsidy: false,
    feeOwingCents: 0,
    feeNext: { kind: "no_pledge" },
    hasPledge: false,
    ...over,
  };
}

describe("fee reminder audiences", () => {
  const owing = { feeOwingCents: 360_000, hasPledge: true };
  const people = [
    member("Lerato", owing),
    member("Mo", { ...owing, participation: "maybe" }),
    member("Bongi", { ...owing, participation: "not_attending" }),
    member("Sam", { hasPledge: true, subsidy: true }),
    member("Alex", { hasPledge: true }),
    member("Quiet"),
    member("Nope", { participation: "not_attending" }),
  ];

  it("reminds who owes, never Not coming and never a subsidy", () => {
    const a = feeReminderAudience(people);
    expect(a.reach.map((m) => m.name)).toEqual(["Lerato", "Mo"]);
    expect(a.notComing.map((m) => m.name)).toEqual(["Bongi", "Nope"]);
    expect(a.subsidy.map((m) => m.name)).toEqual(["Sam"]);
  });

  it("asks who has not pledged, never Not coming", () => {
    const a = pledgeAskAudience(people);
    expect(a.reach.map((m) => m.name)).toEqual(["Quiet"]);
    expect(a.notComing.map((m) => m.name)).toEqual(["Bongi", "Nope"]);
  });

  it("is due within three days of the instalment, or after it", () => {
    const next = {
      kind: "due",
      dueOn: "2026-11-30",
      amountCents: 1,
      overdue: false,
      first: true,
      source: "pledge",
    } as const;
    expect(feeReminderDue(next, "2026-11-26")).toBe(false);
    expect(feeReminderDue(next, "2026-11-27")).toBe(true);
    expect(feeReminderDue(next, "2026-12-02")).toBe(true);
    expect(
      feeReminderDue({ kind: "no_date", amountCents: 1 }, "2026-12-02"),
    ).toBe(false);
  });
});

describe("fee reminder notices", () => {
  it("tells the member their own next payment and reference", () => {
    const n = feePaymentReminderNotification({
      requiredActionId: "a",
      next: {
        kind: "due",
        dueOn: "2026-11-30",
        amountCents: 360_000,
        overdue: false,
        first: true,
        source: "pledge",
      },
      owingCents: 720_000,
      paidCents: 0,
      totalCents: 720_000,
      refCode: "C404-M017",
    });
    expect(n).toEqual({
      kind: "fee_reminder",
      title: `Your camp fee: ${formatMoney(360_000)} by 30 Nov`,
      body: `You have paid ${formatMoney(0)} of ${formatMoney(720_000)}. Your reference is C404-M017.`,
      refType: "fee_payment",
      refId: "a",
    });
    expect(notificationLink(n.refType, n.refId)).toBe("/dues");
  });

  it("with no day, says what is left and to talk to a captain", () => {
    const n = feePaymentReminderNotification({
      requiredActionId: null,
      next: { kind: "no_date", amountCents: 500_000 },
      owingCents: 500_000,
      paidCents: 0,
      totalCents: 500_000,
      refCode: null,
    });
    expect(n.title).toBe(`Your camp fee: ${formatMoney(500_000)} still to pay`);
    expect(n.body).toContain("Talk to a captain");
  });

  it("is personal and emailed, so Ol' Jeb sends it privately", () => {
    const ask = feePledgeAskNotification({ requiredActionId: null });
    expect(notificationLink(ask.refType, ask.refId)).toBe("/dues");
    expect(isPersonalNotification("fee_reminder")).toBe(true);
    expect(shouldEmailNotification("fee_reminder", "feed")).toBe(true);
  });
});
