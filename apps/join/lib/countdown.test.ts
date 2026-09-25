import { describe, expect, it } from "vitest";
import { BURN_DATES } from "./content";
import {
  burnCountdown,
  burnDatesLabel,
  countdownLabel,
  countdownShort,
  tankwaToday,
} from "./countdown";

describe("burn countdown", () => {
  it("reads today on the South African calendar", () => {
    // 23:30 UTC on 25 September is already 26 September in Tankwa Town.
    expect(tankwaToday(new Date("2026-09-25T23:30:00Z"))).toBe("2026-09-26");
    expect(tankwaToday(new Date("2026-09-25T12:00:00Z"))).toBe("2026-09-25");
  });

  it("counts whole days to the first day", () => {
    expect(burnCountdown("2026-09-25", BURN_DATES)).toEqual({
      phase: "before",
      days: 213,
    });
    expect(countdownLabel(burnCountdown("2027-04-25", BURN_DATES))).toBe(
      "T-1 day to the Burn",
    );
  });

  it("says which day of the Burn it is, first to last", () => {
    expect(burnCountdown("2027-04-26", BURN_DATES)).toEqual({
      phase: "during",
      day: 1,
    });
    expect(burnCountdown("2027-05-02", BURN_DATES)).toEqual({
      phase: "during",
      day: 7,
    });
  });

  it("is over the day after the last day", () => {
    expect(countdownLabel(burnCountdown("2027-05-03", BURN_DATES))).toBe(
      "See you next Burn",
    );
  });
});

describe("burn dates label", () => {
  it("says the Burn's dates from BURN_DATES", () => {
    expect(burnDatesLabel(BURN_DATES)).toBe("26 April – 2 May 2027");
  });

  it("names both years when the dates cross one", () => {
    expect(burnDatesLabel({ start: "2027-12-30", end: "2028-01-02" })).toBe(
      "30 December 2027 – 2 January 2028",
    );
  });
});

describe("short countdown", () => {
  it("fits a phone", () => {
    expect(countdownShort(burnCountdown("2026-09-25", BURN_DATES))).toBe(
      "T-213d",
    );
    expect(countdownShort(burnCountdown("2027-04-27", BURN_DATES))).toBe(
      "Day 2",
    );
  });
});
