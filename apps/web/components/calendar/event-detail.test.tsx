import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CalendarEntry } from "@/lib/calendar-month";
import { EventDetail } from "./event-detail";

// An event's details: a plain event the app made shows its description; a
// meeting made here does not, because its agenda is on its note (shown as
// Markdown in the Meeting section), and the event's copy would say it twice,
// raw.

afterEach(cleanup);

function entry(extra: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "evt1",
    title: "Kitchen kickoff",
    team: null,
    kind: "event",
    allDay: false,
    startDay: "2026-10-20",
    endDay: "2026-10-20",
    startTime: "18:00",
    endTime: "19:00",
    place: null,
    description: "**Bring** a mug",
    source: "app",
    version: 1,
    meeting: null,
    audience: "camp",
    people: [],
    callUrl: null,
    ...extra,
  };
}

function show(e: CalendarEntry) {
  render(
    <EventDetail
      selected={{
        entry: e,
        note: null,
        canEditEvent: false,
        canWriteMinutes: false,
        peopleNames: [],
        teamLabels: {},
      }}
      today="2026-10-11"
    />,
  );
}

describe("EventDetail", () => {
  it("shows a plain event's description", () => {
    show(entry({}));
    expect(screen.getByText("**Bring** a mug")).toBeTruthy();
  });

  it("leaves out a meeting's raw agenda copy", () => {
    show(entry({ kind: "meeting" }));
    expect(screen.queryByText("**Bring** a mug")).toBeNull();
  });
});
