import { describe, expect, it } from "vitest";
import {
  ClearLogisticsPhaseInput,
  LOGISTICS_MAX_DAYS,
  SetLogisticsPhaseInput,
  logisticsPhaseDays,
} from "../logistics";

const BUILD = {
  phase: "build",
  startDate: "2027-04-24",
  endDate: "2027-04-26",
  expectedVersion: 0,
};

describe("SetLogisticsPhaseInput", () => {
  it("takes a phase's days, and an empty place or note as none", () => {
    expect(
      SetLogisticsPhaseInput.parse({ ...BUILD, place: "  ", note: "" }),
    ).toEqual({ ...BUILD, place: null, note: null });
    expect(
      SetLogisticsPhaseInput.parse({ ...BUILD, place: " Storage unit " }).place,
    ).toBe("Storage unit");
  });

  it("takes a one-day phase", () => {
    expect(
      SetLogisticsPhaseInput.safeParse({ ...BUILD, endDate: BUILD.startDate })
        .success,
    ).toBe(true);
  });

  it("refuses a last day before the first", () => {
    const result = SetLogisticsPhaseInput.safeParse({
      ...BUILD,
      endDate: "2027-04-23",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endDate"]);
  });

  it("refuses a phase longer than the limit, and a day that is not real", () => {
    expect(
      SetLogisticsPhaseInput.safeParse({ ...BUILD, endDate: "2027-06-24" })
        .success,
    ).toBe(false);
    expect(
      SetLogisticsPhaseInput.safeParse({ ...BUILD, startDate: "2027-02-30" })
        .success,
    ).toBe(false);
    expect(
      SetLogisticsPhaseInput.safeParse({ ...BUILD, phase: "party" }).success,
    ).toBe(false);
  });

  it("counts days with both ends in", () => {
    expect(logisticsPhaseDays("2027-04-24", "2027-04-24")).toBe(1);
    expect(logisticsPhaseDays("2027-04-24", "2027-04-26")).toBe(3);
    expect(logisticsPhaseDays("2027-12-31", "2028-01-01")).toBe(2);
    expect(LOGISTICS_MAX_DAYS).toBeGreaterThan(14);
  });
});

describe("ClearLogisticsPhaseInput", () => {
  it("needs a saved version", () => {
    expect(
      ClearLogisticsPhaseInput.safeParse({ phase: "pack", expectedVersion: 0 })
        .success,
    ).toBe(false);
    expect(
      ClearLogisticsPhaseInput.safeParse({ phase: "pack", expectedVersion: 1 })
        .success,
    ).toBe(true);
  });
});
