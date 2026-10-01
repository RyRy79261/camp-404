import { describe, expect, it } from "vitest";
import { parseMoneyToMinor } from "@camp404/core";
import {
  chargeSubline,
  financeStatusWords,
  owesMoreThanSent,
  typedRands,
} from "../dues-view";

describe("typedRands", () => {
  it("writes cents back the way a member types rands, with a comma", () => {
    expect(typedRands(125000)).toBe("1250");
    expect(typedRands(125050)).toBe("1250,50");
    expect(typedRands(125005)).toBe("1250,05");
  });

  it("round-trips through the parser the forms use", () => {
    for (const cents of [1, 99, 100, 125050, 999999]) {
      expect(parseMoneyToMinor(typedRands(cents))).toBe(cents);
    }
  });
});

describe("owesMoreThanSent", () => {
  const balance = (balanceCents: number, pendingCents: number) => ({
    chargedCents: 250000,
    paidCents: 0,
    pendingCents,
    refundedCents: 0,
    balanceCents,
  });

  it("keeps the proof form open while some of the balance has no proof", () => {
    expect(owesMoreThanSent(balance(250000, 100000))).toBe(true);
  });

  it("folds it once a proof covers the rest, or nothing is owed", () => {
    expect(owesMoreThanSent(balance(250000, 250000))).toBe(false);
    expect(owesMoreThanSent(balance(0, 0))).toBe(false);
  });
});

describe("chargeSubline", () => {
  const createdAt = new Date("2026-10-01T10:00:00Z");

  it("does not repeat the kind the description already says", () => {
    expect(
      chargeSubline({ kind: "fee", description: "Camp fee: Base", createdAt }),
    ).toBe("Charged 01 Oct 2026");
  });

  it("names the kind when the description does not", () => {
    expect(
      chargeSubline({ kind: "rental", description: "Tent hire", createdAt }),
    ).toBe("Rental · charged 01 Oct 2026");
  });
});

describe("financeStatusWords", () => {
  it("keeps a member's proof apart from a payment promised by hand", () => {
    expect(financeStatusWords("pending", "member").label).toBe("To check");
    expect(financeStatusWords("pending", "captain").label).toBe("Promised");
    expect(financeStatusWords("reconciled", "statement").label).toBe(
      "In the bank",
    );
    expect(financeStatusWords("waived", "captain").label).toBe("Excused");
  });
});
