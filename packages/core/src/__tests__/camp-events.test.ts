import { describe, expect, it } from "vitest";
import {
  anHourAfter,
  campEventCalendarStep,
  campEventRefusal,
  canCreateCampEvents,
  canManageCampEvent,
  hasMinutes,
  NOT_AN_EVENT_MAKER,
  NOT_YOUR_EVENT_TEAM,
  WHOLE_CAMP_EVENTS_ARE_CAPTAINS,
} from "../camp-events";

describe("canManageCampEvent (owner 1A)", () => {
  it("lets a captain manage any team's event and the whole camp's", () => {
    expect(canManageCampEvent("captain", [], "kitchen")).toBe(true);
    expect(canManageCampEvent("captain", [], null)).toBe(true);
  });

  it("lets a lead manage only a team they lead, never the whole camp", () => {
    expect(canManageCampEvent("team_lead", ["kitchen"], "kitchen")).toBe(true);
    expect(canManageCampEvent("team_lead", ["kitchen"], "finance")).toBe(
      false,
    );
    expect(canManageCampEvent("team_lead", ["kitchen"], null)).toBe(false);
  });

  it("refuses a plain member, even for their own team, and an unknown rank", () => {
    expect(canManageCampEvent("camp_member", ["kitchen"], "kitchen")).toBe(
      false,
    );
    expect(canManageCampEvent("god", ["kitchen"], "kitchen")).toBe(false);
  });
});

describe("canCreateCampEvents", () => {
  it("is captains and leads of a team", () => {
    expect(canCreateCampEvents("captain", [])).toBe(true);
    expect(canCreateCampEvents("team_lead", ["power_and_lighting"])).toBe(true);
    expect(canCreateCampEvents("team_lead", [])).toBe(false);
    expect(canCreateCampEvents("camp_member", [])).toBe(false);
    expect(canCreateCampEvents("admin", ["kitchen"])).toBe(false);
  });
});

describe("campEventRefusal (the write's own check)", () => {
  it("says nothing for a captain", () => {
    expect(campEventRefusal(undefined, null)).toBeNull();
    expect(campEventRefusal(undefined, "kitchen")).toBeNull();
  });

  it("refuses a member, a lead on the whole camp, and a lead on another team", () => {
    expect(campEventRefusal([], "kitchen")).toBe(NOT_AN_EVENT_MAKER);
    expect(campEventRefusal(["kitchen"], null)).toBe(
      WHOLE_CAMP_EVENTS_ARE_CAPTAINS,
    );
    expect(campEventRefusal(["kitchen"], "finance")).toBe(NOT_YOUR_EVENT_TEAM);
    expect(campEventRefusal(["kitchen"], "kitchen")).toBeNull();
  });
});

describe("hasMinutes", () => {
  const empty = { notes: "", decisions: 0, actionItems: 0, attendees: 0 };

  it("is no for an agenda alone, or blank notes", () => {
    expect(hasMinutes(empty)).toBe(false);
    expect(hasMinutes({ ...empty, notes: "  \n " })).toBe(false);
  });

  it("is yes for notes, a decision, an action item or who came", () => {
    expect(hasMinutes({ ...empty, notes: "We met." })).toBe(true);
    expect(hasMinutes({ ...empty, decisions: 1 })).toBe(true);
    expect(hasMinutes({ ...empty, actionItems: 1 })).toBe(true);
    expect(hasMinutes({ ...empty, attendees: 1 })).toBe(true);
  });
});

describe("campEventCalendarStep", () => {
  it("puts a live event, removes a removed one, and does nothing without an id", () => {
    expect(campEventCalendarStep({ removed: false, calendarEventId: "a" })).toBe(
      "put",
    );
    expect(campEventCalendarStep({ removed: true, calendarEventId: "a" })).toBe(
      "remove",
    );
    expect(
      campEventCalendarStep({ removed: true, calendarEventId: null }),
    ).toBe("none");
  });
});

describe("anHourAfter", () => {
  it("adds an hour and stays on the day", () => {
    expect(anHourAfter("18:30")).toBe("19:30");
    expect(anHourAfter("09:05")).toBe("10:05");
    expect(anHourAfter("23:30")).toBe("23:59");
  });
});
