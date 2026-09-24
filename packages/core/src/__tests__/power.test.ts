import { describe, expect, it } from "vitest";
import {
  POWER_TEAM,
  activeOnDay,
  amps,
  apparentKva,
  bulbs,
  canEditPower,
  connectedWatts,
  dayLabel,
  defaultSurgeWatts,
  energyPerDay,
  fuelForPlan,
  fuelLine,
  fuelPerHour,
  generatorLoadPct,
  hourlyBuckets,
  hoursOn,
  jerryCansNeeded,
  ledStrip,
  legacyFuelEstimate,
  loadBand,
  loadWatts,
  peakLoad,
  powerTotals,
  runningHours,
  surgeHeadroomWatts,
  surgeWattsEach,
  type Generator,
  type PowerLoad,
} from "../power";

// Worked examples from #253 and #254, checked by hand. Power figures only.

function load(overrides: Partial<PowerLoad> = {}): PowerLoad {
  return {
    area: "kitchen",
    category: "other",
    quantity: 1,
    wattsEach: 100,
    dutyPct: 100,
    schedule: "full_time",
    ...overrides,
  };
}

/** The issue's generator: 5.5 kVA, 13.5 L tank, 9.8 h at 50%, 5.5 h at 100%. */
const GEN: Generator = {
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
};

const PLAN = {
  powerFactor: 0.8,
  daysOnSite: 1,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
};

const FULL_DAY = { fromHour: null, toHour: null };
const TWELVE_HOURS = { fromHour: 18, toHour: 6 };

describe("canEditPower", () => {
  it("allows a captain, who needs to lead nothing", () => {
    expect(canEditPower("captain", [])).toBe(true);
  });

  it("allows a Power & Lighting lead, including one who leads other teams", () => {
    expect(canEditPower("team_lead", [POWER_TEAM])).toBe(true);
    expect(canEditPower("team_lead", ["kitchen", "power_and_lighting"])).toBe(
      true,
    );
  });

  it("refuses a lead of Kitchen only", () => {
    expect(canEditPower("team_lead", ["kitchen"])).toBe(false);
    expect(canEditPower("team_lead", [])).toBe(false);
  });

  it("refuses a camp member even with Power & Lighting in the list", () => {
    expect(canEditPower("camp_member", [POWER_TEAM])).toBe(false);
  });

  it("refuses a rank it does not know", () => {
    for (const rank of ["", "member", "Captain", "admin", "toString"]) {
      expect(canEditPower(rank, [POWER_TEAM]), rank).toBe(false);
    }
  });
});

describe("one load", () => {
  it("a full-time freezer, 1 × 320 W, 24 h at 100%, uses 7680 Wh a day", () => {
    const freezer = load({ category: "refrigeration", wattsEach: 320 });
    expect(loadWatts(freezer)).toBe(320);
    expect(hoursOn(freezer)).toBe(24);
    expect(energyPerDay(freezer, 1)).toBe(7680);
  });

  it("a flood light, 1 × 50 W for 6 h, uses 300 Wh a day", () => {
    const flood = load({
      wattsEach: 50,
      schedule: "hours_per_day",
      hoursPerDay: 6,
    });
    expect(energyPerDay(flood, 1)).toBe(300);
  });

  it("takes the duty cycle into the draw, but not into the connected load", () => {
    const fridge = load({ quantity: 2, wattsEach: 150, dutyPct: 40 });
    expect(loadWatts(fridge)).toBeCloseTo(120, 9);
    expect(connectedWatts(fridge)).toBe(300);
    expect(energyPerDay(fridge, 1)).toBeCloseTo(2880, 9);
  });

  it("counts the whole hours a window covers, wrapping past midnight", () => {
    expect(
      hoursOn(
        load({ schedule: "windows", windows: [{ fromHour: 18, toHour: 2 }] }),
      ),
    ).toBe(8);
    expect(
      hoursOn(
        load({
          schedule: "windows",
          windows: [
            { fromHour: 6, toHour: 8 },
            { fromHour: 18, toHour: 20 },
          ],
        }),
      ),
    ).toBe(4);
    // Overlapping windows of one load count each hour once.
    expect(
      hoursOn(
        load({
          schedule: "windows",
          windows: [
            { fromHour: 18, toHour: 2 },
            { fromHour: 20, toHour: 23 },
          ],
        }),
      ),
    ).toBe(8);
  });

  it("surges three times its draw for refrigeration, once otherwise, unless stored", () => {
    const fridge = load({ category: "refrigeration", wattsEach: 200 });
    expect(defaultSurgeWatts(fridge)).toBe(600);
    expect(surgeWattsEach(fridge)).toBe(600);
    expect(surgeWattsEach({ ...fridge, surgeWattsEach: 900 })).toBe(900);
    expect(defaultSurgeWatts(load({ category: "tools", wattsEach: 200 }))).toBe(
      200,
    );
  });
});

describe("day ranges", () => {
  const party = load({ wattsEach: 100, fromDay: 2, toDay: 3 });

  it("a load on days 2–3 counts only on those days", () => {
    expect(activeOnDay(party, 1)).toBe(false);
    expect(activeOnDay(party, 2)).toBe(true);
    expect(activeOnDay(party, 3)).toBe(true);
    expect(activeOnDay(party, 4)).toBe(false);
    expect(energyPerDay(party, 1)).toBe(0);
    expect(energyPerDay(party, 2)).toBe(2400);
    expect(hourlyBuckets([party], 1)).toEqual(new Array(24).fill(0));
    expect(peakLoad([party], 4).watts).toBe(0);
  });

  it("a load with no range runs every day", () => {
    expect(activeOnDay(load(), 30)).toBe(true);
  });

  it("totals only the days it runs", () => {
    const totals = powerTotals([party], 4, 0.8);
    expect(totals.perDay).toEqual([
      { day: 1, wh: 0 },
      { day: 2, wh: 2400 },
      { day: 3, wh: 2400 },
      { day: 4, wh: 0 },
    ]);
    expect(totals.burnKwh).toBeCloseTo(4.8, 9);
    expect(totals.busiestDayKwh).toBeCloseTo(2.4, 9);
  });
});

describe("peak load", () => {
  it("sums two overlapping windows in the hours they share (20–22)", () => {
    const bar = load({
      wattsEach: 300,
      schedule: "windows",
      windows: [{ fromHour: 18, toHour: 2 }],
    });
    const stage = load({
      wattsEach: 500,
      schedule: "windows",
      windows: [{ fromHour: 20, toHour: 23 }],
    });
    const buckets = hourlyBuckets([bar, stage], 1);
    expect(buckets[19]).toBe(300);
    expect(buckets[20]).toBe(800);
    expect(buckets[21]).toBe(800);
    expect(buckets[22]).toBe(800);
    expect(buckets[23]).toBe(300);
    expect(peakLoad([bar, stage], 1)).toEqual({
      watts: 800,
      assumesAllOn: false,
    });
  });

  it("does not sum two windows that do not overlap (06–08 and 18–20)", () => {
    const kettle = load({
      wattsEach: 400,
      schedule: "windows",
      windows: [{ fromHour: 6, toHour: 8 }],
    });
    const lights = load({
      wattsEach: 250,
      schedule: "windows",
      windows: [{ fromHour: 18, toHour: 20 }],
    });
    const buckets = hourlyBuckets([kettle, lights], 1);
    expect(buckets[6]).toBe(400);
    expect(buckets[8]).toBe(0);
    expect(buckets[18]).toBe(250);
    expect(peakLoad([kettle, lights], 1).watts).toBe(400);
  });

  it("wraps a window past midnight into the small hours", () => {
    const late = load({
      wattsEach: 100,
      schedule: "windows",
      windows: [{ fromHour: 22, toHour: 2 }],
    });
    const buckets = hourlyBuckets([late], 1);
    expect(
      buckets.map((w, h) => (w > 0 ? h : -1)).filter((h) => h >= 0),
    ).toEqual([0, 1, 22, 23]);
  });

  it("puts full-time loads in every hour", () => {
    expect(hourlyBuckets([load({ wattsEach: 70 })], 1)).toEqual(
      new Array(24).fill(70),
    );
  });

  it("adds hours-per-day loads on top of the busiest hour and says it assumes all on", () => {
    const freezer = load({ wattsEach: 320 });
    const flood = load({
      wattsEach: 50,
      schedule: "hours_per_day",
      hoursPerDay: 6,
    });
    const drill = load({
      wattsEach: 600,
      schedule: "hours_per_day",
      hoursPerDay: 1,
    });
    expect(hourlyBuckets([freezer, flood, drill], 1)).toEqual(
      new Array(24).fill(320),
    );
    expect(peakLoad([freezer, flood, drill], 1)).toEqual({
      watts: 970,
      assumesAllOn: true,
    });
    expect(peakLoad([freezer], 1).assumesAllOn).toBe(false);
  });

  it("surge headroom is the peak plus the largest single item's surge", () => {
    const freezer = load({
      category: "refrigeration",
      quantity: 2,
      wattsEach: 320,
    });
    const lights = load({ wattsEach: 400 });
    // Peak 640 + 400; the biggest single start-up is one freezer at 960.
    expect(surgeHeadroomWatts([freezer, lights], 1)).toBe(1040 + 960);
    // A load off that day does not surge.
    const offToday = load({
      category: "tools",
      wattsEach: 5000,
      fromDay: 3,
      toDay: 3,
    });
    expect(surgeHeadroomWatts([lights, offToday], 1)).toBe(800);
  });
});

describe("electrical helpers", () => {
  it("a 12 V LED strip at 4.8 W/m for 100 m is 480 W and 40 A", () => {
    const strip = ledStrip(12, 4.8, 100);
    expect(strip.watts).toBeCloseTo(480, 9);
    expect(strip.amps).toBeCloseTo(40, 9);
  });

  it("amps are watts over volts", () => {
    expect(amps(2300, 230)).toBe(10);
    expect(amps(480, 12)).toBe(40);
  });

  it("20 bulbs of 4 W are 80 W", () => {
    expect(bulbs(20, 4)).toBe(80);
  });

  it("1430 W at power factor 0.8 is about 1.79 kVA", () => {
    expect(apparentKva(1430, 0.8)).toBeCloseTo(1.7875, 9);
  });

  it("1430 W on a 5.5 kVA generator is 26% by kW and 32.5% by kVA", () => {
    const pct = generatorLoadPct(1430, 0.8, 5.5);
    expect(pct.kwBasedPct).toBeCloseTo(26, 9);
    expect(pct.kvaBasedPct).toBeCloseTo(32.5, 9);
  });
});

describe("loadBand", () => {
  it("is green below 70%, amber from 70% to 90%, red above 90%", () => {
    expect(loadBand(69.9, 1, 6)).toBe("green");
    expect(loadBand(70, 1, 6)).toBe("amber");
    expect(loadBand(90, 1, 6)).toBe("amber");
    expect(loadBand(90.1, 1, 6)).toBe("red");
  });

  it("is red when the surge is more than the generator's maximum, whatever the load", () => {
    expect(loadBand(10, 6.01, 6)).toBe("red");
    expect(loadBand(10, 6, 6)).toBe("green");
  });
});

describe("powerTotals", () => {
  it("adds up the list, the busiest day and the stay", () => {
    const freezer = load({
      area: "Kitchen",
      category: "refrigeration",
      wattsEach: 320,
    });
    const flood = load({
      area: "campsite",
      category: "lighting_functional",
      wattsEach: 50,
      schedule: "hours_per_day",
      hoursPerDay: 6,
    });
    const fairy = load({
      area: "kitchen ",
      category: "lighting_decorative",
      quantity: 20,
      wattsEach: 4,
      schedule: "windows",
      windows: [{ fromHour: 18, toHour: 2 }],
    });
    const totals = powerTotals([freezer, flood, fairy], 7, 0.8);
    expect(totals.connectedWatts).toBe(320 + 50 + 80);
    // 7680 + 300 + 80 × 8
    expect(totals.perDay).toHaveLength(7);
    expect(totals.perDay[0]).toEqual({ day: 1, wh: 8620 });
    expect(totals.busiestDayKwh).toBeCloseTo(8.62, 9);
    expect(totals.burnKwh).toBeCloseTo(8.62 * 7, 9);
    expect(totals.peak).toMatchObject({
      watts: 320 + 80 + 50,
      assumesAllOn: true,
      day: 1,
    });
    expect(totals.peak.kva).toBeCloseTo(0.5625, 9);
    // Peak 450 + the freezer's start-up 960.
    expect(totals.surge.watts).toBe(1410);
    // "Kitchen" and "kitchen " group together.
    expect(totals.byArea).toEqual([
      { key: "kitchen", watts: 400, whPerDay: 8320 },
      { key: "campsite", watts: 50, whPerDay: 300 },
    ]);
    expect(totals.byCategory.map((r) => r.key)).toEqual([
      "refrigeration",
      "lighting_decorative",
      "lighting_functional",
    ]);
  });

  it("takes the peak from the day with the highest one", () => {
    const party = load({ wattsEach: 2000, fromDay: 5, toDay: 5 });
    const totals = powerTotals([load({ wattsEach: 100 }), party], 7, 0.8);
    expect(totals.peak).toMatchObject({ watts: 2100, day: 5 });
  });

  it("gives zeros for an empty list", () => {
    const totals = powerTotals([], 3, 0.8);
    expect(totals.connectedWatts).toBe(0);
    expect(totals.burnKwh).toBe(0);
    expect(totals.busiestDayKwh).toBe(0);
    expect(totals.peak.watts).toBe(0);
    expect(totals.byArea).toEqual([]);
  });
});

describe("dayLabel", () => {
  it("is 'Day N' without a first powered day", () => {
    expect(dayLabel(null, 3)).toBe("Day 3");
    expect(dayLabel("not a date", 3)).toBe("Day 3");
  });

  it("is the date of that day, across a month end and a leap day", () => {
    expect(dayLabel("2027-04-26", 1)).toBe("2027-04-26");
    expect(dayLabel("2027-04-26", 6)).toBe("2027-05-01");
    expect(dayLabel("2028-02-28", 2)).toBe("2028-02-29");
    expect(dayLabel("2027-02-28", 2)).toBe("2027-03-01");
  });
});

describe("the fuel line", () => {
  it("reads 1.378 L/h at 50% and 2.455 L/h at 100% from the datasheet", () => {
    const line = fuelLine(GEN);
    expect(line.lph50).toBeCloseTo(1.378, 3);
    expect(line.lph100).toBeCloseTo(2.455, 3);
  });

  it("reproduces both datasheet points to 3 decimals", () => {
    expect(fuelPerHour(GEN, 0.5)).toBeCloseTo(13.5 / 9.8, 3);
    expect(fuelPerHour(GEN, 1)).toBeCloseTo(13.5 / 5.5, 3);
  });

  it("burns about 0.301 L/h idle", () => {
    expect(fuelLine(GEN).idle).toBeCloseTo(0.301, 3);
    expect(fuelPerHour(GEN, 0)).toBeCloseTo(0.301, 3);
  });

  it("never burns a negative idle, for a datasheet whose line would go below 0", () => {
    // 1 L/h at 50% and 5 L/h at 100%: the line would cross -3 L/h at 0.
    const steep: Generator = {
      ...GEN,
      tankLitres: 10,
      runtime50Hours: 10,
      runtime100Hours: 2,
    };
    expect(fuelLine(steep).idle).toBe(0);
    expect(fuelPerHour(steep, 0)).toBe(0);
  });

  it("does not clamp a load above 100%", () => {
    expect(fuelPerHour(GEN, 1.2)).toBeGreaterThan(fuelPerHour(GEN, 1));
  });
});

describe("runningHours", () => {
  it("is every hour when both are null", () => {
    expect(runningHours(null, null)).toEqual(new Array(24).fill(true));
  });

  it("wraps 18:00 to 06:00 into twelve hours", () => {
    const hours = runningHours(18, 6);
    expect(hours.filter(Boolean)).toHaveLength(12);
    expect(hours[17]).toBe(false);
    expect(hours[18]).toBe(true);
    expect(hours[5]).toBe(true);
    expect(hours[6]).toBe(false);
  });
});

describe("fuelForPlan", () => {
  // 25.56 kWh a day as one full-time load of 1065 W.
  const steady = load({ wattsEach: 1065 });

  it("25.56 kWh a day, 24 h, PF 0.8: 1.33 kVA, 24% load, 0.822 L/h, 19.73 L a day", () => {
    expect(energyPerDay(steady, 1)).toBeCloseTo(25_560, 9);
    const kva = apparentKva(1065, 0.8);
    expect(kva).toBeCloseTo(1.33, 2);
    expect((kva / GEN.ratedKva) * 100).toBeCloseTo(24.2, 1);
    expect(fuelPerHour(GEN, kva / GEN.ratedKva)).toBeCloseTo(0.822, 3);

    const fuel = fuelForPlan({
      loads: [steady],
      generator: GEN,
      plan: PLAN,
      schedule: FULL_DAY,
    });
    expect(fuel.perDay).toHaveLength(1);
    expect(fuel.perDay[0]!.litres).toBeCloseTo(19.73, 2);
    expect(fuel.perDay[0]!.kWh).toBeCloseTo(25.56, 9);
    expect(fuel.perDay[0]!.unservedWh).toBe(0);
    expect(fuel.burnLitres).toBeCloseTo(19.73, 2);
    expect(fuel.litresWithMargin).toBeCloseTo(19.726 * 1.2, 2);
    expect(fuel.refillsPerDay).toBeCloseTo(19.726 / 13.5, 3);
    expect(fuel.runningHoursPerDay).toBe(24);
    expect(fuel.overloaded).toBe(false);
  });

  it("multiplies the stay's days", () => {
    const fuel = fuelForPlan({
      loads: [steady],
      generator: GEN,
      plan: { ...PLAN, daysOnSite: 7 },
      schedule: FULL_DAY,
    });
    expect(fuel.perDay).toHaveLength(7);
    expect(fuel.burnLitres).toBeCloseTo(19.726 * 7, 2);
  });

  it("burns less on 12 hours a day, and the freezer's off-hours energy is unserved", () => {
    const freezer = load({ category: "refrigeration", wattsEach: 320 });
    const full = fuelForPlan({
      loads: [steady, freezer],
      generator: GEN,
      plan: PLAN,
      schedule: FULL_DAY,
    });
    const half = fuelForPlan({
      loads: [steady, freezer],
      generator: GEN,
      plan: PLAN,
      schedule: TWELVE_HOURS,
    });
    expect(half.burnLitres).toBeLessThan(full.burnLitres);
    expect(half.runningHoursPerDay).toBe(12);
    expect(half.perDay[0]!.unservedWh).toBeCloseTo(12 * (1065 + 320), 9);
    expect(half.perDay[0]!.kWh).toBeCloseTo((12 * (1065 + 320)) / 1000, 9);
    expect(full.perDay[0]!.unservedWh).toBe(0);
  });

  it("spreads hours-per-day energy evenly over the running hours", () => {
    // 1200 W for 6 h is 7200 Wh; over 12 running hours that is 600 W an hour.
    const heater = load({
      wattsEach: 1200,
      schedule: "hours_per_day",
      hoursPerDay: 6,
    });
    const fuel = fuelForPlan({
      loads: [heater],
      generator: GEN,
      plan: PLAN,
      schedule: TWELVE_HOURS,
    });
    expect(fuel.perDay[0]!.kWh).toBeCloseTo(7.2, 9);
    expect(fuel.perDay[0]!.unservedWh).toBe(0);
    expect(fuel.perDay[0]!.litres).toBeCloseTo(
      12 * fuelPerHour(GEN, apparentKva(600, 0.8) / 5.5),
      9,
    );
  });

  it("serves an hours-per-day load only for the hours the generator runs", () => {
    // 1200 W asked for 20 h on a 12 h run: 1200 W × 12 h = 14.4 kWh served,
    // 1200 W × 8 h = 9600 Wh unserved. 1200 W at PF 0.8 is 1.5 kVA, 27.3% of
    // rated: 0.3006 + 2.1540 × 0.2727 = 0.8880 L/h, 10.656 L over 12 h.
    // Spreading all 24 kWh would have drawn 2000 W an hour and 15.36 L.
    const heater = load({
      wattsEach: 1200,
      schedule: "hours_per_day",
      hoursPerDay: 20,
    });
    const fuel = fuelForPlan({
      loads: [heater],
      generator: GEN,
      plan: PLAN,
      schedule: TWELVE_HOURS,
    });
    expect(fuel.perDay[0]!.kWh).toBeCloseTo(14.4, 9);
    expect(fuel.perDay[0]!.unservedWh).toBeCloseTo(9600, 9);
    expect(fuel.perDay[0]!.litres).toBeCloseTo(10.656, 3);
  });

  it("applies the low-load factor only to hours below half load", () => {
    const light = fuelForPlan({
      loads: [steady],
      generator: GEN,
      plan: { ...PLAN, lowLoadFactor: 2 },
      schedule: FULL_DAY,
    });
    expect(light.burnLitres).toBeCloseTo(19.726 * 2, 2);
    // 2750 W at PF 0.8 is 3.44 kVA, 62% of rated: no correction.
    const heavy = load({ wattsEach: 2750 });
    const plain = fuelForPlan({
      loads: [heavy],
      generator: GEN,
      plan: PLAN,
      schedule: FULL_DAY,
    });
    const corrected = fuelForPlan({
      loads: [heavy],
      generator: GEN,
      plan: { ...PLAN, lowLoadFactor: 2 },
      schedule: FULL_DAY,
    });
    expect(corrected.burnLitres).toBeCloseTo(plain.burnLitres, 9);
  });

  it("flags an hour that asks more than the rated kVA", () => {
    const tooMuch = load({
      wattsEach: 5000,
      schedule: "windows",
      windows: [{ fromHour: 19, toHour: 20 }],
    });
    const fuel = fuelForPlan({
      loads: [tooMuch],
      generator: GEN,
      plan: PLAN,
      schedule: FULL_DAY,
    });
    expect(fuel.overloaded).toBe(true);
    expect(
      fuelForPlan({
        loads: [steady],
        generator: GEN,
        plan: PLAN,
        schedule: FULL_DAY,
      }).overloaded,
    ).toBe(false);
  });
});

describe("jerryCansNeeded", () => {
  it("225 L plus 20% in 20 L cans is 14 cans, 9 with 5 owned", () => {
    const litres = 225 * 1.2;
    expect(jerryCansNeeded(litres, 20, 0)).toBe(14);
    expect(jerryCansNeeded(litres, 20, 5)).toBe(9);
  });

  it("rounds any part-can up", () => {
    expect(jerryCansNeeded(261, 20, 0)).toBe(14);
  });

  it("buys no extra can for floating-point dust", () => {
    // 200 L plus 10% comes out as 220.00000000000003: still 11 cans.
    expect(200 * (1 + 10 / 100)).not.toBe(220);
    expect(jerryCansNeeded(200 * (1 + 10 / 100), 20, 0)).toBe(11);
  });

  it("is 0 when the camp owns more than it needs", () => {
    expect(jerryCansNeeded(270, 20, 20)).toBe(0);
  });
});

describe("legacyFuelEstimate", () => {
  it("gives about 24.62 L a day by the old method, against 19.73 by the line", () => {
    const old = legacyFuelEstimate({
      tankLitres: 13.5,
      runtime50Hours: 9.8,
      kvahPerDay: 31.95,
      peakKva: 1.7875,
      days: 1,
    });
    expect(old).toBeCloseTo(24.62, 2);
    const fuel = fuelForPlan({
      loads: [load({ wattsEach: 1065 })],
      generator: GEN,
      plan: PLAN,
      schedule: FULL_DAY,
    });
    expect(old - fuel.burnLitres).toBeCloseTo(4.9, 1);
  });
});
