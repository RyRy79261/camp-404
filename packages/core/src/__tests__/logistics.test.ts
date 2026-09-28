import { describe, expect, it } from "vitest";
import { LOGISTICS_PHASES, Team } from "@camp404/types";
import {
  LOGISTICS_TEAM,
  canEditLogistics,
  logisticsCalendarStep,
  logisticsEventTitle,
} from "../logistics";

describe("canEditLogistics", () => {
  it("names a real team", () => {
    expect(Team.options).toContain(LOGISTICS_TEAM);
  });

  it("lets a captain edit, whatever they lead", () => {
    expect(canEditLogistics("captain", [])).toBe(true);
  });

  it("lets a lead of Transport and Logistics edit", () => {
    expect(canEditLogistics("team_lead", [LOGISTICS_TEAM])).toBe(true);
    expect(canEditLogistics("team_lead", ["kitchen", LOGISTICS_TEAM])).toBe(
      true,
    );
  });

  it("refuses a lead of another team", () => {
    expect(canEditLogistics("team_lead", ["power_and_lighting"])).toBe(false);
    expect(canEditLogistics("team_lead", [])).toBe(false);
  });

  it("refuses a member, even one who names the team", () => {
    expect(canEditLogistics("camp_member", [LOGISTICS_TEAM])).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canEditLogistics("god", [LOGISTICS_TEAM])).toBe(false);
    expect(canEditLogistics("", [LOGISTICS_TEAM])).toBe(false);
  });
});

describe("logisticsEventTitle", () => {
  it("uses the camp's naming convention", () => {
    expect(logisticsEventTitle("Transport and Logistics", "build")).toBe(
      "Transport and Logistics Team - Build",
    );
  });

  it("does not double a label that already ends in Team", () => {
    expect(logisticsEventTitle("Truck Team", "pack")).toBe("Truck Team - Pack");
  });

  it("titles every phase", () => {
    for (const phase of LOGISTICS_PHASES) {
      expect(logisticsEventTitle("T", phase)).toMatch(/^T Team - \w+$/);
    }
  });
});

describe("logisticsCalendarStep", () => {
  const days = { startDate: "2027-04-20", endDate: "2027-04-21" };
  const none = { startDate: null, endDate: null };

  it("puts a phase with days and its event", () => {
    expect(logisticsCalendarStep({ ...days, calendarEventId: "abc12" })).toBe(
      "put",
    );
  });

  it("removes the event of a phase whose days were cleared", () => {
    expect(logisticsCalendarStep({ ...none, calendarEventId: "abc12" })).toBe(
      "remove",
    );
  });

  it("does nothing with no days and no event", () => {
    expect(logisticsCalendarStep({ ...none, calendarEventId: null })).toBe(
      "none",
    );
  });

  it("does nothing without an event id to write under", () => {
    expect(logisticsCalendarStep({ ...days, calendarEventId: null })).toBe(
      "none",
    );
  });
});
