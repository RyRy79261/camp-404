import type { ArrivalDayCount } from "@camp404/core";

// How many people arrive on each day (#271): counts only, never who. The same
// list on the layout page and the neighbour page: the total first, then a bar
// per day, drawn with plain boxes (no chart library, nothing animated).

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
  overDays = false,
}: {
  arrivals: readonly ArrivalDayCount[];
  /** What to say when nobody has given a day yet. */
  empty: string;
  /** "45 people arriving over 5 days" rather than "45 people arriving". */
  overDays?: boolean;
}) {
  if (arrivals.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const most = Math.max(...arrivals.map((a) => a.count));
  const total = arrivals.reduce((sum, a) => sum + a.count, 0);
  const days = arrivals.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        <b className="mr-1 text-2xl font-semibold tabular-nums text-foreground">
          {total}
        </b>
        {total === 1 ? "person" : "people"} arriving
        {overDays ? ` over ${days} day${days === 1 ? "" : "s"}` : ""}
      </p>
      <ul aria-label="Arrivals by day" className="flex flex-col gap-2">
        {arrivals.map((a) => (
          <li
            key={a.day}
            className="grid grid-cols-[5.25rem_minmax(0,1fr)_1.5rem] items-center gap-3 text-[13px]"
          >
            <span className="tabular-nums">{arrivalDayLabel(a.day)}</span>
            <span aria-hidden className="h-2 bg-muted">
              <span
                className="block h-full bg-primary"
                style={{ width: `${Math.max(4, (a.count / most) * 100)}%` }}
              />
            </span>
            <b className="text-right font-semibold tabular-nums">
              {a.count}
              <span className="sr-only">
                {a.count === 1 ? " person" : " people"}
              </span>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
