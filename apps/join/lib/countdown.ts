// The taskbar's countdown to the Burn, in whole days on the Tankwa Town
// calendar (South African time). Dates go through the platform Date as UTC
// midnights, so there is no hand-rolled calendar maths.

const DAY_MS = 86_400_000;

/** Today's date in South Africa as YYYY-MM-DD. */
export function tankwaToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dayNumber(isoDate: string): number {
  return (
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ) / DAY_MS
  );
}

/**
 * The Burn's dates in words, e.g. "26 April – 2 May 2027". Each day is
 * formatted on its own, not with formatRange, whose spacing differs between
 * ICU versions (and so between the server and a browser).
 */
export function burnDatesLabel(burn: { start: string; end: string }): string {
  const start = new Date(dayNumber(burn.start) * DAY_MS);
  const end = new Date(dayNumber(burn.end) * DAY_MS);
  const format = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: withYear ? "numeric" : undefined,
    }).format(d);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}

export type BurnCountdown =
  | { phase: "before"; days: number }
  | { phase: "during"; day: number }
  | { phase: "after" };

export function burnCountdown(
  today: string,
  burn: { start: string; end: string },
): BurnCountdown {
  const t = dayNumber(today);
  const start = dayNumber(burn.start);
  const end = dayNumber(burn.end);
  if (t < start) return { phase: "before", days: start - t };
  if (t <= end) return { phase: "during", day: t - start + 1 };
  return { phase: "after" };
}

/** The taskbar's words for it. */
export function countdownLabel(c: BurnCountdown): string {
  switch (c.phase) {
    case "before":
      return c.days === 1
        ? "T-1 day to the Burn"
        : `T-${c.days} days to the Burn`;
    case "during":
      return `The Burn · day ${c.day}`;
    case "after":
      return "See you next Burn";
  }
}

/** The same, short enough for a phone's taskbar. */
export function countdownShort(c: BurnCountdown): string {
  switch (c.phase) {
    case "before":
      return `T-${c.days}d`;
    case "during":
      return `Day ${c.day}`;
    case "after":
      return "Burnt";
  }
}
