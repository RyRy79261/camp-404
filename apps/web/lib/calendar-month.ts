import {
  campDayKey,
  meetingTimeKey,
  readTeamEvent,
  type CalendarTeam,
} from "@camp404/core";
import { CALENDAR_EVENT_ID } from "@camp404/types";
import type { CalendarEvent } from "./google-calendar";

// The Calendar program (owner, 2026-10-10: one Calendar; meetings are a type
// of event in it): its URL, its month grid and its list, decided from plain
// data. Pure and safe in a browser: the page reads Google, the app's events
// and the meeting notes on the server, merges them here, and the board lays
// them out. Days are camp days ("YYYY-MM-DD", Africa/Johannesburg, which is
// UTC+2 all year); date maths is the platform Date in UTC, a day at a time,
// with no calendar library.

// --- The URL ------------------------------------------------------------------

export type CalendarViewKind = "month" | "list";
export type CalendarListScope = "upcoming" | "past";
export type CalendarTypeFilter = "all" | "meetings" | "events";

/** Everything a Calendar link says, so every view can be shared. */
export interface CalendarState {
  view: CalendarViewKind;
  /** The month on screen, YYYY-MM. */
  month: string;
  /** The list's half: what is coming up, or what has passed. */
  when: CalendarListScope;
  /** A team key, `WHOLE_CAMP` for whole-camp events, or null for every team. */
  team: string | null;
  type: CalendarTypeFilter;
  /** The open event's id (its Google id), or null. */
  event: string | null;
  /** The New event form, open on this camp day, or null. */
  newOn: string | null;
}

/** The `team=` value for whole-camp events only. */
export const WHOLE_CAMP = "camp";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const EVENT_ID = CALENDAR_EVENT_ID;

/** Whether a YYYY-MM-DD string is a real day. */
export function isDayKey(value: string): boolean {
  if (!DAY.test(value)) return false;
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(value);
}

/**
 * What a Calendar URL asks for. Anything it does not understand falls back to
 * the default (this month, every team, every type), never an empty view.
 * `teams` are every team the camp config names, archived ones too, so an old
 * link still works. With an event and no month, the month is the event's,
 * which the page fills in once it has found the event.
 */
export function parseCalendarState(
  raw: Readonly<Record<string, string | string[] | undefined>>,
  today: string,
  teams: readonly { key: string }[],
): CalendarState {
  const one = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const team = one("team");
  const type = one("type");
  const month = one("month");
  const event = one("event");
  const newOn = one("new");
  return {
    view: one("view") === "list" ? "list" : "month",
    month: month && MONTH.test(month) ? month : today.slice(0, 7),
    when: one("when") === "past" ? "past" : "upcoming",
    team:
      team === WHOLE_CAMP
        ? WHOLE_CAMP
        : team && teams.some((t) => t.key === team)
          ? team
          : null,
    type: type === "meetings" || type === "events" ? type : "all",
    event: event && EVENT_ID.test(event) ? event : null,
    newOn: newOn && isDayKey(newOn) ? newOn : null,
  };
}

/** Whether the URL named its month (so a link to an event keeps it). */
export function urlNamesMonth(
  raw: Readonly<Record<string, string | string[] | undefined>>,
): boolean {
  const month = raw.month;
  return typeof month === "string" && MONTH.test(month);
}

/**
 * The Calendar URL for a state. It always names the view and its month (or
 * the list's half), so a link shows the same thing tomorrow; the filters and
 * the open event only when set.
 */
export function calendarHref(state: CalendarState): string {
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (state.view === "month") params.set("month", state.month);
  else params.set("when", state.when);
  if (state.team) params.set("team", state.team);
  if (state.type !== "all") params.set("type", state.type);
  if (state.event) params.set("event", state.event);
  if (state.newOn) params.set("new", state.newOn);
  return `/calendar?${params.toString()}`;
}

// --- Days ---------------------------------------------------------------------

/** The day `n` days after a YYYY-MM-DD key (UTC round-trip). */
export function addDays(key: string, n: number): string {
  const at = new Date(`${key}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/** The month `n` months after YYYY-MM. */
export function addMonths(month: string, n: number): string {
  const at = new Date(`${month}-01T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + n);
  return at.toISOString().slice(0, 7);
}

/** 0 for Monday … 6 for Sunday. */
function mondayIndex(key: string): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The last day of a month, YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/** The days a month's grid shows: Monday before the 1st to Sunday after the end. */
export function monthGridRange(month: string): { from: string; to: string } {
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  return {
    from: addDays(first, -mondayIndex(first)),
    to: addDays(last, 6 - mondayIndex(last)),
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});

const utc = (key: string) => new Date(`${key}T00:00:00Z`);

/** "October 2026". */
export function monthLabel(month: string): string {
  return MONTH_LABEL.format(utc(`${month}-01`));
}

/** "Tuesday 6 October 2026". */
export function longDayLabel(key: string): string {
  return LONG_DAY.format(utc(key)).replace(",", "");
}

/** "Tue 6 Oct". */
export function shortDayLabel(key: string): string {
  return SHORT_DAY.format(utc(key)).replace(",", "");
}

/** "Tue". */
export function weekdayLabel(key: string): string {
  return WEEKDAY.format(utc(key));
}

/** "Oct". */
export function monthShortLabel(key: string): string {
  return MONTH_SHORT.format(utc(key));
}

// --- Entries ------------------------------------------------------------------

export type CalendarEntrySource =
  /** Made in the Calendar: the app keeps it, and its makers change it. */
  | "app"
  /** Made in Google: shown as Google has it, changed only there. */
  | "google"
  /** A logistics phase, changed on Logistics. */
  | "logistics"
  /** An AfrikaBurn date, changed on the camp's year page. */
  | "deadline"
  /** A meeting whose event the calendar did not return: from its note. */
  | "note";

/** A meeting's minutes, in brief, for the grid and the list. */
export interface CalendarMeetingSummary {
  noteId: string | null;
  /** Anything written after the meeting: notes, a decision, an item, who came. */
  minutes: boolean;
  decisions: number;
  actionItems: number;
  openActionItems: number;
  firstDecision: string | null;
}

/** One thing on the calendar, from whichever source, as the board shows it. */
export interface CalendarEntry {
  /** The Google event id: the link's `event=`. */
  id: string;
  title: string;
  team: { key: string; label: string } | null;
  kind: "event" | "meeting";
  allDay: boolean;
  /** Camp days, both counted. */
  startDay: string;
  endDay: string;
  /** HH:MM camp time; null for all day. */
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  /** Only an event the app made carries one: Google's is never read. */
  description: string | null;
  source: CalendarEntrySource;
  /** The app's row version, for a change; null for anything else. */
  version: number | null;
  meeting: CalendarMeetingSummary | null;
}

/** An event the app made, as the merge needs it. */
export interface AppEventLike {
  calendarEventId: string;
  kind: "event" | "meeting";
  team: string | null;
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  description: string | null;
  version: number;
}

/** A meeting note, as the merge needs it. */
export interface NoteLike {
  id: string;
  calendarEventId: string | null;
  team: string | null;
  title: string;
  heldAt: Date;
  notesWritten: boolean;
  decisions: number;
  actionItems: number;
  openActionItems: number;
  attendees: number;
  firstDecision: string | null;
}

function teamOf(
  key: string | null,
  teams: readonly CalendarTeam[],
): CalendarEntry["team"] {
  if (!key) return null;
  const team = teams.find((t) => t.key === key);
  return { key, label: team?.label ?? key };
}

function meetingOf(note: NoteLike | undefined): CalendarMeetingSummary {
  if (!note) {
    return {
      noteId: null,
      minutes: false,
      decisions: 0,
      actionItems: 0,
      openActionItems: 0,
      firstDecision: null,
    };
  }
  return {
    noteId: note.id,
    minutes:
      note.notesWritten ||
      note.decisions > 0 ||
      note.actionItems > 0 ||
      note.attendees > 0,
    decisions: note.decisions,
    actionItems: note.actionItems,
    openActionItems: note.openActionItems,
    firstDecision: note.firstDecision,
  };
}

/** A Google event's camp days and times. */
function googleWhen(
  event: CalendarEvent,
): Pick<
  CalendarEntry,
  "allDay" | "startDay" | "endDay" | "startTime" | "endTime"
> {
  if (event.allDay) {
    const startDay = event.start.slice(0, 10);
    const end = event.end?.slice(0, 10);
    const endDay = end && end > startDay ? addDays(end, -1) : startDay;
    return { allDay: true, startDay, endDay, startTime: null, endTime: null };
  }
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  const startDay = campDayKey(start);
  // An end at midnight belongs to the day before.
  const endDay = end
    ? campDayKey(new Date(Math.max(start.getTime(), end.getTime() - 1)))
    : startDay;
  return {
    allDay: false,
    startDay,
    endDay,
    startTime: meetingTimeKey(start),
    endTime: end ? meetingTimeKey(end) : null,
  };
}

/** The entry for an event the app made. */
export function appEntry(
  row: AppEventLike,
  note: NoteLike | undefined,
  teams: readonly CalendarTeam[],
): CalendarEntry {
  return {
    id: row.calendarEventId,
    title: row.title,
    team: teamOf(row.team, teams),
    kind: row.kind,
    allDay: row.allDay,
    startDay: row.startDate,
    endDay: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    place: row.place,
    description: row.description,
    source: "app",
    version: row.version,
    meeting: row.kind === "meeting" ? meetingOf(note) : null,
  };
}

/**
 * The entry for an event made in Google (or a logistics day, a deadline).
 * Never for Google's copy of an app event: the app's row is read instead.
 */
export function googleEntry(
  event: CalendarEvent,
  note: NoteLike | undefined,
  teams: readonly CalendarTeam[],
): CalendarEntry {
  const read = readTeamEvent(event.title, event.teamTag, teams);
  return {
    id: event.id,
    title: read.title || "Untitled event",
    team: read.team ? { key: read.team.key, label: read.team.label } : null,
    kind: note ? "meeting" : "event",
    ...googleWhen(event),
    place: event.location,
    description: null,
    source:
      event.origin === "logistics" || event.origin === "deadline"
        ? event.origin
        : "google",
    version: null,
    meeting: note ? meetingOf(note) : null,
  };
}

/** The entry for a meeting whose event the calendar did not return. */
export function noteEntry(
  note: NoteLike,
  teams: readonly CalendarTeam[],
): CalendarEntry | null {
  if (!note.calendarEventId) return null;
  const day = campDayKey(note.heldAt);
  return {
    id: note.calendarEventId,
    title: note.title,
    team: teamOf(note.team, teams),
    kind: "meeting",
    allDay: false,
    startDay: day,
    endDay: day,
    startTime: meetingTimeKey(note.heldAt),
    endTime: null,
    place: null,
    description: null,
    source: "note",
    version: null,
    meeting: meetingOf(note),
  };
}

/**
 * Everything on the calendar for some days, from its three sources. An event
 * the app made is read from the app (its row is the truth, even before Google
 * has it), so Google's copy of it is skipped. A note names its meeting's
 * event; a note whose event neither source returned (gone from Google, or
 * Google out of reach) still shows, from the note. Sorted by day, all-day
 * first, then by time.
 */
export function mergeCalendar(input: {
  google: readonly CalendarEvent[];
  app: readonly AppEventLike[];
  notes: readonly NoteLike[];
  teams: readonly CalendarTeam[];
}): CalendarEntry[] {
  const noteByEvent = new Map<string, NoteLike>();
  for (const note of input.notes) {
    if (note.calendarEventId) noteByEvent.set(note.calendarEventId, note);
  }
  const entries: CalendarEntry[] = [];
  const seen = new Set<string>();
  for (const row of input.app) {
    seen.add(row.calendarEventId);
    entries.push(
      appEntry(row, noteByEvent.get(row.calendarEventId), input.teams),
    );
  }
  for (const event of input.google) {
    if (seen.has(event.id)) continue;
    // Google's copy of an event the app made, with no live row for these
    // days: removed, or moved, and Google not caught up yet. The row is the
    // truth, so the stale copy is not shown (nor given minutes).
    if (event.origin === "app") continue;
    seen.add(event.id);
    entries.push(googleEntry(event, noteByEvent.get(event.id), input.teams));
  }
  for (const note of input.notes) {
    if (!note.calendarEventId || seen.has(note.calendarEventId)) continue;
    seen.add(note.calendarEventId);
    const entry = noteEntry(note, input.teams);
    if (entry) entries.push(entry);
  }
  return entries.sort(compareEntries);
}

/** By day, then all-day before timed, then by time, then by title. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  return (
    a.startDay.localeCompare(b.startDay) ||
    Number(b.allDay) - Number(a.allDay) ||
    (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
    a.title.localeCompare(b.title)
  );
}

/** The entries the team and type filters keep. */
export function filterEntries(
  entries: readonly CalendarEntry[],
  filter: Pick<CalendarState, "team" | "type">,
): CalendarEntry[] {
  return entries.filter((e) => {
    if (filter.team === WHOLE_CAMP && e.team !== null) return false;
    if (
      filter.team &&
      filter.team !== WHOLE_CAMP &&
      e.team?.key !== filter.team
    )
      return false;
    if (filter.type === "meetings" && e.kind !== "meeting") return false;
    if (filter.type === "events" && e.kind !== "event") return false;
    return true;
  });
}

/** Whether an entry spans more than one day: a bar across the grid. */
export function isMultiDay(entry: CalendarEntry): boolean {
  return entry.endDay > entry.startDay;
}

/** Whether an entry is over: its last day is before today. */
export function isPastEntry(entry: CalendarEntry, today: string): boolean {
  return entry.endDay < today;
}

/**
 * When it is, for people: "Tuesday 6 October 2026, 19:30 to 21:00",
 * "Saturday 3 October 2026, all day", "Sat 3 Oct to Sun 4 Oct, all day".
 */
export function entryWhen(entry: CalendarEntry): string {
  if (entry.allDay) {
    return isMultiDay(entry)
      ? `${shortDayLabel(entry.startDay)} to ${shortDayLabel(entry.endDay)}, all day`
      : `${longDayLabel(entry.startDay)}, all day`;
  }
  const times = entry.endTime
    ? `${entry.startTime} to ${entry.endTime}`
    : (entry.startTime ?? "");
  return isMultiDay(entry)
    ? `${shortDayLabel(entry.startDay)} ${entry.startTime} to ${shortDayLabel(entry.endDay)} ${entry.endTime ?? ""}`.trim()
    : `${longDayLabel(entry.startDay)}, ${times}`;
}

// --- The month grid -------------------------------------------------------------

export interface MonthDay {
  key: string;
  /** Inside the month on screen (not the days around it). */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  /** The day's one-day entries, all-day first, then by time. */
  entries: CalendarEntry[];
  /** Every entry on the day, bars included, for a phone's dots and list. */
  all: CalendarEntry[];
}

export interface MonthBar {
  entry: CalendarEntry;
  /** 1-based columns, Monday 1; `end` is exclusive (a CSS grid line). */
  start: number;
  end: number;
  lane: number;
  /** It began before this week, or runs on past it. */
  fromBefore: boolean;
  toAfter: boolean;
}

export interface MonthWeek {
  days: MonthDay[];
  bars: MonthBar[];
  /** How many bar rows the week needs. */
  lanes: number;
}

/** A month's weeks, Monday first, with the multi-day bars in lanes. */
export function monthWeeks(
  month: string,
  entries: readonly CalendarEntry[],
  today: string,
): MonthWeek[] {
  const { from, to } = monthGridRange(month);
  const weeks: MonthWeek[] = [];
  for (let monday = from; monday <= to; monday = addDays(monday, 7)) {
    const keys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const sunday = keys[6]!;
    const days: MonthDay[] = keys.map((key) => {
      const on = entries.filter((e) => e.startDay <= key && key <= e.endDay);
      return {
        key,
        inMonth: key.slice(0, 7) === month,
        isToday: key === today,
        isPast: key < today,
        entries: on.filter((e) => !isMultiDay(e)).sort(compareEntries),
        all: [...on].sort(compareEntries),
      };
    });
    const spanning = entries
      .filter(
        (e) => isMultiDay(e) && e.startDay <= sunday && e.endDay >= monday,
      )
      .sort(
        (a, b) =>
          a.startDay.localeCompare(b.startDay) ||
          b.endDay.localeCompare(a.endDay),
      );
    // Each bar takes the first lane free from its first day this week.
    const laneEnds: string[] = [];
    const bars: MonthBar[] = spanning.map((entry) => {
      const first = entry.startDay < monday ? monday : entry.startDay;
      const last = entry.endDay > sunday ? sunday : entry.endDay;
      let lane = 0;
      while (laneEnds[lane] !== undefined && laneEnds[lane]! >= first) lane++;
      laneEnds[lane] = last;
      return {
        entry,
        start: keys.indexOf(first) + 1,
        end: keys.indexOf(last) + 2,
        lane,
        fromBefore: entry.startDay < monday,
        toAfter: entry.endDay > sunday,
      };
    });
    weeks.push({ days, bars, lanes: laneEnds.length });
  }
  return weeks;
}

// --- The list -----------------------------------------------------------------

export interface ListGroup {
  /** YYYY-MM. */
  month: string;
  label: string;
  entries: CalendarEntry[];
}

/**
 * The list view: what is coming up (anything not over yet, soonest first) or
 * what has passed (newest first), grouped by the month it starts in.
 */
export function listGroups(
  entries: readonly CalendarEntry[],
  scope: CalendarListScope,
  today: string,
): ListGroup[] {
  const kept = entries
    .filter((e) =>
      scope === "past" ? isPastEntry(e, today) : !isPastEntry(e, today),
    )
    .sort((a, b) =>
      scope === "past" ? compareEntries(b, a) : compareEntries(a, b),
    );
  const groups: ListGroup[] = [];
  for (const entry of kept) {
    const month = entry.startDay.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.month !== month) {
      group = { month, label: monthLabel(month), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** How far the list looks: a year back for Past, a year ahead for Coming up. */
export function listRange(
  scope: CalendarListScope,
  today: string,
): { from: string; to: string } {
  return scope === "past"
    ? { from: addDays(today, -366), to: addDays(today, -1) }
    : { from: today, to: addDays(today, 366) };
}
