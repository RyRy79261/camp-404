import { describe, expect, it } from "vitest";
import {
  addMonths,
  calendarHref,
  entryWhen,
  filterEntries,
  googleEntry,
  isDayKey,
  listGroups,
  listRange,
  mergeCalendar,
  monthGridRange,
  monthWeeks,
  parseCalendarState,
  urlNamesMonth,
  type AppEventLike,
  type CalendarEntry,
  type NoteLike,
} from "../calendar-month";

// The Calendar's URL, month grid and list, from plain data (owner,
// 2026-10-10): every view is a link, the month is Monday first, a longer
// event is one bar across its days, and the list's halves are what is coming
// up and what has passed.

const TEAMS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "power_and_lighting", label: "Power and Lighting" },
];
const TODAY = "2026-10-10";

function app(overrides: Partial<AppEventLike> = {}): AppEventLike {
  return {
    calendarEventId: "app1",
    kind: "event",
    team: null,
    title: "Dome rehearsal",
    allDay: false,
    startDate: "2026-10-10",
    endDate: "2026-10-10",
    startTime: "10:00",
    endTime: "13:00",
    place: "The workshop",
    description: "Up and down once, timed.",
    version: 1,
    ...overrides,
  };
}

function note(overrides: Partial<NoteLike> = {}): NoteLike {
  return {
    id: "note1",
    calendarEventId: "app1",
    team: "power_and_lighting",
    title: "Power: solar sizing",
    heldAt: new Date("2026-10-06T17:30:00Z"),
    notesWritten: true,
    decisions: 3,
    actionItems: 3,
    openActionItems: 2,
    attendees: 4,
    firstDecision: "Buy four more 450 W panels",
    ...overrides,
  };
}

describe("the Calendar's URL", () => {
  it("reads every part of a shared link, and makes the same link back", () => {
    const raw = {
      view: "month",
      month: "2026-09",
      team: "kitchen",
      type: "meetings",
      event: "abc123",
    };
    const state = parseCalendarState(raw, TODAY, TEAMS);
    expect(state).toEqual({
      view: "month",
      month: "2026-09",
      when: "upcoming",
      team: "kitchen",
      type: "meetings",
      event: "abc123",
      newOn: null,
    });
    expect(calendarHref(state)).toBe(
      "/calendar?view=month&month=2026-09&team=kitchen&type=meetings&event=abc123",
    );
    expect(
      parseCalendarState({ view: "list", when: "past" }, TODAY, TEAMS),
    ).toMatchObject({ view: "list", when: "past" });
    expect(
      calendarHref(
        parseCalendarState({ view: "list", when: "past" }, TODAY, TEAMS),
      ),
    ).toBe("/calendar?view=list&when=past");
  });

  it("falls back to this month and every event for anything it does not understand", () => {
    expect(
      parseCalendarState(
        {
          view: "year",
          month: "2026-13",
          team: "moon",
          type: "parties",
          event: "../x",
          new: "2026-02-30",
        },
        TODAY,
        TEAMS,
      ),
    ).toEqual({
      view: "month",
      month: "2026-10",
      when: "upcoming",
      team: null,
      type: "all",
      event: null,
      newOn: null,
    });
    // The whole camp is a filter of its own; an archived team's link still works.
    expect(parseCalendarState({ team: "camp" }, TODAY, TEAMS).team).toBe(
      "camp",
    );
    expect(urlNamesMonth({ month: "2026-04" })).toBe(true);
    expect(urlNamesMonth({})).toBe(false);
  });

  it("keeps the New event form's day in the link", () => {
    const state = parseCalendarState({ new: "2026-10-15" }, TODAY, TEAMS);
    expect(state.newOn).toBe("2026-10-15");
    expect(calendarHref(state)).toBe(
      "/calendar?view=month&month=2026-10&new=2026-10-15",
    );
  });
});

describe("days and months", () => {
  it("knows a real day, and steps months across a year's end", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("draws a month from the Monday before the 1st to the Sunday after the end", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    expect(monthGridRange("2026-10")).toEqual({
      from: "2026-09-28",
      to: "2026-11-01",
    });
    // February 2027 starts on a Monday and ends on a Sunday: four weeks.
    expect(monthGridRange("2027-02")).toEqual({
      from: "2027-02-01",
      to: "2027-02-28",
    });
  });
});

describe("mergeCalendar", () => {
  it("reads an app event from the app, skips Google's copy, and makes an event with a note a meeting", () => {
    const entries = mergeCalendar({
      app: [app()],
      google: [
        {
          id: "app1",
          title: "Dome rehearsal (Google's copy)",
          start: "2026-10-10T08:00:00Z",
          allDay: false,
          location: null,
          teamTag: null,
        },
        {
          id: "g1",
          title: "Power and Lighting Team - Solar sizing",
          start: "2026-10-06T17:30:00Z",
          end: "2026-10-06T19:00:00Z",
          allDay: false,
          location: "Online",
          teamTag: null,
        },
        {
          id: "build",
          title: "Build",
          start: "2027-04-21",
          end: "2027-04-26",
          allDay: true,
          location: "Tankwa Karoo",
          teamTag: null,
          origin: "logistics",
        },
      ],
      notes: [note({ calendarEventId: "g1" })],
      teams: TEAMS,
    });
    expect(entries.map((e) => [e.id, e.source, e.kind])).toEqual([
      ["g1", "google", "meeting"],
      ["app1", "app", "event"],
      ["build", "logistics", "event"],
    ]);
    const meeting = entries[0]!;
    expect(meeting).toMatchObject({
      title: "Solar sizing",
      team: { key: "power_and_lighting", label: "Power and Lighting" },
      startDay: "2026-10-06",
      startTime: "19:30",
      endTime: "21:00",
      description: null,
      meeting: { noteId: "note1", minutes: true, openActionItems: 2 },
    });
    expect(entries[1]!.description).toBe("Up and down once, timed.");
    // Google's end date is the day after: the Build runs 21 to 25 April.
    expect(entries[2]).toMatchObject({
      startDay: "2027-04-21",
      endDay: "2027-04-25",
    });
  });

  it("still shows a meeting whose event Google no longer returns, from its note", () => {
    const [entry] = mergeCalendar({
      app: [],
      google: [],
      notes: [
        note({
          calendarEventId: "gone1",
          notesWritten: false,
          decisions: 0,
          actionItems: 0,
          attendees: 0,
        }),
      ],
      teams: TEAMS,
    });
    expect(entry).toMatchObject({
      id: "gone1",
      source: "note",
      kind: "meeting",
      startDay: "2026-10-06",
      startTime: "19:30",
      meeting: { minutes: false },
    });
  });

  it("gives an app meeting with only an agenda no minutes", () => {
    const [entry] = mergeCalendar({
      app: [app({ kind: "meeting" })],
      google: [],
      notes: [
        note({
          notesWritten: false,
          decisions: 0,
          actionItems: 0,
          attendees: 0,
        }),
      ],
      teams: TEAMS,
    });
    expect(entry!.meeting?.minutes).toBe(false);
  });
});

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "x",
    title: "Thing",
    team: null,
    kind: "event",
    allDay: false,
    startDay: "2026-10-10",
    endDay: "2026-10-10",
    startTime: "10:00",
    endTime: "11:00",
    place: null,
    description: null,
    source: "app",
    version: 1,
    meeting: null,
    ...overrides,
  };
}

describe("filterEntries", () => {
  const list = [
    entry({ id: "camp" }),
    entry({
      id: "kitchen-meeting",
      kind: "meeting",
      team: { key: "kitchen", label: "Kitchen" },
    }),
    entry({ id: "kitchen-event", team: { key: "kitchen", label: "Kitchen" } }),
  ];
  it("keeps one team's, the whole camp's, meetings or events", () => {
    const ids = (f: Parameters<typeof filterEntries>[1]) =>
      filterEntries(list, f).map((e) => e.id);
    expect(ids({ team: null, type: "all" })).toEqual([
      "camp",
      "kitchen-meeting",
      "kitchen-event",
    ]);
    expect(ids({ team: "camp", type: "all" })).toEqual(["camp"]);
    expect(ids({ team: "kitchen", type: "meetings" })).toEqual([
      "kitchen-meeting",
    ]);
    expect(ids({ team: null, type: "events" })).toEqual([
      "camp",
      "kitchen-event",
    ]);
  });
});

describe("monthWeeks", () => {
  it("lays a longer event as one bar per week, in lanes, and the rest as a day's chips", () => {
    const weeks = monthWeeks(
      "2026-10",
      [
        entry({
          id: "clean",
          allDay: true,
          startDay: "2026-10-03",
          endDay: "2026-10-04",
          startTime: null,
          endTime: null,
        }),
        entry({
          id: "build",
          allDay: true,
          startDay: "2026-10-23",
          endDay: "2026-10-27",
          startTime: null,
          endTime: null,
        }),
        entry({
          id: "gen",
          startDay: "2026-10-24",
          endDay: "2026-10-24",
          startTime: "09:00",
        }),
        entry({
          id: "late",
          startDay: "2026-10-24",
          endDay: "2026-10-24",
          startTime: "18:00",
        }),
        entry({
          id: "allday",
          allDay: true,
          startDay: "2026-10-24",
          endDay: "2026-10-24",
          startTime: null,
          endTime: null,
        }),
        entry({
          id: "overlap",
          allDay: true,
          startDay: "2026-10-24",
          endDay: "2026-10-25",
          startTime: null,
          endTime: null,
        }),
      ],
      TODAY,
    );
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.days[0]!.key).toBe("2026-09-28");
    expect(weeks[0]!.days[0]!.inMonth).toBe(false);
    expect(weeks[1]!.days[5]).toMatchObject({
      key: "2026-10-10",
      isToday: true,
    });
    expect(weeks[1]!.days[4]!.isPast).toBe(true);

    // Sat 3 to Sun 4: columns 6 and 7.
    expect(weeks[0]!.bars).toEqual([
      expect.objectContaining({
        start: 6,
        end: 8,
        lane: 0,
        fromBefore: false,
        toAfter: false,
      }),
    ]);
    // The build runs Fri 23 to Tue 27: on into the next week, which it starts.
    expect(
      weeks[3]!.bars.map((b) => [
        b.entry.id,
        b.start,
        b.end,
        b.lane,
        b.toAfter,
      ]),
    ).toEqual([
      ["build", 5, 8, 0, true],
      ["overlap", 6, 8, 1, false],
    ]);
    expect(weeks[3]!.lanes).toBe(2);
    expect(weeks[4]!.bars[0]).toMatchObject({
      start: 1,
      end: 3,
      lane: 0,
      fromBefore: true,
    });
    // Sat 24's chips: the one-day ones, all-day first, then by time.
    expect(weeks[3]!.days[5]!.entries.map((e) => e.id)).toEqual([
      "allday",
      "gen",
      "late",
    ]);
    // A phone's day list has everything on the day, bars too.
    expect(weeks[3]!.days[5]!.all.map((e) => e.id)).toContain("build");
  });
});

describe("listGroups", () => {
  const list = [
    entry({ id: "aug", startDay: "2026-08-29", endDay: "2026-08-29" }),
    entry({ id: "sep", startDay: "2026-09-27", endDay: "2026-09-27" }),
    entry({ id: "oct-past", startDay: "2026-10-06", endDay: "2026-10-06" }),
    entry({ id: "today", startDay: "2026-10-10", endDay: "2026-10-10" }),
    entry({
      id: "running",
      allDay: true,
      startDay: "2026-10-09",
      endDay: "2026-10-11",
    }),
    entry({ id: "nov", startDay: "2026-11-05", endDay: "2026-11-05" }),
  ];
  it("lists what has passed newest first, by month", () => {
    expect(
      listGroups(list, "past", TODAY).map((g) => [
        g.label,
        g.entries.map((e) => e.id),
      ]),
    ).toEqual([
      ["October 2026", ["oct-past"]],
      ["September 2026", ["sep"]],
      ["August 2026", ["aug"]],
    ]);
  });
  it("lists what is coming up, today and anything still running included, soonest first", () => {
    expect(
      listGroups(list, "upcoming", TODAY).map((g) => [
        g.label,
        g.entries.map((e) => e.id),
      ]),
    ).toEqual([
      ["October 2026", ["running", "today"]],
      ["November 2026", ["nov"]],
    ]);
  });
  it("reads a year back for Past and a year ahead for Coming up", () => {
    expect(listRange("past", TODAY)).toEqual({
      from: "2025-10-09",
      to: "2026-10-09",
    });
    expect(listRange("upcoming", TODAY)).toEqual({
      from: "2026-10-10",
      to: "2027-10-11",
    });
  });
});

describe("entryWhen", () => {
  it("says a day and times, a day all day, or the days of a longer event", () => {
    expect(
      entryWhen(
        entry({
          startDay: "2026-10-06",
          endDay: "2026-10-06",
          startTime: "19:30",
          endTime: "21:00",
        }),
      ),
    ).toBe("Tuesday 6 October 2026, 19:30 to 21:00");
    expect(
      entryWhen(
        entry({
          allDay: true,
          startTime: null,
          endTime: null,
          startDay: "2026-10-14",
          endDay: "2026-10-14",
        }),
      ),
    ).toBe("Wednesday 14 October 2026, all day");
    expect(
      entryWhen(
        entry({
          allDay: true,
          startTime: null,
          endTime: null,
          startDay: "2026-10-03",
          endDay: "2026-10-04",
        }),
      ),
    ).toBe("Sat 3 Oct to Sun 4 Oct, all day");
  });
});

describe("googleEntry", () => {
  it("reads a timed event that ends at midnight as one day", () => {
    const e = googleEntry(
      {
        id: "late",
        title: "Late one",
        start: "2026-10-10T20:00:00+02:00",
        end: "2026-10-11T00:00:00+02:00",
        allDay: false,
        location: null,
        teamTag: null,
      },
      undefined,
      TEAMS,
    );
    expect(e).toMatchObject({
      startDay: "2026-10-10",
      endDay: "2026-10-10",
      endTime: "00:00",
    });
  });
});
