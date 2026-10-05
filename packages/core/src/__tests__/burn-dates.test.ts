import { describe, expect, it } from "vitest";
import { burnDatesLabel, burnPhase } from "../burn-dates";

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
