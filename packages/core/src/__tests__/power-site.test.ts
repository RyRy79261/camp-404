import { describe, expect, it } from "vitest";
import {
  RECENT_RATE_HOURS,
  actualAgainstEstimate,
  burnRate,
  campLocalInstant,
  campLocalText,
  daysOfFuelLeft,
  effectiveRefuels,
  litresByCampDay,
  lowFuelWarning,
  remainingBurnDays,
  type RefuelEntry,
} from "../power-site";

// Fuel on site (#255). The log is append-only, so what counts is worked out
// from corrections and strike-outs; the rate comes from the litres put in
// between the first and the last refuelling; the warning fires when the fuel
// left covers fewer days than the plan's threshold (or than the burn has
// left, when that is less).

let serial = 0;
function entry(
  local: string,
  litres: number,
  more: Partial<RefuelEntry> = {},
): RefuelEntry {
  return {
    id: `e${++serial}`,
    refuelledAt: campLocalInstant(local),
    litres,
    correctsEntryId: null,
    voided: false,
    ...more,
  };
}

describe("effectiveRefuels", () => {
  it("keeps plain entries, oldest first", () => {
    const b = entry("2027-04-25T12:00", 10);
    const a = entry("2027-04-25T06:00", 10);
    expect(effectiveRefuels([b, a]).map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("drops an entry a correction replaced, and keeps the correction", () => {
    const a = entry("2027-04-25T06:00", 10);
    const fix = entry("2027-04-25T06:00", 12, { correctsEntryId: a.id });
    expect(effectiveRefuels([a, fix]).map((e) => e.litres)).toEqual([12]);
  });

  it("follows a correction of a correction to the last one", () => {
    const a = entry("2027-04-25T06:00", 10);
    const fix = entry("2027-04-25T06:00", 12, { correctsEntryId: a.id });
    const again = entry("2027-04-25T06:00", 11, { correctsEntryId: fix.id });
    expect(effectiveRefuels([a, fix, again]).map((e) => e.litres)).toEqual([
      11,
    ]);
  });

  it("drops a struck-out entry and the strike-out itself", () => {
    const a = entry("2027-04-25T06:00", 10);
    const b = entry("2027-04-25T12:00", 8);
    const strike = entry("2027-04-25T06:00", 10, {
      correctsEntryId: a.id,
      voided: true,
    });
    expect(effectiveRefuels([a, b, strike]).map((e) => e.id)).toEqual([b.id]);
  });
});

describe("burnRate", () => {
  it("needs two refuellings", () => {
    expect(burnRate([])).toBeNull();
    expect(burnRate([entry("2027-04-25T06:00", 10)])).toBeNull();
  });

  it("is the litres after the first over the hours between: 10 L in 6 h is 40 L a day", () => {
    const rate = burnRate([
      entry("2027-04-25T06:00", 10),
      entry("2027-04-25T12:00", 10),
    ]);
    expect(rate).toEqual({ litresPerDay: 40, refuels: 2, hours: 6 });
  });

  it("leaves the first refuelling's litres out: they were burned before the log", () => {
    const rate = burnRate([
      entry("2027-04-25T06:00", 20),
      entry("2027-04-25T18:00", 10),
    ]);
    expect(rate?.litresPerDay).toBe(20);
  });

  it("looks at the last 48 hours only when they hold two refuellings", () => {
    const rate = burnRate([
      entry("2027-04-22T06:00", 5),
      entry("2027-04-22T18:00", 5),
      entry("2027-04-25T06:00", 12),
      entry("2027-04-25T12:00", 12),
    ]);
    // The two old ones are more than 48 h before the last: 12 L in 6 h.
    expect(RECENT_RATE_HOURS).toBe(48);
    expect(rate?.litresPerDay).toBe(48);
    expect(rate?.refuels).toBe(2);
  });

  it("uses the whole log when the last 48 hours hold only one", () => {
    const rate = burnRate([
      entry("2027-04-22T06:00", 5),
      entry("2027-04-25T06:00", 18),
    ]);
    // 18 L over 72 h.
    expect(rate?.litresPerDay).toBe(6);
  });

  it("counts a correction, not what it replaced", () => {
    const a = entry("2027-04-25T06:00", 10);
    const b = entry("2027-04-25T12:00", 10);
    const fix = entry("2027-04-25T12:00", 5, { correctsEntryId: b.id });
    expect(burnRate([a, b, fix])?.litresPerDay).toBe(20);
  });

  it("is null when the refuellings share one moment", () => {
    expect(
      burnRate([entry("2027-04-25T06:00", 10), entry("2027-04-25T06:00", 5)]),
    ).toBeNull();
  });
});

describe("daysOfFuelLeft", () => {
  it("is the litres on hand over the litres a day", () => {
    expect(daysOfFuelLeft(80, 40)).toBe(2);
    expect(daysOfFuelLeft(70, 40)).toBe(1.75);
  });

  it("is null when nothing is being used, and never negative", () => {
    expect(daysOfFuelLeft(80, 0)).toBeNull();
    expect(daysOfFuelLeft(-5, 10)).toBe(0);
  });
});

describe("remainingBurnDays", () => {
  const first = "2027-04-24";

  it("counts today whole: day 3 of 11 leaves 9", () => {
    expect(
      remainingBurnDays(first, 11, campLocalInstant("2027-04-26T23:30")),
    ).toBe(9);
  });

  it("uses the camp's day, not the server's: 00:30 in camp is still that day", () => {
    // 22:30 UTC on the 25th is 00:30 on the 26th in Johannesburg: day 3.
    expect(remainingBurnDays(first, 11, new Date("2027-04-25T22:30:00Z"))).toBe(
      9,
    );
  });

  it("is every day before day 1, and 0 after the last", () => {
    expect(
      remainingBurnDays(first, 11, campLocalInstant("2027-04-01T12:00")),
    ).toBe(11);
    expect(
      remainingBurnDays(first, 11, campLocalInstant("2027-05-10T12:00")),
    ).toBe(0);
  });

  it("is null with no date for day 1", () => {
    expect(remainingBurnDays(null, 11, new Date())).toBeNull();
  });
});

describe("lowFuelWarning", () => {
  it("fires below the threshold and not at it", () => {
    expect(
      lowFuelWarning({ daysLeft: 1.99, thresholdDays: 2, remainingDays: null }),
    ).toBe(true);
    expect(
      lowFuelWarning({ daysLeft: 2, thresholdDays: 2, remainingDays: null }),
    ).toBe(false);
  });

  it("asks only for the days the burn has left when that is fewer", () => {
    // 1.5 days of fuel and 1 day of burn to go: enough.
    expect(
      lowFuelWarning({ daysLeft: 1.5, thresholdDays: 2, remainingDays: 1 }),
    ).toBe(false);
    expect(
      lowFuelWarning({ daysLeft: 0.5, thresholdDays: 2, remainingDays: 1 }),
    ).toBe(true);
  });

  it("is quiet with the threshold off, with no rate, and after the burn", () => {
    expect(
      lowFuelWarning({ daysLeft: 0.1, thresholdDays: 0, remainingDays: null }),
    ).toBe(false);
    expect(
      lowFuelWarning({ daysLeft: null, thresholdDays: 2, remainingDays: 5 }),
    ).toBe(false);
    expect(
      lowFuelWarning({ daysLeft: 0, thresholdDays: 2, remainingDays: 0 }),
    ).toBe(false);
  });
});

describe("actual against the estimate", () => {
  const log = [
    entry("2027-04-24T08:00", 10),
    entry("2027-04-24T20:00", 12),
    entry("2027-04-25T09:00", 15),
    // The day after the plan's last powered day.
    entry("2027-04-27T09:00", 4),
  ];

  it("adds up the litres of each camp day", () => {
    expect([...litresByCampDay(log)]).toEqual([
      ["2027-04-24", 22],
      ["2027-04-25", 15],
      ["2027-04-27", 4],
    ]);
  });

  it("lines the log up with each powered day's estimate by date", () => {
    const rows = actualAgainstEstimate({
      entries: log,
      estimate: [
        { day: 1, litres: 20 },
        { day: 2, litres: 20 },
        { day: 3, litres: 18 },
      ],
      firstPoweredDay: "2027-04-24",
    });
    expect(rows).toEqual([
      { label: "2027-04-24", day: 1, estimate: 20, actual: 22 },
      { label: "2027-04-25", day: 2, estimate: 20, actual: 15 },
      { label: "2027-04-26", day: 3, estimate: 18, actual: 0 },
      { label: "2027-04-27", day: null, estimate: null, actual: 4 },
    ]);
  });

  it("with no date for day 1, shows the log's dates alone", () => {
    const rows = actualAgainstEstimate({
      entries: log,
      estimate: [{ day: 1, litres: 20 }],
      firstPoweredDay: null,
    });
    expect(rows.map((r) => [r.label, r.estimate, r.actual])).toEqual([
      ["2027-04-24", null, 22],
      ["2027-04-25", null, 15],
      ["2027-04-27", null, 4],
    ]);
  });
});

describe("camp-local times", () => {
  it("reads a datetime field as camp time (UTC+2) and writes it back", () => {
    const at = campLocalInstant("2027-04-25T06:00");
    expect(at.toISOString()).toBe("2027-04-25T04:00:00.000Z");
    expect(campLocalText(at)).toBe("2027-04-25T06:00");
  });

  it("shows midnight as 00, not 24", () => {
    expect(campLocalText(new Date("2027-04-24T22:00:00Z"))).toBe(
      "2027-04-25T00:00",
    );
  });
});
