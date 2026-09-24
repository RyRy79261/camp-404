import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  parseCalendarFilter,
  type CalendarFilter,
} from "../calendar-view";
import type { CalendarEvent } from "../google-calendar";

// The Calendar page's days and filter, and the team pages' events.

// 10:00 in camp on Wed 23 Sep 2026.
const NOW = new Date("2026-09-23T08:00:00Z");

const TEAMS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "power_and_lighting", label: "Power and Lighting" },
  { key: "art", label: "Art Car" },
];

function event(over: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: "Event",
    start: "2026-09-25T16:00:00Z",
    allDay: false,
    location: null,
    teamTag: null,
    ...over,
  };
}

const EVENTS: CalendarEvent[] = [
  // Started on Monday and still running (an all-day block).
  event({
    id: "strike",
    title: "Strike week",
    start: "2026-09-21",
    allDay: true,
  }),
  // Today, timed, a team's.
  event({
    id: "meet",
    title: "Power and Lighting Team - General meeting",
    start: "2026-09-23T17:00:00Z",
    teamTag: "power_and_lighting",
  }),
  // Today, all day, whole camp.
  event({ id: "build", title: "Build day", start: "2026-09-23", allDay: true }),
  // 23:30 on the 24th in camp is 21:30Z: it belongs to the 24th, not the 25th.
  event({
    id: "late",
    title: "[Kitchen] Late prep",
    start: "2026-09-24T21:30:00Z",
    teamTag: "Kitchen",
    location: "Storage unit",
  }),
  // 00:30 on the 26th in camp is 22:30Z on the 25th.
  event({
    id: "early",
    title: "Kitchen Team - Early bake",
    start: "2026-09-25T22:30:00Z",
  }),
];

function days(filter: CalendarFilter = { kind: "all" }, myTeams = ["kitchen"]) {
  return buildCalendarDays({
    events: EVENTS,
    now: NOW,
    teams: TEAMS,
    myTeams: new Set(myTeams),
    filter,
  });
}

describe("buildCalendarDays", () => {
  it("groups events by camp day, soonest first, all-day before timed", () => {
    expect(
      days().map((d) => [
        d.key,
        d.date,
        d.relative,
        d.items.map((i) => [i.title, i.time]),
      ]),
    ).toEqual([
      [
        "2026-09-23",
        "Wed 23 Sept",
        "Today",
        [
          // Began before today: listed today, saying when it began.
          ["Strike week", "Started Mon 21 Sept"],
          ["Build day", "All day"],
          ["General meeting", "19:00"],
        ],
      ],
      ["2026-09-24", "Thu 24 Sept", "Tomorrow", [["Late prep", "23:30"]]],
      ["2026-09-26", "Sat 26 Sept", "In 3 days", [["Early bake", "00:30"]]],
    ]);
  });

  it("reads each event's team, and whether the viewer is on it", () => {
    const items = days().flatMap((d) => d.items);
    expect(Object.fromEntries(items.map((i) => [i.id, i.team]))).toEqual({
      strike: null,
      build: null,
      meet: {
        key: "power_and_lighting",
        label: "Power and Lighting",
        mine: false,
      },
      late: { key: "kitchen", label: "Kitchen", mine: true },
      early: { key: "kitchen", label: "Kitchen", mine: true },
    });
    expect(items.find((i) => i.id === "late")?.location).toBe("Storage unit");
  });

  it("keeps one team's events for a team filter, and camp-wide ones for 'camp'", () => {
    const ids = (f: CalendarFilter) =>
      days(f).flatMap((d) => d.items.map((i) => i.id));
    expect(ids({ kind: "team", key: "kitchen" })).toEqual(["late", "early"]);
    expect(ids({ kind: "team", key: "power_and_lighting" })).toEqual(["meet"]);
    expect(ids({ kind: "team", key: "art" })).toEqual([]);
    expect(ids({ kind: "camp" })).toEqual(["strike", "build"]);
    expect(ids({ kind: "all" })).toHaveLength(EVENTS.length);
  });
});

describe("parseCalendarFilter", () => {
  it("takes a team the config names, or 'camp'; anything else is every event", () => {
    expect(parseCalendarFilter("kitchen", TEAMS)).toEqual({
      kind: "team",
      key: "kitchen",
    });
    expect(parseCalendarFilter("camp", TEAMS)).toEqual({ kind: "camp" });
    expect(parseCalendarFilter("moon", TEAMS)).toEqual({ kind: "all" });
    expect(parseCalendarFilter(undefined, TEAMS)).toEqual({ kind: "all" });
  });
});
