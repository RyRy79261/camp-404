import { describe, expect, it } from "vitest";
import { createShakeDetector } from "../shake";

// The detector fires when `requiredJolts` magnitude-deltas above `threshold`
// land within `windowMs`, respecting `cooldownMs` between fires. Magnitude is
// rotation-invariant, so reorientation (constant ~9.8 magnitude) never fires.

const CONFIG = {
  threshold: 8,
  requiredJolts: 3,
  windowMs: 800,
  cooldownMs: 3000,
};

// z=9.8 (rest) ↔ z=20 swings give a magnitude delta of ~10.2 > threshold.
const REST = { x: 0, y: 0, z: 9.8 };
const SWING = { x: 0, y: 0, z: 20 };

describe("createShakeDetector", () => {
  it("does not fire on the first sample or a single jolt", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false); // baseline, no prior magnitude
    expect(d.process(SWING, 60)).toBe(false); // 1 jolt — below requiredJolts
  });

  it("fires once enough jolts land within the window", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 60)).toBe(false); // jolt 1
    expect(d.process(REST, 120)).toBe(false); // jolt 2
    expect(d.process(SWING, 180)).toBe(true); // jolt 3 → fire
  });

  it("ignores reorientation across many axis flips (rotation-invariant)", () => {
    const d = createShakeDetector(CONFIG);
    // Constant ~9.8 magnitude redistributed across axes — FOUR flips inside the
    // window. A per-axis detector would accumulate enough deltas to fire here;
    // the magnitude detector must stay false. This pins rotation-invariance.
    expect(d.process({ x: 0, y: 0, z: 9.8 }, 0)).toBe(false);
    expect(d.process({ x: 9.8, y: 0, z: 0 }, 60)).toBe(false);
    expect(d.process({ x: 0, y: 0, z: 9.8 }, 120)).toBe(false);
    expect(d.process({ x: 9.8, y: 0, z: 0 }, 180)).toBe(false);
    expect(d.process({ x: 0, y: 0, z: 9.8 }, 240)).toBe(false);
  });

  it("does not fire again within the cooldown window", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 60)).toBe(false);
    expect(d.process(REST, 120)).toBe(false);
    expect(d.process(SWING, 180)).toBe(true); // first fire at t=180

    // Three fresh jolts well within cooldownMs of the first fire — blocked.
    expect(d.process(REST, 240)).toBe(false);
    expect(d.process(SWING, 300)).toBe(false);
    expect(d.process(REST, 360)).toBe(false);
  });

  it("fires again once exactly cooldownMs has elapsed (>= boundary)", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 60)).toBe(false);
    expect(d.process(REST, 120)).toBe(false);
    expect(d.process(SWING, 180)).toBe(true); // first fire at t=180
    // Three fresh jolts ending at t=3180 — exactly cooldownMs (3000) after the
    // first fire. With `>=` this fires; with the old `>` it would not.
    expect(d.process(REST, 3060)).toBe(false);
    expect(d.process(SWING, 3120)).toBe(false);
    expect(d.process(REST, 3180)).toBe(true);
  });

  it("expires stale jolts outside the rolling window", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 60)).toBe(false); // jolt @60
    expect(d.process(REST, 120)).toBe(false); // jolt @120
    // At t=1000 BOTH prior jolts are >windowMs old (1000-120=880 > 800) and
    // have expired — only the jolt at t=1000 is live (1 < requiredJolts of 3).
    expect(d.process(SWING, 1000)).toBe(false);
  });

  it("keeps a jolt at exactly windowMs from now (<= boundary) and fires", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 100)).toBe(false); // jolt @100
    expect(d.process(REST, 160)).toBe(false); // jolt @160
    // jolt @900: 900-100 === 800 === windowMs, so jolt@100 is kept (<=) →
    // 3 live → fire. Pins the windowMs length and the `<=` boundary.
    expect(d.process(SWING, 900)).toBe(true);
  });

  it("drops a jolt one ms past windowMs (does not fire)", () => {
    const d = createShakeDetector(CONFIG);
    expect(d.process(REST, 0)).toBe(false);
    expect(d.process(SWING, 100)).toBe(false); // jolt @100
    expect(d.process(REST, 160)).toBe(false); // jolt @160
    // jolt @901: 901-100 = 801 > windowMs, so jolt@100 expired → 2 live → no fire.
    expect(d.process(SWING, 901)).toBe(false);
  });
});
