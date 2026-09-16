import { describe, expect, it } from "vitest";
import {
  formatMemberRefCode,
  formatRands,
  memberRefSequence,
  parseRandsToCents,
  paymentReference,
  paymentSettlesDues,
} from "../payment-references";

describe("member references", () => {
  it("pads the sequence to three digits and grows past it", () => {
    expect(formatMemberRefCode(17)).toBe("C404-M017");
    expect(formatMemberRefCode(1234)).toBe("C404-M1234");
  });

  it("reads the sequence back, and nothing from a foreign code", () => {
    expect(memberRefSequence("C404-M017")).toBe(17);
    expect(memberRefSequence("MAH-M017")).toBeNull();
    expect(memberRefSequence("C404-M17")).toBeNull();
  });

  it("refuses a sequence that is not a positive integer", () => {
    expect(() => formatMemberRefCode(0)).toThrow();
    expect(() => formatMemberRefCode(1.5)).toThrow();
  });
});

describe("paymentReference", () => {
  it("joins the member reference, the year and the count", () => {
    expect(paymentReference("C404-M017", 2027, 2)).toBe("C404-M017-2027-2");
  });

  it("refuses a bad member reference or count", () => {
    expect(() => paymentReference("nope", 2027, 1)).toThrow();
    expect(() => paymentReference("C404-M017", 2027, 0)).toThrow();
  });
});

describe("amounts", () => {
  it("parses what a captain types into cents", () => {
    expect(parseRandsToCents("1250")).toBe(125000);
    expect(parseRandsToCents("1 250,5")).toBe(125050);
    expect(parseRandsToCents("R1250.05")).toBe(125005);
    expect(parseRandsToCents("0")).toBe(0);
  });

  it("refuses what is not an amount", () => {
    for (const bad of ["", "-5", "12.345", "ten", "1,2,3"]) {
      expect(parseRandsToCents(bad)).toBeNull();
    }
  });

  it("formats cents as rands", () => {
    expect(formatRands(125050)).toMatch(/^R\s?1\s?250,50$/);
  });
});

describe("paymentSettlesDues", () => {
  it("counts a reconciled or waived payment, not a pending one", () => {
    expect(paymentSettlesDues("reconciled")).toBe(true);
    expect(paymentSettlesDues("waived")).toBe(true);
    expect(paymentSettlesDues("pending")).toBe(false);
  });
});
