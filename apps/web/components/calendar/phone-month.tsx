"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import {
  isMultiDay,
  longDayLabel,
  monthWeeks,
  type CalendarEntry,
} from "@/lib/calendar-month";
import { DayEntries } from "./day-entries";
import { entryColour, SMALL_BUTTON } from "./parts";

// The month in a narrow window or on a phone (the mock-up's phone grid): a
// square a day with up to three dots (round for an event, square for a
// meeting) and a bar under a day of a longer event, then the picked day's
// events as rows. Picking a day is only this screen's choice, not a link.

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function PhoneMonth({
  month,
  today,
  entries,
  onOpen,
  onNew,
}: {
  month: string;
  today: string;
  entries: CalendarEntry[];
  onOpen: (id: string) => void;
  onNew?: (day: string) => void;
}) {
  const [day, setDay] = React.useState(
    today.slice(0, 7) === month ? today : `${month}-01`,
  );
  const weeks = monthWeeks(month, entries, today);
  return (
    <div data-phone-month>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold leading-5 text-muted-foreground" aria-hidden>
        {DAY_LETTERS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-border">
        {weeks.flatMap((week) =>
          week.days.map((d) => {
            const span = d.all.find(isMultiDay);
            const dots = d.entries.slice(0, 3);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDay(d.key)}
                aria-pressed={day === d.key}
                aria-label={`${longDayLabel(d.key)}, ${d.all.length} ${d.all.length === 1 ? "event" : "events"}`}
                className={cn(
                  "relative flex h-12 flex-col items-center gap-1 border-b border-r border-border pt-1 text-[13px] font-semibold",
                  !d.inMonth &&
                    "bg-[color-mix(in_oklab,var(--color-background)_70%,black)] text-muted-foreground/60",
                  d.inMonth && d.isPast && "text-muted-foreground",
                  day === d.key && "shadow-[inset_0_0_0_2px_var(--color-foreground)]",
                )}
              >
                <span
                  className={cn(
                    d.isToday && "bg-primary px-1.5 text-primary-foreground",
                  )}
                >
                  {Number(d.key.slice(8))}
                </span>
                <span className="flex h-1.5 gap-[3px]" aria-hidden>
                  {dots.map((e) => (
                    <i
                      key={e.id}
                      className={cn(
                        "block h-1.5 w-1.5",
                        e.kind === "meeting" ? "" : "rounded-full",
                      )}
                      style={{ background: entryColour(e) }}
                    />
                  ))}
                </span>
                {span ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-[3px] h-[3px]"
                    style={{ background: entryColour(span) }}
                  />
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      <div className="mb-2 mt-4 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{longDayLabel(day)}</h3>
        {onNew ? (
          <button
            type="button"
            className={SMALL_BUTTON}
            onClick={() => onNew(day)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New
          </button>
        ) : null}
      </div>
      <DayEntries day={day} entries={entries} onOpen={onOpen} />
      <p className="mt-3 text-xs text-muted-foreground">
        Round dot: event. Square dot: meeting. A bar under the day: a day of a
        longer event.
      </p>
    </div>
  );
}
