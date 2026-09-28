import { dayLabel } from "./power";
import { campDayKey } from "./notification-days";
import { CAMP_TIME_ZONE } from "./time-zone";

// Fuel on site (#255): the stock in the cans, the refuelling log, and what
// they say about the days of fuel left. Pure: no DB, no session, no next/*.
//
// THE LOG IS APPEND-ONLY. Nothing edits an entry. A correction is a new entry
// that names the one it replaces (`correctsEntryId`); a strike-out is a new
// entry that names it with `voided` set. The log that counts is every entry
// nothing has replaced, less the strike-outs.
//
// THE RATE. The generator's tank is filled when it runs low, so the litres
// put in at a refuelling are the litres burned since the one before. Over two
// or more refuellings: the litres of all but the first, over the hours from
// the first to the last. The recent rate looks at the last 48 hours of the
// log; a shorter log uses all of it.

/** One entry of the refuelling log, as the maths needs it. */
export interface RefuelEntry {
  id: string;
  refuelledAt: Date;
  litres: number;
  /** The earlier entry this one replaces or strikes out. */
  correctsEntryId: string | null;
  /** A strike-out: the entry it names never happened. */
  voided: boolean;
}

/**
 * The entries that count, oldest first: none that a later entry replaced or
 * struck out, and no strike-outs themselves.
 */
export function effectiveRefuels<T extends RefuelEntry>(
  entries: readonly T[],
): T[] {
  const replaced = new Set(
    entries
      .map((e) => e.correctsEntryId)
      .filter((id): id is string => id !== null),
  );
  return entries
    .filter((e) => !e.voided && !replaced.has(e.id))
    .sort((a, b) => a.refuelledAt.getTime() - b.refuelledAt.getTime());
}

/** The hours the recent rate looks back over. */
export const RECENT_RATE_HOURS = 48;

const HOUR_MS = 3_600_000;

export interface BurnRate {
  litresPerDay: number;
  /** How many refuellings the rate was worked out from. */
  refuels: number;
  /** The hours from the first of them to the last. */
  hours: number;
}

/**
 * Litres a day, from the log: the litres of every refuelling after the first,
 * over the hours from the first to the last. Only the last `windowHours` of
 * the log count, unless that leaves fewer than two refuellings. Null with
 * fewer than two, or when they share one moment.
 */
export function burnRate(
  entries: readonly RefuelEntry[],
  windowHours: number = RECENT_RATE_HOURS,
): BurnRate | null {
  const log = effectiveRefuels(entries);
  if (log.length < 2) return null;
  const last = log[log.length - 1]!.refuelledAt.getTime();
  const start = last - windowHours * HOUR_MS;
  const recent = log.filter((e) => e.refuelledAt.getTime() >= start);
  const used = recent.length >= 2 ? recent : log;
  const hours = (last - used[0]!.refuelledAt.getTime()) / HOUR_MS;
  if (hours <= 0) return null;
  const litres = used.slice(1).reduce((sum, e) => sum + e.litres, 0);
  return { litresPerDay: (litres / hours) * 24, refuels: used.length, hours };
}

/** Days the fuel on hand lasts at a rate; null when nothing is being used. */
export function daysOfFuelLeft(
  onHandLitres: number,
  litresPerDay: number,
): number | null {
  if (!(litresPerDay > 0)) return null;
  return Math.max(0, onHandLitres) / litresPerDay;
}

/**
 * The days of the burn still to come, today counted whole: the days on site
 * from today's day number to the last. Before day 1 it is every day, after
 * the last it is 0. Null when the plan has no date for day 1.
 */
export function remainingBurnDays(
  firstPoweredDay: string | null,
  daysOnSite: number,
  now: Date,
): number | null {
  if (!firstPoweredDay) return null;
  const today = campDayKey(now);
  for (let day = 1; day <= daysOnSite; day++) {
    if (dayLabel(firstPoweredDay, day) === today) return daysOnSite - day + 1;
  }
  return today < firstPoweredDay ? daysOnSite : 0;
}

/**
 * Whether the fuel left is running low: it covers fewer than `thresholdDays`,
 * or fewer than the days still to come when that is less. A threshold of 0
 * turns the warning off; with no rate there is nothing to warn of.
 */
export function lowFuelWarning(input: {
  daysLeft: number | null;
  thresholdDays: number;
  remainingDays: number | null;
}): boolean {
  const { daysLeft, thresholdDays, remainingDays } = input;
  if (daysLeft === null || thresholdDays <= 0) return false;
  const need =
    remainingDays === null
      ? thresholdDays
      : Math.min(thresholdDays, remainingDays);
  return need > 0 && daysLeft < need;
}

/** The litres put in on each camp day (YYYY-MM-DD), from the log that counts. */
export function litresByCampDay(
  entries: readonly RefuelEntry[],
): Map<string, number> {
  const days = new Map<string, number>();
  for (const e of effectiveRefuels(entries)) {
    const key = campDayKey(e.refuelledAt);
    days.set(key, (days.get(key) ?? 0) + e.litres);
  }
  return days;
}

export interface ActualAgainstEstimateRow {
  /** "Day 3" or the date; the date is YYYY-MM-DD. */
  label: string;
  /** The day on site, or null for a date outside the powered days. */
  day: number | null;
  /** Litres the fuel estimate expected that day; null outside the plan. */
  estimate: number | null;
  /** Litres put in that day. */
  actual: number;
}

/**
 * Each powered day's estimate beside the litres put in that day. With a date
 * for day 1, the days line up by date, and a refuelling on a date outside the
 * powered days gets a row of its own. Without one there is nothing to line
 * the estimate up with, so the rows are the dates of the log alone.
 */
export function actualAgainstEstimate(input: {
  entries: readonly RefuelEntry[];
  estimate: readonly { day: number; litres: number }[];
  firstPoweredDay: string | null;
}): ActualAgainstEstimateRow[] {
  const byDay = litresByCampDay(input.entries);
  if (!input.firstPoweredDay) {
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, litres]) => ({
        label: date,
        day: null,
        estimate: null,
        actual: litres,
      }));
  }
  const first = input.firstPoweredDay;
  const rows: ActualAgainstEstimateRow[] = input.estimate.map((d) => {
    const date = dayLabel(first, d.day);
    const actual = byDay.get(date) ?? 0;
    byDay.delete(date);
    return { label: date, day: d.day, estimate: d.litres, actual };
  });
  for (const [date, litres] of byDay) {
    rows.push({ label: date, day: null, estimate: null, actual: litres });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * A camp-local day and time, YYYY-MM-DDTHH:MM, as the instant it names.
 * Johannesburg is UTC+2 all year (no daylight saving), as campDayStart holds.
 */
export function campLocalInstant(local: string): Date {
  return new Date(`${local}:00+02:00`);
}

const LOCAL_PARTS = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: CAMP_TIME_ZONE,
});

/** An instant as the datetime field shows it in camp time: YYYY-MM-DDTHH:MM. */
export function campLocalText(instant: Date): string {
  const parts = Object.fromEntries(
    LOCAL_PARTS.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
