import { describe, expect, it } from "vitest";
import {
  AddDeadlineInput,
  SetAfrikaburnDateInput,
  SetAttendanceInput,
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

describe("SetAttendanceInput", () => {
  it("takes an answer for a phase that needs hands", () => {
    expect(
      SetAttendanceInput.parse({
        phase: "pack",
        answer: "maybe",
        expected: null,
      }),
    ).toEqual({ phase: "pack", answer: "maybe", expected: null });
  });

  it("refuses travel and the burn, and an unknown answer", () => {
    for (const phase of ["travel", "burn"]) {
      expect(
        SetAttendanceInput.safeParse({ phase, answer: "going", expected: null })
          .success,
      ).toBe(false);
    }
    expect(
      SetAttendanceInput.safeParse({
        phase: "pack",
        answer: "yes",
        expected: null,
      }).success,
    ).toBe(false);
  });
});

describe("AddDeadlineInput", () => {
  it("keeps a date as typed, and an empty date as not known", () => {
    expect(
      AddDeadlineInput.parse({
        title: " DDT sale ",
        dueDate: "2027-02-01",
        note: "",
      }),
    ).toEqual({ title: "DDT sale", dueDate: "2027-02-01", note: null });
    expect(
      AddDeadlineInput.parse({ title: "DDT sale", dueDate: "" }).dueDate,
    ).toBeNull();
  });

  it("needs a title and a real date", () => {
    expect(AddDeadlineInput.safeParse({ title: "  " }).success).toBe(false);
    expect(
      AddDeadlineInput.safeParse({ title: "WAP", dueDate: "2027-02-30" })
        .success,
    ).toBe(false);
  });
});

describe("SetAfrikaburnDateInput", () => {
  const base = { kind: "registration_closes", expectedVersion: null };

  it("needs a date unless it is no round this year, which drops the day", () => {
    expect(
      SetAfrikaburnDateInput.safeParse({ ...base, dueDate: "" }).error
        ?.issues[0]?.message,
    ).toBe("Pick the date.");
    expect(
      SetAfrikaburnDateInput.parse({
        ...base,
        kind: "second_ddt_round",
        dueDate: "2027-04-01",
        skipped: true,
      }),
    ).toMatchObject({ dueDate: null, skipped: true });
    expect(
      SetAfrikaburnDateInput.parse({ ...base, dueDate: "2027-02-27" }),
    ).toMatchObject({ dueDate: "2027-02-27", skipped: false, note: null });
  });

  it("refuses an unknown kind", () => {
    expect(
      SetAfrikaburnDateInput.safeParse({
        ...base,
        kind: "burn_starts",
        dueDate: "2027-02-27",
      }).success,
    ).toBe(false);
  });
});
