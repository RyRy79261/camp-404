import { describe, expect, it } from "vitest";
import {
  actionItemDue,
  campDayLabel,
  meetingCounts,
  meetingHref,
  meetingsHref,
  meetingWhen,
  newMeetingHref,
} from "../meeting-notes-view";

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

  it("links to one team's meetings, the whole camp's, or all, in the Calendar's list of past meetings", () => {
    const T = "2026-10-10";
    expect(meetingsHref(undefined, T)).toBe(
      "/calendar?view=list&when=past&type=meetings",
    );
    expect(meetingsHref("kitchen", T)).toBe(
      "/calendar?view=list&when=past&team=kitchen&type=meetings",
    );
    expect(meetingsHref(null, T)).toBe(
      "/calendar?view=list&when=past&team=camp&type=meetings",
    );
  });

  it("opens New meeting as the Calendar's form on today, and a meeting on its month", () => {
    expect(newMeetingHref("kitchen", "2026-10-10")).toBe(
      "/calendar?view=month&month=2026-10&team=kitchen&type=meetings&new=2026-10-10",
    );
    expect(
      meetingHref({
        calendarEventId: "evt1",
        heldAt: new Date("2026-09-30T23:30:00Z"),
      }),
    ).toBe("/calendar?view=month&month=2026-10&event=evt1");
  });
});
