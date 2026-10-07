import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";
import {
  feeFromBudget,
  formatRands,
  formatRandsMinor,
  formatUsdLabel,
  randsToMinor,
  readAmount,
  tierFor,
} from "./fee";

const FEE = DEFAULT_JOIN_CONTENT.fee;
const RATE = FEE.usdRate.randsPerDollar;

// The camp's money rules, through @camp404/core: one formatter (no-break
// spaces between the thousands), one parser, cents throughout.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("fee helpers", () => {
  it("formats rands with the camp's one formatter", () => {
    expect(plain(formatRands(4040))).toBe("R 4 040");
    expect(plain(formatRands(100000))).toBe("R 100 000");
    expect(plain(formatRandsMinor(1250050))).toBe("R 12 500,50");
  });

  it("reads what a visitor types in rands, the South African way", () => {
    // audit 2 cleanup-3: the old parser read "15 000,00" as R1 500 000.
    expect(readAmount("15 000,00")).toEqual({ minor: 1500000, unread: false });
    expect(readAmount("15000")).toEqual({ minor: 1500000, unread: false });
    expect(readAmount("R 10 000")).toEqual({ minor: 1000000, unread: false });
    expect(readAmount("")).toEqual({ minor: 0, unread: false });
  });

  it("counts what is not an amount as nothing, and says so", () => {
    for (const text of ["lots", "-500", "$300", "10,000"]) {
      expect(readAmount(text)).toEqual({ minor: 0, unread: true });
    }
  });

  it("leaves the rest of the budget for the fee, never below zero", () => {
    expect(feeFromBudget(1000000, [250000, 150000])).toBe(600000);
    expect(feeFromBudget(100000, [250000])).toBe(0);
  });

  it("labels rands in dollars at the content rate, to the cent", () => {
    expect(formatUsdLabel(randsToMinor(400 * RATE), RATE)).toBe("≈ US$400");
    expect(formatUsdLabel(0, RATE)).toBe("≈ US$0");
    expect(formatUsdLabel(randsToMinor(3500), 16)).toBe("≈ US$218.75");
  });

  it("keeps the owner's rand tiers", () => {
    expect(FEE.tiers.map((t) => plain(formatRands(t.rands)))).toEqual([
      "R 3 500",
      "R 6 000",
      "R 8 000",
      "R 16 000",
    ]);
  });

  it("finds the highest tier an amount reaches, none below Essential", () => {
    const [essential, reasonable, ideal, perfect] = FEE.tiers;
    const at = (rands: number) => tierFor(randsToMinor(rands), FEE.tiers);
    expect(at(essential!.rands - 1)).toBeUndefined();
    expect(
      tierFor(randsToMinor(essential!.rands) - 1, FEE.tiers),
    ).toBeUndefined();
    expect(at(essential!.rands)?.key).toBe("essential");
    expect(at(reasonable!.rands + 1)?.key).toBe("reasonable");
    expect(at(ideal!.rands)?.key).toBe("ideal");
    expect(at(perfect!.rands * 2)?.key).toBe("perfect");
  });
});
