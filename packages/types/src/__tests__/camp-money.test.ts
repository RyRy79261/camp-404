import { describe, expect, it } from "vitest";
import {
  CampBalanceInput,
  CampBankDetails,
  CampBillInput,
  EMPTY_CAMP_BANK_DETAILS,
  MarkCampBillPaidInput,
  isValidIban,
  offeredAbroadWays,
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

  it("offers abroad only the ways ticked, each with its main field", () => {
    const abroad = (over: Record<string, unknown>) =>
      CampBankDetails.safeParse({ southAfrica: {}, abroad: over });
    const wise = abroad({
      ways: { payLink: true },
      payLink: " https://wise.com/pay/me/camp404 ",
    });
    expect(wise.data?.abroad.payLink).toBe("https://wise.com/pay/me/camp404");
    expect(offeredAbroadWays(wise.data!.abroad)).toEqual(["payLink"]);
    expect(first(abroad({ ways: { payLink: true } }))).toBe(
      "Add the pay link, or untick Pay link.",
    );
    expect(
      first(abroad({ ways: { payLink: true }, payLink: "http://wise.com/x" })),
    ).toBe("Paste the whole link, starting with https://.");
    // Unticked, a way keeps what was typed, unchecked, for when it comes back.
    const kept = abroad({ payLink: "http://wise.com/x", iban: { iban: "12" } });
    expect(kept.data?.abroad.payLink).toBe("http://wise.com/x");
    expect(kept.data?.abroad.iban.iban).toBe("12");
    expect(first(abroad({ ways: { swift: true } }))).toMatch(/SWIFT code/);
    expect(first(abroad({ ways: { iban: true } }))).toBe(
      "Add the IBAN, or untick IBAN account.",
    );
    const iban = abroad({
      ways: { iban: true, payLink: true },
      payLink: "https://wise.com/x",
      iban: { iban: "de89 3704 0044 0532 0130 00" },
    });
    expect(iban.data?.abroad.iban.iban).toBe("DE89370400440532013000");
    expect(offeredAbroadWays(iban.data!.abroad)).toEqual(["payLink", "iban"]);
    expect(
      first(abroad({ ways: { iban: true }, iban: { iban: "12345" } })),
    ).toMatch(/IBAN doesn't look right/);
    // One digit off: the right shape, the wrong check digits.
    expect(
      first(
        abroad({
          ways: { iban: true },
          iban: { iban: "DE89370400440532013001" },
        }),
      ),
    ).toMatch(/IBAN doesn't look right/);
    expect(isValidIban("GB82WEST12345698765432")).toBe(true);
  });

  it("reads details saved before the ticks: a SWIFT code meant that way", () => {
    const old = (swift: string | null) =>
      CampBankDetails.parse({
        southAfrica: {},
        abroad: { swift, accountNumber: null, bankAddress: null, note: null },
      }).abroad;
    expect(offeredAbroadWays(old("FIRNZAJJ"))).toEqual(["swift"]);
    expect(offeredAbroadWays(old(null))).toEqual([]);
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
