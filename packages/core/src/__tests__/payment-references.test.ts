import { describe, expect, it } from "vitest";
import {
  formatMemberRefCode,
  memberRefSequence,
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

describe("paymentSettlesDues", () => {
  it("counts a reconciled or waived payment, not a pending one", () => {
    expect(paymentSettlesDues("reconciled")).toBe(true);
    expect(paymentSettlesDues("waived")).toBe(true);
    expect(paymentSettlesDues("pending")).toBe(false);
  });
});
