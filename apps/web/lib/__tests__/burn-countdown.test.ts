import { describe, expect, it } from "vitest";
import { burnCountdownLabel } from "../burn-countdown";

// Camp days are Johannesburg days (UTC+2 all year): 22:30Z on the 25th is
// already the 26th at camp.

const BURN = { start: "2027-04-26", end: "2027-05-02" };

describe("burnCountdownLabel", () => {
  it("counts whole camp days to the start", () => {
    expect(burnCountdownLabel(new Date("2027-04-01T10:00:00Z"), BURN)).toBe(
      "25 days to the Burn",
    );
    expect(burnCountdownLabel(new Date("2027-04-25T10:00:00Z"), BURN)).toBe(
      "1 day to the Burn",
    );
  });

  it("uses the camp's day, not the host's", () => {
    // 22:30Z on the 25th is 00:30 on the 26th in Johannesburg: day one.
    expect(burnCountdownLabel(new Date("2027-04-25T22:30:00Z"), BURN)).toBe(
      "The Burn, day 1",
    );
  });

  it("names the day during the Burn, and says nothing after it", () => {
    expect(burnCountdownLabel(new Date("2027-05-02T10:00:00Z"), BURN)).toBe(
      "The Burn, day 7",
    );
    expect(burnCountdownLabel(new Date("2027-05-03T10:00:00Z"), BURN)).toBe(
      null,
    );
  });

  it("says nothing with no dates or a bad one", () => {
    expect(burnCountdownLabel(new Date(), null)).toBe(null);
    expect(
      burnCountdownLabel(new Date(), { start: "soon", end: "2027-05-02" }),
    ).toBe(null);
  });
});
