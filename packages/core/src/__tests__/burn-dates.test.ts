import { describe, expect, it } from "vitest";
import {
  burnDatesLabel,
  burnPhase,
  burnDatesProblem,
  cyclesWithBurnDates,
  isIsoDate,
} from "../burn-dates";

const BURN = { start: "2027-04-26", end: "2027-05-02" };

describe("burnPhase", () => {
  it("counts whole days to the first day", () => {
    expect(burnPhase("2026-09-25", BURN)).toEqual({
      phase: "before",
      days: 213,
    });
    expect(burnPhase("2027-04-25", BURN)).toEqual({ phase: "before", days: 1 });
  });

  it("says which day of the Burn it is, first to last", () => {
    expect(burnPhase("2027-04-26", BURN)).toEqual({ phase: "during", day: 1 });
    expect(burnPhase("2027-05-02", BURN)).toEqual({ phase: "during", day: 7 });
  });

  it("is over the day after the last day", () => {
    expect(burnPhase("2027-05-03", BURN)).toEqual({ phase: "after" });
  });

  it("says nothing for a date that does not parse", () => {
    expect(burnPhase("today", BURN)).toBeNull();
    expect(
      burnPhase("2027-04-01", { start: "soon", end: BURN.end }),
    ).toBeNull();
  });
});

describe("burnDatesLabel", () => {
  it("names both days, with the year once when they share it", () => {
    expect(burnDatesLabel(BURN)).toBe("26 April – 2 May 2027");
  });

  it("gives each day its year when the Burn crosses one", () => {
    expect(burnDatesLabel({ start: "2027-12-30", end: "2028-01-02" })).toBe(
      "30 December 2027 – 2 January 2028",
    );
  });

  it("says nothing for a date that does not parse", () => {
    expect(burnDatesLabel({ start: "someday", end: "2027-05-02" })).toBeNull();
  });
});

describe("the Burn's dates a captain saves", () => {
  const cycles = [
    { year: 2027, burnStart: "2027-04-27", burnEnd: "2027-05-03" },
  ];
  it("wants two real days in order, or none", () => {
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(burnDatesProblem({ burnStart: null, burnEnd: null })).toBeNull();
    expect(
      burnDatesProblem({ burnStart: "2027-05-03", burnEnd: "2027-04-27" }),
    ).toBe("invalid-dates");
    expect(burnDatesProblem({ burnStart: "2027-04-27", burnEnd: null })).toBe(
      "invalid-dates",
    );
  });
  it("sets or clears one year's days, and only a year the camp has", () => {
    expect(
      cyclesWithBurnDates(cycles, {
        year: 2027,
        burnStart: null,
        burnEnd: null,
      }),
    ).toEqual({ ok: true, cycles: [{ year: 2027 }] });
    expect(
      cyclesWithBurnDates(cycles, {
        year: 2028,
        burnStart: "2028-04-27",
        burnEnd: "2028-05-01",
      }),
    ).toEqual({ ok: false, reason: "unknown-year" });
    expect(
      cyclesWithBurnDates(cycles, {
        year: 2028,
        burnStart: "2028-05-01",
        burnEnd: "2028-04-27",
      }),
    ).toEqual({ ok: false, reason: "invalid-dates" });
  });
});
