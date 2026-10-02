import { describe, expect, it } from "vitest";
import {
  PREP_BAD_DATE,
  PREP_DATE_NOT_BEFORE,
  PREP_NEEDS_DAY_ONE,
  addDays,
  canAddPrepSteps,
  dayOneShift,
  prepDueDate,
  prepGoesOnBoard,
  prepSheetLines,
  prepTaskDetails,
  prepTaskTitle,
  shortDay,
} from "../kitchen-prep";
import { KITCHEN_TEAM } from "../recipes";

// Prep steps (#245, Option A of kitchen-prep.html and the owner's answers):
// due the day before the meal, the same day, or a date before we leave; a
// step due before Day 1 goes on the task board, one due on site prints on
// that day's site sheet.

const FIRST = "2027-04-22"; // Day 1, a Thursday

describe("canAddPrepSteps", () => {
  it("is a captain or a Kitchen lead only", () => {
    expect(canAddPrepSteps("captain", [])).toBe(true);
    expect(canAddPrepSteps("team_lead", [KITCHEN_TEAM])).toBe(true);
    expect(canAddPrepSteps("team_lead", ["power"])).toBe(false);
    expect(canAddPrepSteps("camp_member", [KITCHEN_TEAM])).toBe(false);
  });
});

describe("addDays", () => {
  it("rolls over a month end and a leap day", () => {
    expect(addDays("2027-04-30", 1)).toBe("2027-05-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("refuses something that is not a date", () => {
    expect(addDays("2027-02-30", 0)).toBeNull();
    expect(addDays("tomorrow", 1)).toBeNull();
  });
});

describe("prepDueDate", () => {
  it("is the day before the meal, or the meal's day", () => {
    expect(
      prepDueDate({ firstDay: FIRST, day: 3, when: "day_before", date: null }),
    ).toEqual({ ok: true, due: "2027-04-23" });
    expect(
      prepDueDate({ firstDay: FIRST, day: 3, when: "same_day", date: null }),
    ).toEqual({ ok: true, due: "2027-04-24" });
  });

  it("is the day before Day 1 for the day before Day 1's meal: before we leave", () => {
    const due = prepDueDate({
      firstDay: FIRST,
      day: 1,
      when: "day_before",
      date: null,
    });
    expect(due).toEqual({ ok: true, due: "2027-04-21" });
    expect(prepGoesOnBoard("2027-04-21", FIRST)).toBe(true);
  });

  it("takes the date picked for before we leave, only before Day 1", () => {
    expect(
      prepDueDate({
        firstDay: FIRST,
        day: 3,
        when: "before_leaving",
        date: "2027-04-20",
      }),
    ).toEqual({ ok: true, due: "2027-04-20" });
    expect(
      prepDueDate({
        firstDay: FIRST,
        day: 3,
        when: "before_leaving",
        date: FIRST,
      }),
    ).toEqual({ ok: false, error: PREP_DATE_NOT_BEFORE });
    expect(
      prepDueDate({
        firstDay: FIRST,
        day: 3,
        when: "before_leaving",
        date: null,
      }),
    ).toEqual({ ok: false, error: PREP_BAD_DATE });
  });

  it("needs the date of Day 1", () => {
    expect(
      prepDueDate({ firstDay: null, day: 3, when: "same_day", date: null }),
    ).toEqual({ ok: false, error: PREP_NEEDS_DAY_ONE });
  });
});

describe("prepGoesOnBoard", () => {
  it("is before Day 1 only: a step on site prints on the sheet", () => {
    expect(prepGoesOnBoard("2027-04-20", FIRST)).toBe(true);
    expect(prepGoesOnBoard(FIRST, FIRST)).toBe(false);
    expect(prepGoesOnBoard("2027-04-23", FIRST)).toBe(false);
  });
});

describe("the task's words", () => {
  it("titles the task with the recipe, its plates and the step", () => {
    expect(prepTaskTitle("Overnight oats", 60, "Soak the oats")).toBe(
      "Overnight oats ×60: soak the oats",
    );
  });

  it("says which meal it is for", () => {
    expect(prepTaskDetails(3, "breakfast", FIRST)).toBe(
      "For Day 3 breakfast, Sat 24 Apr",
    );
    expect(prepTaskDetails(3, "dinner", null)).toBe("For Day 3 dinner");
    expect(shortDay("2027-04-23")).toBe("Fri 23 Apr");
    expect(shortDay("nope")).toBe("nope");
  });
});

describe("prepSheetLines", () => {
  it("lists the steps due that day, breakfast before dinner, as short lines", () => {
    const steps = [
      {
        dueDate: "2027-04-23",
        what: "Make the dressing",
        recipeTitle: "Green salad",
        day: 3,
        meal: "dinner" as const,
      },
      {
        dueDate: "2027-04-23",
        what: "Soak the oats",
        recipeTitle: "Overnight oats",
        day: 3,
        meal: "breakfast" as const,
      },
      {
        dueDate: "2027-04-20",
        what: "Cook the chilli base",
        recipeTitle: "Chilli sin carne",
        day: 3,
        meal: "dinner" as const,
      },
    ];
    expect(prepSheetLines("2027-04-23", steps)).toEqual([
      "Soak the oats (Overnight oats, Day 3 breakfast)",
      "Make the dressing (Green salad, Day 3 dinner)",
    ]);
    expect(prepSheetLines("2027-04-25", steps)).toEqual([]);
  });
});

describe("dayOneShift", () => {
  it("is how many days Day 1 moved, across a month end", () => {
    expect(dayOneShift("2027-04-22", "2027-04-24")).toBe(2);
    expect(dayOneShift("2027-04-30", "2027-05-02")).toBe(2);
    expect(dayOneShift("2027-04-22", "2027-04-19")).toBe(-3);
  });

  it("is nothing when Day 1 did not move, or one side has no date", () => {
    expect(dayOneShift("2027-04-22", "2027-04-22")).toBeNull();
    expect(dayOneShift(null, "2027-04-22")).toBeNull();
    expect(dayOneShift("2027-04-22", null)).toBeNull();
    expect(dayOneShift("2027-04-22", "soon")).toBeNull();
  });
});
