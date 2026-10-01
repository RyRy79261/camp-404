import { describe, expect, it } from "vitest";
import {
  actionItemDue,
  campDayLabel,
  meetingCounts,
  meetingEventOptions,
  meetingsHref,
  meetingWhen,
  newMeetingHref,
} from "../meeting-notes-view";

const TEAMS = [{ key: "kitchen", label: "Kitchen" }];

describe("meeting notes' words", () => {
  it("says when a meeting was, in camp time", () => {
    expect(meetingWhen(new Date("2026-10-02T16:30:00Z"))).toBe(
      "Fri 2 Oct 2026 · 18:30",
    );
    expect(actionItemDue("2026-10-09")).toBe("Due Fri 9 Oct");
  });

  it("counts decisions and action items, and says nothing for none", () => {
    expect(meetingCounts({ decisions: 2, actionItems: 1 })).toBe(
      "2 decisions · 1 action item",
    );
    expect(meetingCounts({ decisions: 1, actionItems: 0 })).toBe("1 decision");
    expect(meetingCounts({ decisions: 0, actionItems: 0 })).toBeNull();
    expect(meetingCounts({ decisions: 2, actionItems: 0, attendees: 3 })).toBe(
      "3 people there · 2 decisions",
    );
    expect(meetingCounts({ decisions: 0, actionItems: 0, attendees: 1 })).toBe(
      "1 person there",
    );
  });

  it("says a picked day in words, whatever the browser's locale", () => {
    expect(campDayLabel("2026-10-01")).toBe("Thu 1 Oct 2026");
    expect(campDayLabel("")).toBeNull();
    expect(campDayLabel("10/01/2026")).toBeNull();
  });

  it("links to one team's meetings, the whole camp's, or all", () => {
    expect(meetingsHref()).toBe("/meetings");
    expect(meetingsHref("kitchen")).toBe("/meetings?team=kitchen");
    expect(meetingsHref(null)).toBe("/meetings?team=camp");
    expect(newMeetingHref(null)).toBe("/meetings/new?team=camp");
  });
});

describe("meetingEventOptions", () => {
  it("reads each event's team, day and start the way the calendar does", () => {
    expect(
      meetingEventOptions(
        [
          {
            id: "a",
            title: "Kitchen Team - Kickoff",
            start: "2026-10-02T16:30:00Z",
            allDay: false,
            location: null,
            teamTag: "kitchen",
          },
          {
            id: "b",
            title: "Build day",
            start: "2026-10-10",
            allDay: true,
            location: null,
            teamTag: null,
          },
        ],
        TEAMS,
      ),
    ).toEqual([
      {
        id: "a",
        title: "Kickoff",
        team: "kitchen",
        date: "2026-10-02",
        time: "18:30",
        label: "Fri 2 Oct · 18:30 · Kickoff",
      },
      {
        id: "b",
        title: "Build day",
        team: null,
        date: "2026-10-10",
        time: null,
        label: "Sat 10 Oct · All day · Build day",
      },
    ]);
  });
});
