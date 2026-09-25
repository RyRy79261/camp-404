import { describe, expect, it } from "vitest";
import {
  canWorkInTeam,
  meetingInstant,
  meetingTimeKey,
} from "../meeting-notes";

describe("canWorkInTeam", () => {
  it("lets a member of the team write its notes", () => {
    expect(canWorkInTeam("camp_member", ["kitchen"], "kitchen")).toBe(true);
    expect(canWorkInTeam("team_lead", ["finance", "kitchen"], "kitchen")).toBe(
      true,
    );
  });

  it("refuses a member of another team, lead or not", () => {
    expect(canWorkInTeam("camp_member", ["finance"], "kitchen")).toBe(false);
    expect(canWorkInTeam("team_lead", ["finance"], "kitchen")).toBe(false);
    expect(canWorkInTeam("camp_member", [], "kitchen")).toBe(false);
  });

  it("lets a captain write any team's notes without joining it", () => {
    expect(canWorkInTeam("captain", [], "kitchen")).toBe(true);
  });

  it("keeps a whole-camp note to captains", () => {
    expect(canWorkInTeam("captain", [], null)).toBe(true);
    expect(canWorkInTeam("team_lead", ["kitchen"], null)).toBe(false);
    expect(canWorkInTeam("camp_member", ["kitchen"], null)).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canWorkInTeam("god", ["kitchen"], "kitchen")).toBe(false);
    expect(canWorkInTeam("", ["kitchen"], "kitchen")).toBe(false);
  });
});

describe("meeting times", () => {
  it("reads a day and a time as camp time, UTC+2", () => {
    expect(meetingInstant("2026-10-02", "18:30").toISOString()).toBe(
      "2026-10-02T16:30:00.000Z",
    );
  });

  it("gives the time back in camp time", () => {
    expect(meetingTimeKey(new Date("2026-10-02T16:30:00Z"))).toBe("18:30");
    expect(meetingTimeKey(new Date("2026-10-02T22:05:00Z"))).toBe("00:05");
  });
});
