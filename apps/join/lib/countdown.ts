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
