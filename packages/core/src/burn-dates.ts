// The Burn's dates for a countdown and a label, shared by the console's tray
// and the join site's taskbar. Days are camp days (campDayKey, CAMP_TIME_ZONE)
// as YYYY-MM-DD, turned into whole day numbers through the platform Date at
// UTC midnight: no hand-rolled calendar maths.

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD date as a whole day number, or null when it does not parse. */
function dayNumber(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
}

/** Where a camp day stands against the Burn. */
export type BurnPhase =
  | { phase: "before"; days: number }
  | { phase: "during"; day: number }
  | { phase: "after" };

/**
 * Where `today` (a camp day, YYYY-MM-DD) stands against the Burn: whole days
 * to the first day, which day of it, or over. Null when a date does not parse.
 */
export function burnPhase(
  today: string,
  burn: { start: string; end: string },
): BurnPhase | null {
  const t = dayNumber(today);
  const start = dayNumber(burn.start);
  const end = dayNumber(burn.end);
  if (t === null || start === null || end === null) return null;
  if (t < start) return { phase: "before", days: start - t };
  if (t <= end) return { phase: "during", day: t - start + 1 };
  return { phase: "after" };
}

/**
 * The Burn's dates in words, e.g. "26 April – 2 May 2027". Each day is
 * formatted on its own, not with formatRange, whose spacing differs between
 * ICU versions (and so between the server and a browser). Null for a date that
 * does not parse.
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
