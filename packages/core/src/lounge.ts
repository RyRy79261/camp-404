import {
  LOUNGE_BANDS,
  MAX_LOUNGE_DAYS,
  ViewerRank,
  type LoungeBand,
} from "@camp404/types";
import { campDayKey } from "./notification-days";

// The lounge programme (#269). Pure: no DB, no session, no next/*.
//
// WHO MAY RUN IT. Clearance stays global (AGENTS.md): a lead of ANY team stands
// on the `team_lead` rung everywhere. Team identity decides only who may act
// HERE: a captain, or a lead of the Ministry of Vibes (owner, 2026-09-27: "a
// lead of that team or a captain"), decides offers, places them and writes the
// music note. Any approved member offers something and reads the programme;
// a member changes only their own offers. It fails closed on a rank this
// module does not know. The write re-reads the actor's rank and led teams
// inside its own transaction and passes those here; it never takes a team list
// from the caller.
//
// TIME. Camp time (CAMP_TIME_ZONE, UTC+2 all year). A programme day runs from
// 06:00 to 06:00 the next morning, like the whiteboard: a set at 02:00 on day
// 3 is the night of day 3. Days are numbers counted from 1; the Burn's dates,
// when set, only label them.

/** The team whose leads run the lounge programme. */
export const LOUNGE_TEAM = "ministry_of_vibes";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may decide offers, place them in the programme and set the
 * music note: a captain, or a lead of the Ministry of Vibes this year.
 * `ledTeams` are the team keys they lead this year.
 */
export function canRunLounge(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(LOUNGE_TEAM);
  return false;
}

// --- Time ----------------------------------------------------------------------

const DAY_MINUTES = 24 * 60;
/** The programme day starts here, in minutes after midnight. */
export const PROGRAMME_DAY_START = 6 * 60;
const BAND_MINUTES = 4 * 60;

/** Minutes since the programme day began (06:00 is 0, 05:45 is 1425). */
export function programmeMinute(startMinute: number): number {
  return (
    (((startMinute - PROGRAMME_DAY_START) % DAY_MINUTES) + DAY_MINUTES) %
    DAY_MINUTES
  );
}

/** The time band a start time falls in. */
export function bandOf(startMinute: number): LoungeBand {
  const index = Math.floor(programmeMinute(startMinute) / BAND_MINUTES);
  return LOUNGE_BANDS[Math.min(index, LOUNGE_BANDS.length - 1)]!;
}

/** A band's hours, as clock minutes: morning is 360 to 600. */
export function bandRange(band: LoungeBand): { from: number; to: number } {
  const from =
    (PROGRAMME_DAY_START + LOUNGE_BANDS.indexOf(band) * BAND_MINUTES) %
    DAY_MINUTES;
  return { from, to: (from + BAND_MINUTES) % DAY_MINUTES };
}

/** A clock time as "HH:MM" (24-hour), from minutes after midnight. */
export function clockText(minute: number): string {
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** A length as "45 min", "2 h" or "1 h 30 min". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// --- Days ----------------------------------------------------------------------

/** The programme's days when the Burn's dates are not set. */
export const DEFAULT_LOUNGE_DAYS = 8;

export interface LoungeDay {
  day: number;
  /** YYYY-MM-DD, or null when the Burn's dates are not set. */
  date: string | null;
  /** "Day 3", or "Day 3 · Wed 29 Apr" when the date is known. */
  label: string;
  /** "Day 3" or "Wed 29 Apr": the short form for a grid's column. */
  short: string;
}

const DAY_MS = 86_400_000;

function utcDay(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
}

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // The value is a UTC midnight standing for a calendar day, so it is read in
  // UTC; the day it names is already a camp day.
  timeZone: "UTC",
});

/**
 * The programme's days: one per day of the Burn when its dates are set (at
 * most MAX_LOUNGE_DAYS), else DEFAULT_LOUNGE_DAYS numbered days.
 */
export function loungeDays(
  burn: { start: string; end: string } | null,
): LoungeDay[] {
  const start = burn ? utcDay(burn.start) : null;
  const end = burn ? utcDay(burn.end) : null;
  if (start === null || end === null || end < start) {
    return Array.from({ length: DEFAULT_LOUNGE_DAYS }, (_, i) => ({
      day: i + 1,
      date: null,
      label: `Day ${i + 1}`,
      short: `Day ${i + 1}`,
    }));
  }
  const count = Math.min(end - start + 1, MAX_LOUNGE_DAYS);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date((start + i) * DAY_MS);
    const date = at.toISOString().slice(0, 10);
    const words = DATE_LABEL.format(at);
    return { day: i + 1, date, label: `Day ${i + 1} · ${words}`, short: words };
  });
}

/**
 * Which programme day `now` is in, or null outside the Burn (or with no
 * dates). Before 06:00 it is still the night of the day before.
 */
export function loungeDayOf(
  now: Date,
  days: readonly LoungeDay[],
): number | null {
  const shifted = new Date(now.getTime() - PROGRAMME_DAY_START * 60_000);
  const key = campDayKey(shifted);
  return days.find((d) => d.date === key)?.day ?? null;
}

// --- The grid and its warnings ---------------------------------------------------

/** One placed item, as far as the grid and its warnings need it. */
export interface PlacedItem {
  id: string;
  day: number;
  startMinute: number;
  durationMinutes: number;
  hostId: string | null;
}

/** An item's start and end on one timeline across every day, in minutes. */
function span(item: PlacedItem): { from: number; to: number } {
  const from = (item.day - 1) * DAY_MINUTES + programmeMinute(item.startMinute);
  return { from, to: from + item.durationMinutes };
}

/** Programme order: by day, then from 06:00 onwards. */
export function compareByProgramme(a: PlacedItem, b: PlacedItem): number {
  return span(a).from - span(b).from;
}

/**
 * The items each item overlaps in the lounge, by id. The lounge is one space,
 * so two things at once is a clash to look at; an item running past 06:00
 * overlaps the next day's morning.
 */
export function loungeOverlaps(
  items: readonly PlacedItem[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const sorted = [...items].sort(compareByProgramme);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const aSpan = span(a);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const bSpan = span(b);
      if (bSpan.from >= aSpan.to) break;
      out.set(a.id, [...(out.get(a.id) ?? []), b.id]);
      out.set(b.id, [...(out.get(b.id) ?? []), a.id]);
    }
  }
  return out;
}

/**
 * Whether a placement is outside what the host asked for: not on a day they
 * ticked, or not in a time band they ticked. No ticks means any.
 */
export function outsidePreferences(
  offer: {
    preferredDays: readonly number[];
    preferredBands: readonly LoungeBand[];
  },
  placement: { day: number; startMinute: number },
): { day: boolean; band: boolean } {
  return {
    day:
      offer.preferredDays.length > 0 &&
      !offer.preferredDays.includes(placement.day),
    band:
      offer.preferredBands.length > 0 &&
      !offer.preferredBands.includes(bandOf(placement.startMinute)),
  };
}

/** The grid: each day's items in each band, in programme order. */
export function programmeGrid<T extends PlacedItem>(
  items: readonly T[],
  days: readonly LoungeDay[],
): Map<string, T[]> {
  const cells = new Map<string, T[]>();
  for (const item of [...items].sort(compareByProgramme)) {
    if (!days.some((d) => d.day === item.day)) continue;
    const key = cellKey(item.day, bandOf(item.startMinute));
    cells.set(key, [...(cells.get(key) ?? []), item]);
  }
  return cells;
}

/** The key of one grid cell. */
export function cellKey(day: number, band: LoungeBand): string {
  return `${day}:${band}`;
}
