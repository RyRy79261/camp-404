import { describe, expect, it } from "vitest";
import {
  EditLoadInput,
  GeneratorInput,
  LoadInput,
  POWER_PLAN_DEFAULTS,
  PowerPlanInput,
} from "../power";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** A load that passes; each test breaks one thing. */
function freezer(overrides: Record<string, unknown> = {}) {
  return {
    name: "Deep freeze 250 L",
    area: "kitchen",
    category: "refrigeration",
    quantity: 1,
    wattsEach: 320,
    schedule: "full_time",
    owner: "camp",
    ...overrides,
  };
}

function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) {
  return (result.error?.issues ?? []).map((i) => i.path.join("."));
}

describe("LoadInput", () => {
  it("fills the defaults: 100% duty, 230 V AC, no day range", () => {
    const load = LoadInput.parse(freezer());
    expect(load).toMatchObject({
      dutyPct: 100,
      volts: 230,
      current: "ac",
      fromDay: null,
      toDay: null,
      hoursPerDay: null,
      windows: null,
      surgeWattsEach: null,
      neighbourCamp: null,
      inventoryItemId: null,
      circuit: null,
    });
  });

  it("needs hours for an hours-per-day load", () => {
    const missing = LoadInput.safeParse(freezer({ schedule: "hours_per_day" }));
    expect(missing.success).toBe(false);
    expect(issuePaths(missing)).toEqual(["hoursPerDay"]);
    expect(
      LoadInput.safeParse(
        freezer({ schedule: "hours_per_day", hoursPerDay: 0 }),
      ).success,
    ).toBe(false);
    expect(
      LoadInput.safeParse(
        freezer({ schedule: "hours_per_day", hoursPerDay: 24.5 }),
      ).success,
    ).toBe(false);
    expect(
      LoadInput.parse(freezer({ schedule: "hours_per_day", hoursPerDay: 6 }))
        .hoursPerDay,
    ).toBe(6);
  });

  it("needs one to four windows for a windowed load", () => {
    const missing = LoadInput.safeParse(freezer({ schedule: "windows" }));
    expect(issuePaths(missing)).toEqual(["windows"]);
    expect(
      LoadInput.safeParse(freezer({ schedule: "windows", windows: [] }))
        .success,
    ).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({
      fromHour: i,
      toHour: i + 1,
    }));
    expect(
      LoadInput.safeParse(freezer({ schedule: "windows", windows: five }))
        .success,
    ).toBe(false);
    expect(
      LoadInput.safeParse(
        freezer({ schedule: "windows", windows: five.slice(0, 4) }),
      ).success,
    ).toBe(true);
  });

  it("takes whole hours 0 to 23 that differ, and a window past midnight", () => {
    const ok = LoadInput.parse(
      freezer({ schedule: "windows", windows: [{ fromHour: 18, toHour: 2 }] }),
    );
    expect(ok.windows).toEqual([{ fromHour: 18, toHour: 2 }]);
    for (const w of [
      { fromHour: 18, toHour: 18 },
      { fromHour: 24, toHour: 2 },
      { fromHour: -1, toHour: 2 },
      { fromHour: 18.5, toHour: 2 },
    ]) {
      expect(
        LoadInput.safeParse(freezer({ schedule: "windows", windows: [w] }))
          .success,
        JSON.stringify(w),
      ).toBe(false);
    }
  });

  it("keeps only the fields its schedule uses", () => {
    const load = LoadInput.parse(
      freezer({
        schedule: "full_time",
        hoursPerDay: 6,
        windows: [{ fromHour: 1, toHour: 2 }],
      }),
    );
    expect(load.hoursPerDay).toBeNull();
    expect(load.windows).toBeNull();
  });

  it("takes a day range as both days or neither, first before last", () => {
    expect(LoadInput.parse(freezer({ fromDay: 2, toDay: 5 }))).toMatchObject({
      fromDay: 2,
      toDay: 5,
    });
    expect(LoadInput.parse(freezer({ fromDay: 3, toDay: 3 }))).toMatchObject({
      fromDay: 3,
      toDay: 3,
    });
    expect(issuePaths(LoadInput.safeParse(freezer({ fromDay: 2 })))).toEqual([
      "toDay",
    ]);
    expect(issuePaths(LoadInput.safeParse(freezer({ toDay: 5 })))).toEqual([
      "fromDay",
    ]);
    expect(
      issuePaths(LoadInput.safeParse(freezer({ fromDay: 5, toDay: 2 }))),
    ).toEqual(["toDay"]);
    expect(LoadInput.safeParse(freezer({ fromDay: 0, toDay: 2 })).success).toBe(
      false,
    );
    // Day numbers, not dates.
    expect(
      LoadInput.safeParse(
        freezer({ fromDay: "2027-04-26", toDay: "2027-04-28" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a start-up draw below the running draw", () => {
    expect(
      issuePaths(LoadInput.safeParse(freezer({ surgeWattsEach: 100 }))),
    ).toEqual(["surgeWattsEach"]);
    expect(
      LoadInput.parse(freezer({ surgeWattsEach: 960 })).surgeWattsEach,
    ).toBe(960);
  });

  it("bounds the quantity, the watts and the duty cycle", () => {
    expect(LoadInput.safeParse(freezer({ quantity: 0 })).success).toBe(false);
    expect(LoadInput.safeParse(freezer({ quantity: 1.5 })).success).toBe(false);
    expect(LoadInput.safeParse(freezer({ quantity: 501 })).success).toBe(false);
    expect(LoadInput.safeParse(freezer({ wattsEach: 0 })).success).toBe(false);
    expect(LoadInput.safeParse(freezer({ wattsEach: 20_001 })).success).toBe(
      false,
    );
    expect(LoadInput.safeParse(freezer({ dutyPct: 0 })).success).toBe(false);
    expect(LoadInput.safeParse(freezer({ dutyPct: 101 })).success).toBe(false);
  });

  it("names a neighbouring camp only for a neighbour's load", () => {
    expect(
      LoadInput.parse(
        freezer({ owner: "neighbour", neighbourCamp: "Camp Next Door" }),
      ).neighbourCamp,
    ).toBe("Camp Next Door");
    expect(
      issuePaths(
        LoadInput.safeParse(
          freezer({ owner: "member", neighbourCamp: "Camp Next Door" }),
        ),
      ),
    ).toEqual(["neighbourCamp"]);
    // A blank field is no answer.
    expect(
      LoadInput.parse(freezer({ owner: "camp", neighbourCamp: "  " }))
        .neighbourCamp,
    ).toBeNull();
  });

  it("takes free text for the area, up to 60 characters", () => {
    expect(LoadInput.parse(freezer({ area: "Chill dome" })).area).toBe(
      "Chill dome",
    );
    expect(LoadInput.safeParse(freezer({ area: "x".repeat(61) })).success).toBe(
      false,
    );
    expect(LoadInput.safeParse(freezer({ area: " " })).success).toBe(false);
  });

  it("an edit carries the same rules and the version it opened", () => {
    expect(
      EditLoadInput.safeParse({
        ...freezer({ schedule: "hours_per_day" }),
        loadId: ID,
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      EditLoadInput.parse({ ...freezer(), loadId: ID, expectedVersion: 1 })
        .expectedVersion,
    ).toBe(1);
  });
});

describe("GeneratorInput", () => {
  const gen = {
    model: "5.5 kVA petrol",
    ratedKva: 5.5,
    maxKva: 6,
    tankLitres: 13.5,
    runtime50Hours: 9.8,
    runtime100Hours: 5.5,
    fuelType: "petrol",
    owner: "camp",
  };

  it("takes the issue's generator", () => {
    expect(GeneratorInput.parse(gen)).toMatchObject({
      ratedKva: 5.5,
      inventoryItemId: null,
      noiseNote: null,
    });
  });

  it("needs the maximum at or above the rating", () => {
    expect(issuePaths(GeneratorInput.safeParse({ ...gen, maxKva: 5 }))).toEqual(
      ["maxKva"],
    );
    expect(GeneratorInput.safeParse({ ...gen, maxKva: 5.5 }).success).toBe(
      true,
    );
  });

  it("needs a tank to last longer at half load than at full load", () => {
    expect(
      issuePaths(GeneratorInput.safeParse({ ...gen, runtime100Hours: 9.8 })),
    ).toEqual(["runtime100Hours"]);
    expect(
      GeneratorInput.safeParse({ ...gen, runtime100Hours: 12 }).success,
    ).toBe(false);
  });
});

describe("PowerPlanInput", () => {
  it("fills the defaults: PF 0.8, 7 days, 24 h, a 12 h comparison, 20% margin, 20 L cans", () => {
    const plan = PowerPlanInput.parse({
      generatorId: null,
      expectedVersion: 0,
    });
    expect(plan).toMatchObject({
      powerFactor: 0.8,
      daysOnSite: 7,
      firstPoweredDay: null,
      runFromHour: null,
      runToHour: null,
      compareRunFromHour: 18,
      compareRunToHour: 6,
      lowLoadFactor: 1,
      safetyMarginPct: 20,
      canLitres: 20,
      cansOwned: 0,
      secondGeneratorNote: null,
    });
    expect(POWER_PLAN_DEFAULTS.daysOnSite).toBe(7);
  });

  it("takes a running window as both hours or neither", () => {
    const base = { generatorId: ID, expectedVersion: 3 };
    expect(
      PowerPlanInput.parse({ ...base, runFromHour: 18, runToHour: 6 }),
    ).toMatchObject({ runFromHour: 18, runToHour: 6 });
    expect(
      issuePaths(PowerPlanInput.safeParse({ ...base, runFromHour: 18 })),
    ).toEqual(["runToHour"]);
    expect(
      issuePaths(
        PowerPlanInput.safeParse({ ...base, runFromHour: 6, runToHour: 6 }),
      ),
    ).toEqual(["runToHour"]);
    expect(
      issuePaths(
        PowerPlanInput.safeParse({ ...base, compareRunFromHour: null }),
      ),
    ).toEqual(["compareRunFromHour"]);
    expect(
      PowerPlanInput.safeParse({
        ...base,
        compareRunFromHour: null,
        compareRunToHour: null,
      }).success,
    ).toBe(true);
  });

  it("bounds the power factor, the days and the low-load factor", () => {
    const base = { generatorId: null, expectedVersion: 0 };
    expect(
      PowerPlanInput.safeParse({ ...base, powerFactor: 0.4 }).success,
    ).toBe(false);
    expect(
      PowerPlanInput.safeParse({ ...base, powerFactor: 1.1 }).success,
    ).toBe(false);
    expect(PowerPlanInput.safeParse({ ...base, daysOnSite: 0 }).success).toBe(
      false,
    );
    expect(PowerPlanInput.safeParse({ ...base, daysOnSite: 31 }).success).toBe(
      false,
    );
    expect(
      PowerPlanInput.safeParse({ ...base, lowLoadFactor: 0.9 }).success,
    ).toBe(false);
    expect(
      PowerPlanInput.safeParse({ ...base, lowLoadFactor: 3.1 }).success,
    ).toBe(false);
    expect(PowerPlanInput.safeParse({ ...base, cansOwned: -1 }).success).toBe(
      false,
    );
  });

  it("takes the first powered day as YYYY-MM-DD, or blank", () => {
    const base = { generatorId: null, expectedVersion: 0 };
    expect(
      PowerPlanInput.parse({ ...base, firstPoweredDay: "2027-04-26" })
        .firstPoweredDay,
    ).toBe("2027-04-26");
    expect(
      PowerPlanInput.parse({ ...base, firstPoweredDay: "" }).firstPoweredDay,
    ).toBeNull();
    expect(
      PowerPlanInput.safeParse({ ...base, firstPoweredDay: "26/04/2027" })
        .success,
    ).toBe(false);
    expect(
      PowerPlanInput.safeParse({ ...base, firstPoweredDay: "2027-13-40" })
        .success,
    ).toBe(false);
  });

  it("refuses a day the calendar does not have", () => {
    const base = { generatorId: null, expectedVersion: 0 };
    for (const day of ["2027-02-30", "2027-02-29", "2027-04-31"]) {
      expect(
        PowerPlanInput.safeParse({ ...base, firstPoweredDay: day }).success,
      ).toBe(false);
    }
    expect(
      PowerPlanInput.parse({ ...base, firstPoweredDay: "2028-02-29" })
        .firstPoweredDay,
    ).toBe("2028-02-29");
  });
});
