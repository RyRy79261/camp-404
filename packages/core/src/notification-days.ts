// Day headings for the notification inbox: "Today", "Yesterday", then the date.
//
// Days are camp days (CAMP_TIME_ZONE), not the server's: Vercel runs in UTC, so
// a notice sent at 01:00 in Cape Town would otherwise sit under yesterday.
// No date arithmetic by hand: the calendar day comes from Intl in the camp's
// zone, and "the day before" is a UTC round-trip on that calendar date.

import { CAMP_TIME_ZONE } from "./time-zone";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

const SAME_YEAR = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

const OTHER_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

/** The camp calendar day an instant falls on, as YYYY-MM-DD. */
export function campDayKey(instant: Date): string {
  return DAY_KEY.format(instant);
}

/**
 * The instant a camp day starts. A deadline is a day, typed as YYYY-MM-DD;
 * storing the start of that day in Johannesburg keeps its `campDayKey` equal to
 * the day that was typed. Johannesburg is UTC+2 all year (South Africa has no
 * daylight saving), so the offset is fixed.
 */
export function campDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+02:00`);
}

/** The calendar day after a YYYY-MM-DD key (UTC round-trip, no month maths). */
export function nextCampDay(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** The calendar day before a YYYY-MM-DD key. */
function dayBefore(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export interface DayGroup<T> {
  /** The camp day, YYYY-MM-DD. */
  key: string;
  /** "Today", "Yesterday", "Mon 14 Sept", or "31 Dec 2025" in another year. */
  label: string;
  items: T[];
}

/**
 * Group notifications under their camp day.
 *
 * PRECONDITION: `items` are newest first, as listInbox returns them. This does
 * not sort. Unsorted input would split one day into several groups.
 */
export function groupByDay<T extends { createdAt: Date }>(
  items: readonly T[],
  now: Date,
): DayGroup<T>[] {
  const today = campDayKey(now);
  const yesterday = dayBefore(today);
  const thisYear = today.slice(0, 4);

  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = campDayKey(item.createdAt);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.items.push(item);
      continue;
    }
    const label =
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : key.slice(0, 4) === thisYear
            ? SAME_YEAR.format(item.createdAt)
            : OTHER_YEAR.format(item.createdAt);
    groups.push({ key, label, items: [item] });
  }
  return groups;
}
