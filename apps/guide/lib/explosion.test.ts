import { describe, expect, it } from "vitest";
import { explosion } from "./explosion";

describe("the link preview's explosion", () => {
  const blast = explosion(50);

  it("is a square of the asked size in its own letters", () => {
    expect(blast).toHaveLength(50);
    for (const row of blast) {
      expect(row).toHaveLength(50);
      expect(row).toMatch(/^[WYRMm.]+$/);
    }
  });

  it("is the same picture every build", () => {
    expect(explosion(50)).toEqual(blast);
    expect(explosion(50, 11, 405)).not.toEqual(blast);
  });

  it("is white at the heart and see-through in the corners", () => {
    expect(blast[25]![25]).toBe("W");
    for (const [x, y] of [
      [0, 0],
      [49, 0],
      [0, 49],
      [49, 49],
    ] as const) {
      expect(blast[y]![x]).toBe(".");
    }
  });

  it("goes white, yellow, orange, magenta from the heart out", () => {
    const row = blast[25]!;
    const order = "WYRMm";
    // Out to the right from the heart, ignoring the dither's back-steps and
    // the sparks past the edge: each band's first pixel comes after the last's.
    const firsts = [...order].map((c) => row.indexOf(c, 25));
    for (const at of firsts) expect(at).toBeGreaterThanOrEqual(25);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  });
});
