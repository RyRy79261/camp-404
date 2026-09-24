import {
  CAMP_TIME_ZONE,
  campDayKey,
  readTeamEvent,
  type CalendarTeam,
} from "@camp404/core";
import type { CalendarEvent } from "./google-calendar";
import { daysBetween, relativeDay } from "./home";

// The Calendar page and each team's page, decided from the camp calendar's
// events and nothing else (owner, 2026-09-24: "Also a calendar section, and
// team overviews that show team events"). Pure: the page reads the calendar,
// this groups it by camp day and keeps what the filter asks for.

/** Which events a list shows. */
export type CalendarFilter =
  | { kind: "all" }
  /** Events with no team: the whole camp's. */
  | { kind: "camp" }
  | { kind: "team"; key: string };

/** The `?team=` value that asks for whole-camp events only. */
export const WHOLE_CAMP_FILTER = "camp";

/**
 * The filter a `?team=` value asks for. A team the camp config names (archived
 * ones too, so an old link still works) or "camp"; anything else, including
 * nothing, is every event, never a list silently filtered to nothing.
 */
export function parseCalendarFilter(
  raw: string | undefined,
  teams: readonly CalendarTeam[],
): CalendarFilter {
  if (raw === WHOLE_CAMP_FILTER) return { kind: "camp" };
  if (raw && teams.some((t) => t.key === raw))
    return { kind: "team", key: raw };
  return { kind: "all" };
}

export interface CalendarItem {
  id: string;
  /** The title without its team's prefix; the badge says whose it is. */
  title: string;
  /** "All day", "18:00", or "Started Thu 1 Oct" for one already under way. */
  time: string;
  location: string | null;
  /** The team it is for, and whether the viewer is on it. Null: whole camp. */
  team: { key: string; label: string; mine: boolean } | null;
}

export interface CalendarDay {
  /** The camp day, YYYY-MM-DD. */
  key: string;
  /** "Fri 2 Oct". */
  date: string;
  /** "Today", "Tomorrow", "In 7 days". */
  relative: string;
  items: CalendarItem[];
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});

/** "Fri 2 Oct" for a camp day, without the comma Intl puts after the weekday. */
function dayLabel(key: string): string {
  return DATE.format(new Date(`${key}T00:00:00Z`)).replace(",", "");
}

/**
 * The camp calendar's events as days, soonest first, each day's events in
 * start order (all-day ones first). `teams` is every team in the camp config,
 * archived ones too, so an old event still finds its team; `myTeams` are the
 * viewer's teams this year.
 *
 * An event that began before today (a long all-day event, or one running now)
 * is listed under today, saying when it started, so the page never opens on
 * the past.
 */
export function buildCalendarDays(input: {
  events: readonly CalendarEvent[];
  now: Date;
  teams: readonly CalendarTeam[];
  myTeams: ReadonlySet<string>;
  filter: CalendarFilter;
}): CalendarDay[] {
  const today = campDayKey(input.now);
  const byDay = new Map<string, { item: CalendarItem; sort: string }[]>();

  for (const event of input.events) {
    const read = readTeamEvent(event.title, event.teamTag, input.teams);
    const teamKey = read.team?.key ?? null;
    if (input.filter.kind === "camp" && teamKey !== null) continue;
    if (input.filter.kind === "team" && teamKey !== input.filter.key) continue;

    const at = event.allDay ? null : new Date(event.start);
    const startDay = at ? campDayKey(at) : event.start.slice(0, 10);
    const started = startDay < today;
    const day = started ? today : startDay;
    const clock = at ? TIME.format(at) : null;
    const time = started
      ? `Started ${dayLabel(startDay)}`
      : (clock ?? "All day");

    const items = byDay.get(day) ?? [];
    items.push({
      item: {
        id: event.id,
        title: read.title || "Untitled event",
        time,
        location: event.location,
        team: read.team
          ? {
              key: read.team.key,
              label: read.team.label,
              mine: input.myTeams.has(read.team.key),
            }
          : null,
      },
      // Started and all-day events lead the day, then by the clock.
      sort: started ? "0" : clock ? `2${clock}` : "1",
    });
    byDay.set(day, items);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      date: dayLabel(key),
      relative: relativeDay(daysBetween(today, key)),
      items: items
        .sort((a, b) => a.sort.localeCompare(b.sort))
        .map(({ item }) => item),
    }));
}
