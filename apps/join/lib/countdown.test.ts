import { describe, expect, it } from "vitest";
import { burnPhase, campDayKey } from "@camp404/core";
import { DEFAULT_JOIN_DATA } from "./join-data";
import { countdownLabel, countdownShort } from "./countdown";

const BURN_DATES = DEFAULT_JOIN_DATA.burn!;
const phase = (today: string) => burnPhase(today, BURN_DATES)!;

describe("burn countdown", () => {
  it("reads today on the South African calendar", () => {
    // 23:30 UTC on 25 September is already 26 September in Tankwa Town.
    expect(campDayKey(new Date("2026-09-25T23:30:00Z"))).toBe("2026-09-26");
    expect(campDayKey(new Date("2026-09-25T12:00:00Z"))).toBe("2026-09-25");
  });

  it("counts whole days to the first day", () => {
    expect(countdownLabel(phase("2026-09-25"))).toBe("T-213 days to the Burn");
    expect(countdownLabel(phase("2027-04-25"))).toBe("T-1 day to the Burn");
  });

  it("says which day of the Burn it is", () => {
    expect(countdownLabel(phase("2027-05-02"))).toBe("The Burn · day 7");
  });

  it("is over the day after the last day", () => {
    expect(countdownLabel(phase("2027-05-03"))).toBe("See you next Burn");
  });
});

describe("short countdown", () => {
  it("fits a phone", () => {
    expect(countdownShort(phase("2026-09-25"))).toBe("T-213d");
    expect(countdownShort(phase("2027-04-27"))).toBe("Day 2");
    expect(countdownShort(phase("2027-05-03"))).toBe("Burnt");
  });
});
