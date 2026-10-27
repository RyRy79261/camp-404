import { describe, expect, it } from "vitest";
import {
  CampBalanceInput,
  CampBankDetails,
  CampBillInput,
  EMPTY_CAMP_BANK_DETAILS,
  MarkCampBillPaidInput,
} from "../camp-money";

// The camp's own money (camp fees sprint): bank details, the bank balance
// and the camp's bills. Whole cents, real days, blank text is none.

const first = (r: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (r.success ? null : r.error!.issues[0]!.message);

describe("camp money shapes", () => {
  it("keeps bank details trimmed, blank as none", () => {
    expect(
      CampBankDetails.parse({
        southAfrica: { bank: " FNB ", accountName: "", branchCode: "250655" },
        abroad: {},
      }),
    ).toEqual({
      ...EMPTY_CAMP_BANK_DETAILS,
      southAfrica: {
        ...EMPTY_CAMP_BANK_DETAILS.southAfrica,
        bank: "FNB",
        branchCode: "250655",
      },
    });
  });

  it("takes a balance below zero (an overdraft) on a real day", () => {
    const balance = (amountCents: number, asOf: string) =>
      CampBalanceInput.safeParse({ amountCents, asOf, expectedLatestId: null });
    expect(balance(-5_000, "2026-10-25").success).toBe(true);
    expect(first(balance(1.5, "2026-10-25"))).toMatch(/rands/);
    expect(first(balance(100, "2026-02-30"))).toBe("Pick a date.");
  });

  it("pays a one-time bill once and a monthly one up to five years", () => {
    const bill = (over: Record<string, unknown>) =>
      CampBillInput.safeParse({
        name: "Storage unit",
        payee: " ",
        amountCents: 440_000,
        dueOn: "2026-11-15",
        repeat: "monthly",
        times: 6,
        planned: false,
        ...over,
      });
    expect(bill({}).data?.payee).toBeNull();
    expect(first(bill({ repeat: "once" }))).toBe(
      "A one-time bill is paid once.",
    );
    expect(first(bill({ times: 61 }))).toMatch(/at most 60 months/);
    expect(first(bill({ amountCents: 0 }))).toBe(
      "The amount must be more than R0.",
    );
    expect(first(bill({ name: " " }))).toBe("Say what the bill is for.");
    expect(
      MarkCampBillPaidInput.safeParse({
        billId: "b",
        expectedPaidCount: 0,
        paidOn: "2026-11-14",
      }).success,
    ).toBe(true);
  });
});
