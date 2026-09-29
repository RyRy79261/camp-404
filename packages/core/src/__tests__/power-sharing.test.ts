import { describe, expect, it } from "vitest";
import { fixedSplit, fuelSplit, splitLitres } from "../power-sharing";

// Sharing a generator (#257): the fuel split by each camp's share of the
// energy. The two shares always add up to 100%.

describe("fuelSplit", () => {
  it("splits by kWh share: 30 kWh against 10 is 75% and 25%", () => {
    expect(fuelSplit(30_000, 10_000)).toEqual({ ourPct: 75, theirPct: 25 });
  });

  it("rounds to one place and still adds up to 100", () => {
    expect(fuelSplit(2, 1)).toEqual({ ourPct: 66.7, theirPct: 33.3 });
    expect(fuelSplit(1, 2)).toEqual({ ourPct: 33.3, theirPct: 66.7 });
    // Rounding each share alone would give 6.3 + 93.8 = 100.1.
    expect(fuelSplit(1, 15)).toEqual({ ourPct: 6.2, theirPct: 93.8 });
  });

  it("adds up to 100 for any split", () => {
    for (let ours = 0; ours <= 5000; ours += 137) {
      for (let theirs = 1; theirs <= 5000; theirs += 331) {
        const { ourPct, theirPct } = fuelSplit(ours, theirs);
        expect(Math.round((ourPct + theirPct) * 10)).toBe(1000);
        expect(ourPct).toBeGreaterThanOrEqual(0);
        expect(theirPct).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is all ours with no energy on either side", () => {
    expect(fuelSplit(0, 0)).toEqual({ ourPct: 100, theirPct: 0 });
  });
});

describe("a split set by hand", () => {
  it("keeps their percent and gives us the rest", () => {
    expect(fixedSplit(40)).toEqual({ ourPct: 60, theirPct: 40 });
    expect(fixedSplit(120)).toEqual({ ourPct: 0, theirPct: 100 });
  });
});

describe("splitLitres", () => {
  it("shares the litres by the split, adding back up to the whole", () => {
    const litres = splitLitres(240, { ourPct: 75, theirPct: 25 });
    expect(litres).toEqual({ ours: 180, theirs: 60 });
    expect(litres.ours + litres.theirs).toBe(240);
  });
});
