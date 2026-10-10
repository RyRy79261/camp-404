"use client";

import { cn } from "@camp404/ui/lib/utils";
import {
  isPastEntry,
  monthShortLabel,
  monthWeeks,
  shortDayLabel,
  type CalendarEntry,
} from "@/lib/calendar-month";
import { entryColour, MeetingMark } from "./parts";

// The month (the approved mock-up's desktop grid): Monday first, the days
// around the month dimmed, the past a shade darker, today framed in the main
// colour. An event over several days is one bar across them, in lanes under
// the day numbers; a day's other events are chips (time, the meeting mark,
// the title), as many as fit, then "+N more". Clicking an empty part of a
// day opens the New event form on it, for those who may add.

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** How many rows of bars and chips a day shows before "+N more". */
const ROWS_PER_DAY = 4;

export function MonthGrid({
  month,
  today,
  entries,
  selectedId,
  pickedDay,
  narrow,
  onOpen,
  onNew,
  onMore,
}: {
  month: string;
  today: string;
  entries: CalendarEntry[];
  selectedId: string | null;
  pickedDay: string | null;
  /** The panel is open beside it: the chips drop their times. */
  narrow: boolean;
  onOpen: (id: string) => void;
  onNew?: (day: string) => void;
  onMore: (day: string) => void;
}) {
  const weeks = monthWeeks(month, entries, today);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-month-grid>
      <div
        className="grid grid-cols-7 border border-b-0 border-border bg-card"
        aria-hidden
      >
        {DAY_NAMES.map((d) => (
          <span
            key={d}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col border border-border">
        {weeks.map((week, w) => {
          const fit = Math.max(1, ROWS_PER_DAY - week.lanes);
          return (
            <div
              key={week.days[0]!.key}
              className={cn(
                "relative grid min-h-[5.75rem] flex-1 grid-cols-7",
                w > 0 && "border-t border-border",
              )}
              style={{
                gridTemplateRows: `22px ${week.lanes ? `repeat(${week.lanes}, 22px) ` : ""}minmax(0, 1fr)`,
              }}
            >
              {week.days.map((day, i) => {
                const bg = cn(
                  "relative z-0",
                  i > 0 && "border-l border-border",
                  !day.inMonth
                    ? "bg-[color-mix(in_oklab,var(--color-background)_70%,black)]"
                    : day.isPast &&
                        "bg-[color-mix(in_oklab,var(--color-background)_88%,black)]",
                  day.isToday && "shadow-[inset_0_0_0_2px_var(--color-primary)]",
                  pickedDay === day.key &&
                    "bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-background))]",
                );
                return onNew ? (
                  <button
                    key={`bg-${day.key}`}
                    type="button"
                    aria-label={`New event on ${shortDayLabel(day.key)}`}
                    onClick={() => onNew(day.key)}
                    className={cn(
                      bg,
                      "group text-left hover:bg-[color-mix(in_oklab,var(--color-card)_70%,var(--color-background))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    )}
                    style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  >
                    <span className="absolute right-1.5 top-1 hidden text-[11px] font-semibold text-muted-foreground group-hover:block">
                      + New event
                    </span>
                  </button>
                ) : (
                  <div
                    key={`bg-${day.key}`}
                    className={bg}
                    style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  />
                );
              })}
              {week.days.map((day, i) => (
                <div
                  key={`n-${day.key}`}
                  className={cn(
                    "pointer-events-none z-[1] px-2 pt-[3px] text-[13px] font-semibold leading-[18px]",
                    !day.inMonth
                      ? "text-muted-foreground/60"
                      : day.isPast
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                  style={{ gridColumn: i + 1, gridRow: 1 }}
                >
                  <span
                    className={cn(
                      day.isToday &&
                        "inline-block min-w-[22px] bg-primary px-1 text-center text-primary-foreground",
                    )}
                  >
                    {day.key.endsWith("-01")
                      ? `${monthShortLabel(day.key)} ${Number(day.key.slice(8))}`
                      : Number(day.key.slice(8))}
                  </span>
                </div>
              ))}
              {week.bars.map((bar) => (
                <button
                  key={`bar-${bar.entry.id}`}
                  type="button"
                  onClick={() => onOpen(bar.entry.id)}
                  aria-label={barLabel(bar.entry)}
                  title={bar.entry.title}
                  className={cn(
                    "z-[1] mx-1 my-px flex h-5 items-center gap-1.5 overflow-hidden whitespace-nowrap px-2 text-left text-xs font-semibold leading-5 text-foreground",
                    bar.fromBefore && "ml-0 pl-1.5",
                    bar.toAfter && "mr-0",
                    isPastEntry(bar.entry, today) && "opacity-70",
                    selectedId === bar.entry.id &&
                      "opacity-100 outline-2 -outline-offset-1 outline-foreground",
                  )}
                  style={{
                    gridColumn: `${bar.start} / ${bar.end}`,
                    gridRow: bar.lane + 2,
                    background: `color-mix(in oklab, ${entryColour(bar.entry)} 55%, var(--color-background))`,
                  }}
                >
                  <span className="truncate">
                    {bar.fromBefore ? "← " : ""}
                    {bar.entry.title}
                  </span>
                </button>
              ))}
              {week.days.map((day, i) => {
                const show =
                  day.entries.length > fit
                    ? day.entries.slice(0, fit - 1)
                    : day.entries;
                const more = day.entries.length - show.length;
                return (
                  <div
                    key={`c-${day.key}`}
                    className="pointer-events-none z-[1] flex min-w-0 flex-col gap-0.5 overflow-hidden px-1 pt-0.5"
                    style={{ gridColumn: i + 1, gridRow: week.lanes + 2 }}
                  >
                    {show.map((entry) => (
                      <Chip
                        key={entry.id}
                        entry={entry}
                        past={isPastEntry(entry, today)}
                        selected={selectedId === entry.id}
                        showTime={!narrow}
                        onOpen={onOpen}
                      />
                    ))}
                    {more > 0 ? (
                      <button
                        type="button"
                        onClick={() => onMore(day.key)}
                        className="pointer-events-auto px-1.5 text-left text-xs font-semibold leading-[18px] text-muted-foreground hover:text-foreground"
                      >
                        +{more} more
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Legend canAdd={onNew !== undefined} />
    </div>
  );
}

function barLabel(entry: CalendarEntry): string {
  return `${entry.title}, ${shortDayLabel(entry.startDay)} to ${shortDayLabel(entry.endDay)}`;
}

/** What a chip says to assistive tech: the title, the time, a meeting's state. */
export function chipLabel(entry: CalendarEntry): string {
  const parts = [entry.title, entry.allDay ? "all day" : entry.startTime];
  if (entry.meeting) {
    parts.push(entry.meeting.minutes ? "meeting, minutes written" : "meeting");
  }
  return parts.filter(Boolean).join(", ");
}

function Chip({
  entry,
  past,
  selected,
  showTime,
  onOpen,
}: {
  entry: CalendarEntry;
  past: boolean;
  selected: boolean;
  showTime: boolean;
  onOpen: (id: string) => void;
}) {
  const colour = entryColour(entry);
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      aria-label={chipLabel(entry)}
      title={entry.title}
      data-calendar-chip
      className={cn(
        "pointer-events-auto flex h-5 min-w-0 items-center gap-[5px] whitespace-nowrap border-0 border-l-[3px] pl-[5px] pr-1.5 text-left text-xs font-medium leading-5 text-foreground",
        past && "opacity-80",
        selected &&
          "opacity-100 outline-2 -outline-offset-1 outline-foreground",
      )}
      style={{
        borderLeftColor: colour,
        background: `color-mix(in oklab, ${colour} 18%, var(--color-background))`,
      }}
    >
      {showTime && !entry.allDay ? (
        <b className="shrink-0 font-semibold tabular-nums text-muted-foreground">
          {entry.startTime}
        </b>
      ) : null}
      {entry.meeting ? (
        <span className="flex shrink-0" style={{ color: colour }}>
          <MeetingMark written={entry.meeting.minutes} />
        </span>
      ) : null}
      <span className="min-w-0 truncate">{entry.title}</span>
    </button>
  );
}

function Legend({ canAdd }: { canAdd: boolean }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <MeetingMark written className="text-foreground" />
        Meeting, minutes written
      </span>
      <span className="inline-flex items-center gap-1.5">
        <MeetingMark written={false} className="text-foreground" />
        Meeting, no minutes yet
      </span>
      {canAdd ? <span>Click an empty day to add an event on it.</span> : null}
    </p>
  );
}
