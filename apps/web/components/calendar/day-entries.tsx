"use client";

import { Plus } from "lucide-react";
import type { CalendarEntry } from "@/lib/calendar-month";
import { entryColour, MeetingMark, SMALL_BUTTON } from "./parts";

// One day's events as rows (the mock-up's day list): the time, the title, the
// team and, for a meeting, whether its minutes are written. Under a phone's
// month, and in the panel for a crowded day's "+N more".

export function DayEntries({
  day,
  entries,
  onOpen,
  onNew,
}: {
  day: string;
  entries: readonly CalendarEntry[];
  onOpen: (id: string) => void;
  onNew?: (day: string) => void;
}) {
  const on = entries.filter((e) => e.startDay <= day && day <= e.endDay);
  if (on.length === 0) {
    return (
      <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
        Nothing on this day.
        {onNew ? (
          <div className="mt-3">
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => onNew(day)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New event
            </button>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Events on this day">
      {on.map((entry) => {
        const colour = entryColour(entry);
        const what = [
          entry.team?.label ?? "Whole camp",
          entry.meeting
            ? entry.meeting.minutes
              ? "Meeting, minutes written"
              : "Meeting"
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onOpen(entry.id)}
              className="grid w-full grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-2.5 border border-l-[3px] border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))] px-3 py-2.5 text-left hover:border-primary"
              style={{ borderLeftColor: colour }}
            >
              <span className="text-[13px] font-semibold tabular-nums">
                {entry.allDay || entry.startDay < day
                  ? "All day"
                  : entry.startTime}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {entry.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {what}
                </span>
              </span>
              <span style={{ color: colour }} className="flex justify-end">
                {entry.meeting ? (
                  <MeetingMark written={entry.meeting.minutes} />
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
