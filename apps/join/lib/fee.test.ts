import { describe, expect, it } from "vitest";
import { feeFromBudget, formatRands, parseRands } from "./fee";

describe("fee helpers", () => {
  it("formats whole rands with commas", () => {
    expect(formatRands(4040)).toBe("R4,040");
    expect(formatRands(100000)).toBe("R100,000");
    expect(formatRands(12.6)).toBe("R13");
  });

  it("reads what a visitor types, junk as zero", () => {
    expect(parseRands("R 10,000")).toBe(10000);
    expect(parseRands("")).toBe(0);
    expect(parseRands("lots")).toBe(0);
    expect(parseRands("-500")).toBe(500);
  });

  it("leaves the rest of the budget for the fee, never below zero", () => {
    expect(feeFromBudget(10000, [2500, 1500])).toBe(6000);
    expect(feeFromBudget(1000, [2500])).toBe(0);
  });
});
