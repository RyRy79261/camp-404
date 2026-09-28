import { campDayKey } from "@camp404/core";

// The tray's countdown to the Burn (visual-language doc 4.7), in whole camp
// days (CAMP_TIME_ZONE). Dates go through the platform Date as UTC midnights,
// never hand-rolled calendar maths. A plain module: the desktop draws it in
// the browser, once a minute with the clock.

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD date as a whole day number, through a UTC midnight. */
function dayNumber(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
}

/**
 * The countdown's words for `now`, or null when there is nothing to say (no
 * dates set, a bad date, or the Burn is over).
 */
export function burnCountdownLabel(
  now: Date,
  burn: { start: string; end: string } | null,
): string | null {
  if (!burn) return null;
  const today = dayNumber(campDayKey(now));
  const start = dayNumber(burn.start);
  const end = dayNumber(burn.end);
  if (today === null || start === null || end === null) return null;
  if (today < start) {
    const days = start - today;
    return days === 1 ? "1 day to the Burn" : `${days} days to the Burn`;
  }
  if (today <= end) return `The Burn, day ${today - start + 1}`;
  return null;
}

/**
 * The Burn's dates in words, e.g. "26 April – 2 May 2027" (the join site's
 * label). Each day is formatted on its own, not with formatRange, whose
 * spacing differs between ICU versions. Null for a date that does not parse.
 */
export function burnDatesLabel(burn: {
  start: string;
  end: string;
}): string | null {
  const start = dayNumber(burn.start);
  const end = dayNumber(burn.end);
  if (start === null || end === null) return null;
  const format = (day: number, withYear: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: withYear ? "numeric" : undefined,
    }).format(new Date(day * DAY_MS));
  const sameYear =
    new Date(start * DAY_MS).getUTCFullYear() ===
    new Date(end * DAY_MS).getUTCFullYear();
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}
