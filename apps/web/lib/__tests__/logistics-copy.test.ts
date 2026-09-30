import { describe, expect, it } from "vitest";
import { phaseDaysText } from "../logistics-copy";

describe("phaseDaysText", () => {
  it("names one day", () => {
    expect(phaseDaysText("2027-04-24", "2027-04-24")).toBe(
      "Sat 24 Apr 2027, 1 day",
    );
  });

  it("names a run of days, both ends counted, across a month", () => {
    expect(phaseDaysText("2027-04-29", "2027-05-02")).toBe(
      "Thu 29 Apr to Sun 2 May 2027, 4 days",
    );
  });

  it("reads a day as a date, never shifted by a time zone", () => {
    // Camp time is UTC+2; a date read as local midnight would slip a day.
    expect(phaseDaysText("2027-01-01", "2027-01-01")).toBe(
      "Fri 1 Jan 2027, 1 day",
    );
  });
});
