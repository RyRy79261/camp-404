import { describe, expect, it } from "vitest";
import type { PowerLoad } from "@camp404/core";
import { POWER_PLAN_DEFAULTS } from "@camp404/types";
import { powerGlance } from "../power-glance";

// The Power and Lighting program's "power plan at a glance" (owner's ruling
// 2). The figures are the fuel estimate's own worked example (#254, the
// figures power.spec.ts checks on the fuel page): one 1065 W load all day on a
// 5.5 kVA generator (6 max, 13.5 L tank, 9.8 h at 50%, 5.5 h at 100%), 10
// days, 24 h, 20% margin, 20 L cans: 236.7 L with the margin, 12 cans. The
// peak is 1.065 kW, 1.33 kVA at a power factor of 0.8: 24.2% of the rated
// 5.5 kVA, which is green.

const LOAD: PowerLoad = {
  area: "camp",
  category: "other",
  quantity: 1,
  wattsEach: 1065,
  surgeWattsEach: null,
  dutyPct: 100,
  schedule: "full_time",
  hoursPerDay: null,
  windows: null,
  fromDay: null,
  toDay: null,
};

const GENERATOR = {
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
};

const PLAN = {
  ...POWER_PLAN_DEFAULTS,
  daysOnSite: 10,
  runFromHour: null,
  runToHour: null,
};

describe("powerGlance", () => {
  it("gives the peak, the generator's load and the fuel for the burn", () => {
    const glance = powerGlance({
      loads: [LOAD],
      plan: PLAN,
      generator: GENERATOR,
    });
    expect(glance.loadCount).toBe(1);
    expect(glance.peak?.watts).toBe(1065);
    expect(glance.peak?.kva).toBeCloseTo(1.33125, 5);
    expect(glance.generator).toMatchObject({
      model: "Test 5.5",
      band: "green",
    });
    expect(glance.generator?.kvaBasedPct).toBeCloseTo(24.2, 1);
    expect(glance.fuel?.litresWithMargin).toBeCloseTo(236.7, 1);
    expect(glance.fuel).toMatchObject({
      cans: 12,
      canLitres: 20,
      safetyMarginPct: 20,
      days: 10,
    });
  });

  it("counts the cans already owned", () => {
    const glance = powerGlance({
      loads: [LOAD],
      plan: { ...PLAN, cansOwned: 5 },
      generator: GENERATOR,
    });
    expect(glance.fuel?.cans).toBe(7);
  });

  it("bands the generator red when the peak is over 90% of its rating", () => {
    const glance = powerGlance({
      loads: [{ ...LOAD, wattsEach: 4200 }],
      plan: PLAN,
      generator: GENERATOR,
    });
    expect(glance.generator?.band).toBe("red");
  });

  it("has no fuel without a generator, and no peak without loads", () => {
    expect(
      powerGlance({ loads: [LOAD], plan: PLAN, generator: null }),
    ).toMatchObject({ generator: null, fuel: null, peak: { watts: 1065 } });
    expect(
      powerGlance({ loads: [], plan: PLAN, generator: GENERATOR }),
    ).toMatchObject({ loadCount: 0, peak: null, fuel: null });
  });
});
