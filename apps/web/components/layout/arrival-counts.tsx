import type { ArrivalDayCount } from "@camp404/core";

// How many people arrive on each day (#271): counts only, never who. The same
// list on the layout page and the neighbour page. A bar per day, drawn with
// plain boxes (no chart library, nothing animated).

const DAY = new Intl.DateTimeFormat("en-ZA", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Fri 23 Apr" for a YYYY-MM-DD day, read as the calendar day itself. */
export function arrivalDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : DAY.format(date).replace(",", "");
}

export function ArrivalCounts({
  arrivals,
  empty,
}: {
  arrivals: readonly ArrivalDayCount[];
  /** What to say when nobody has given a day yet. */
  empty: string;
}) {
  if (arrivals.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const most = Math.max(...arrivals.map((a) => a.count));
  const total = arrivals.reduce((sum, a) => sum + a.count, 0);
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Arrivals by day" className="flex flex-col gap-1.5">
        {arrivals.map((a) => (
          <li
            key={a.day}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm"
          >
            <span className="tabular-nums text-muted-foreground">
              {arrivalDayLabel(a.day)}
            </span>
            <span aria-hidden className="h-2.5 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-accent/70"
                style={{ width: `${Math.max(4, (a.count / most) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              {a.count}
              <span className="sr-only">
                {a.count === 1 ? " person" : " people"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "person has" : "people have"} given an arrival
        day.
      </p>
    </div>
  );
}
