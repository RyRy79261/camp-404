import { describe, expect, it } from "vitest";
import { MAX_SHIFT_DAYS, SHIFT_MINIMUM } from "@camp404/types";
import {
  CLEANING_TEAM,
  SHIFTS_REF_TYPE,
  canAskForShifts,
  canManageShifts,
  isAskedForShifts,
  shiftChangesOpen,
  shiftClashes,
  shiftDayLabel,
  shiftDays,
  shiftFairness,
  shiftReminderText,
  shiftTeamsFor,
  shiftTimeText,
  shiftsAskNotification,
} from "../shifts";
import { notificationLink } from "../notification-links";

describe("canManageShifts: a captain, or a lead of the shift's team", () => {
  it("lets a Sanitation lead set up cleaning shifts, and a captain any team's", () => {
    expect(canManageShifts("team_lead", [CLEANING_TEAM], CLEANING_TEAM)).toBe(
      true,
    );
    expect(canManageShifts("captain", [], CLEANING_TEAM)).toBe(true);
    expect(canManageShifts("captain", [], "kitchen")).toBe(true);
  });

  it("refuses a lead of another team, and a member", () => {
    expect(canManageShifts("team_lead", ["kitchen"], CLEANING_TEAM)).toBe(
      false,
    );
    expect(canManageShifts("camp_member", [CLEANING_TEAM], CLEANING_TEAM)).toBe(
      false,
    );
  });

  it("fails closed on a rank or a team it does not know", () => {
    expect(canManageShifts("god", [CLEANING_TEAM], CLEANING_TEAM)).toBe(false);
    expect(canManageShifts("captain", [], "not_a_team")).toBe(false);
  });

  it("lists the teams a viewer may set up shifts for", () => {
    const teams = ["kitchen", CLEANING_TEAM, "power_and_lighting"];
    expect(shiftTeamsFor("team_lead", ["kitchen"], teams)).toEqual(["kitchen"]);
    expect(shiftTeamsFor("captain", [], teams)).toEqual(teams);
    expect(shiftTeamsFor("camp_member", ["kitchen"], teams)).toEqual([]);
  });
});

describe("canAskForShifts", () => {
  it("is a captain only", () => {
    expect(canAskForShifts("captain")).toBe(true);
    expect(canAskForShifts("team_lead")).toBe(false);
    expect(canAskForShifts("camp_member")).toBe(false);
    expect(canAskForShifts("")).toBe(false);
  });
});

describe("shiftChangesOpen: until the slot's day starts", () => {
  it("is open before the day and closed on and after it", () => {
    expect(shiftChangesOpen("2027-04-28", "2027-04-27")).toBe(true);
    expect(shiftChangesOpen("2027-04-28", "2027-04-28")).toBe(false);
    expect(shiftChangesOpen("2027-04-28", "2027-04-29")).toBe(false);
  });
});

describe("shiftDays", () => {
  it("is every day of the Burn, both ends counted", () => {
    expect(shiftDays({ start: "2027-04-29", end: "2027-05-02" })).toEqual([
      "2027-04-29",
      "2027-04-30",
      "2027-05-01",
      "2027-05-02",
    ]);
  });

  it("is empty until the Burn has days, or when they are backwards", () => {
    expect(shiftDays(null)).toEqual([]);
    expect(shiftDays({ start: null, end: null })).toEqual([]);
    expect(shiftDays({ start: "2027-05-02", end: "2027-04-29" })).toEqual([]);
  });

  it("stops at MAX_SHIFT_DAYS", () => {
    expect(shiftDays({ start: "2027-01-01", end: "2027-12-31" })).toHaveLength(
      MAX_SHIFT_DAYS,
    );
  });

  it("labels a day and a shift's hours plainly", () => {
    expect(shiftDayLabel("2027-04-29")).toBe("Thu 29 Apr");
    expect(shiftTimeText(8 * 60, 120)).toBe("08:00–10:00");
    // A night watch runs to midnight.
    expect(shiftTimeText(16 * 60, 480)).toBe("16:00–00:00");
  });
});

describe("shiftClashes", () => {
  const at = (key: string, day: string, start: number, minutes: number) => ({
    key,
    day,
    startMinute: start,
    durationMinutes: minutes,
  });

  it("finds two shifts at the same time", () => {
    expect(
      shiftClashes([
        at("cook", "2027-04-29", 9 * 60, 180),
        at("clean", "2027-04-29", 11 * 60, 120),
        at("ice", "2027-04-30", 11 * 60, 120),
      ]),
    ).toEqual([["cook", "clean"]]);
  });

  it("lets one shift end as the next starts", () => {
    expect(
      shiftClashes([
        at("a", "2027-04-29", 8 * 60, 120),
        at("b", "2027-04-29", 10 * 60, 60),
      ]),
    ).toEqual([]);
  });

  it("carries a night shift past midnight into the next day", () => {
    expect(
      shiftClashes([
        at("watch", "2027-04-29", 22 * 60, 480),
        at("brunch", "2027-04-30", 5 * 60, 60),
      ]),
    ).toEqual([["watch", "brunch"]]);
  });
});

describe("the minimum, as a reminder", () => {
  it("reminds below the minimum and is silent at it", () => {
    expect(shiftReminderText(0)).toBe(
      `You're not on any shifts yet. The camp asks everyone for at least ${SHIFT_MINIMUM}.`,
    );
    expect(shiftReminderText(1)).toBe(
      `You're on 1 shift. The camp asks everyone for at least ${SHIFT_MINIMUM}.`,
    );
    expect(shiftReminderText(SHIFT_MINIMUM)).toBeNull();
    expect(shiftReminderText(SHIFT_MINIMUM + 2)).toBeNull();
  });

  it("asks who is coming, and its notice opens Shifts", () => {
    expect(isAskedForShifts("applied")).toBe(true);
    expect(isAskedForShifts("accepted")).toBe(true);
    expect(isAskedForShifts("maybe")).toBe(false);
    expect(isAskedForShifts(null)).toBe(false);
    const notice = shiftsAskNotification({ requiredActionId: null });
    expect(notice.refType).toBe(SHIFTS_REF_TYPE);
    expect(notificationLink(notice.refType, notice.refId)).toBe("/shifts");
  });
});

describe("shiftFairness", () => {
  it("counts by member id, fewest first, and marks who is below the minimum", () => {
    const coming = [
      { userId: "u1", name: "Ann Able" },
      { userId: "u2", name: "Ann Able" },
      { userId: "u3", name: "Bea Busy" },
    ];
    // Two members share a name; the counts stay apart.
    const rows = shiftFairness(coming, ["u3", "u3", "u3", "u1", "x9"]);
    expect(rows).toEqual([
      { userId: "u2", name: "Ann Able", count: 0, below: true },
      { userId: "u1", name: "Ann Able", count: 1, below: true },
      { userId: "u3", name: "Bea Busy", count: 3, below: false },
    ]);
  });
});
