import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";

const FEE = DEFAULT_JOIN_CONTENT.fee;
const RATE = FEE.usdRate.randsPerDollar;
import {
  feeFromBudget,
  formatRands,
  formatUsdLabel,
  parseRands,
  tierFor,
} from "./fee";

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

  it("labels rands in dollars at the content rate", () => {
    const rate = FEE.usdRate.randsPerDollar;
    expect(formatUsdLabel(400 * rate, RATE)).toBe("≈ $400");
    expect(formatUsdLabel(0, RATE)).toBe("≈ $0");
  });

  it("rounds the dollar label to $5", () => {
    const rate = FEE.usdRate.randsPerDollar;
    expect(formatUsdLabel(218.75 * rate, RATE)).toBe("≈ $220");
    expect(formatUsdLabel(373 * rate, RATE)).toBe("≈ $375");
  });

  it("keeps the owner's rand tiers", () => {
    expect(FEE.tiers.map((t) => formatRands(t.rands))).toEqual([
      "R3,500",
      "R6,000",
      "R8,000",
      "R16,000",
    ]);
  });

  it("finds the highest tier an amount reaches, none below Essential", () => {
    const [essential, reasonable, ideal, perfect] = FEE.tiers;
    expect(tierFor(essential!.rands - 1, FEE.tiers)).toBeUndefined();
    expect(tierFor(essential!.rands, FEE.tiers)?.key).toBe("essential");
    expect(tierFor(reasonable!.rands + 1, FEE.tiers)?.key).toBe("reasonable");
    expect(tierFor(ideal!.rands, FEE.tiers)?.key).toBe("ideal");
    expect(tierFor(perfect!.rands * 2, FEE.tiers)?.key).toBe("perfect");
  });
});
