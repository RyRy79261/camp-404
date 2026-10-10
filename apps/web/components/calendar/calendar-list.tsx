"use client";

import { cn } from "@camp404/ui/lib/utils";
import {
  listGroups,
  weekdayLabel,
  type CalendarEntry,
  type CalendarListScope,
} from "@/lib/calendar-month";
import { MeetingBadge, TeamBadge } from "./parts";

// The list (the mock-up's List view, where the old Meetings program's list
// lives on): Coming up (soonest first) or Past (newest first), grouped by
// month. A meeting says what it decided and how its action items stand; one
// that has passed with no minutes says so.

export function CalendarList({
  entries,
  scope,
  today,
  selectedId,
  onOpen,
}: {
  entries: CalendarEntry[];
  scope: CalendarListScope;
  today: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const groups = listGroups(entries, scope, today);
  if (groups.length === 0) {
    return (
      <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {scope === "past"
          ? "Nothing on the calendar in the past year."
          : "Nothing coming up on the calendar."}
      </p>
    );
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto border border-border max-md:-mx-4 max-md:border-x-0"
      data-calendar-list
    >
      {groups.map((group) => (
        <section key={group.month} aria-label={group.label}>
          <h3 className="sticky top-0 z-[1] border-b border-border bg-card px-4 py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">
            {group.label}
          </h3>
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <Row
                  entry={entry}
                  past={scope === "past"}
                  selected={selectedId === entry.id}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({
  entry,
  past,
  selected,
  onOpen,
}: {
  entry: CalendarEntry;
  past: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const m = entry.meeting;
  const times = entry.allDay
    ? "All day"
    : entry.endTime
      ? `${entry.startTime} to ${entry.endTime}`
      : (entry.startTime ?? "");
  const detail: React.ReactNode =
    m && m.firstDecision ? (
      <>
        Decided:{" "}
        <b className="font-medium text-foreground">{m.firstDecision}</b>
      </>
    ) : (
      [times, entry.place].filter(Boolean).join(" · ")
    );
  const counts: React.ReactNode = m?.minutes ? (
    <>
      <b className="font-semibold text-foreground">{m.decisions}</b>{" "}
      {m.decisions === 1 ? "decision" : "decisions"}
      <br />
      <b className="font-semibold text-foreground">{m.actionItems}</b>{" "}
      {m.actionItems === 1 ? "action item" : "action items"} ·{" "}
      {m.openActionItems} open
    </>
  ) : m && past ? (
    "No minutes yet"
  ) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      aria-current={selected || undefined}
      className={cn(
        "grid w-full grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 border-b border-border px-3 py-3 text-left hover:bg-[color-mix(in_oklab,var(--color-card)_60%,var(--color-background))] page-md:grid-cols-[4rem_minmax(0,1fr)_9.5rem] page-md:gap-4 page-md:px-4 page-md:py-3.5",
        selected &&
          "bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_24%,var(--color-card)))] shadow-[inset_3px_0_0_var(--color-primary)]",
      )}
    >
      <span className="flex flex-col leading-[18px]">
        <b className="text-xl font-bold leading-[26px]">
          {Number(entry.startDay.slice(8))}
        </b>
        <span className="text-xs text-muted-foreground">
          {weekdayLabel(entry.startDay)}
        </span>
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-[22px]">
          {entry.title}
          {m ? <MeetingBadge /> : null}
          <TeamBadge entry={entry} />
        </span>
        {detail ? (
          <span className="mt-1 block text-[13px] leading-5 text-muted-foreground page-md:truncate">
            {detail}
          </span>
        ) : null}
      </span>
      {counts ? (
        <span className="col-start-2 text-[13px] leading-5 text-muted-foreground page-md:col-start-3 page-md:row-start-1 page-md:text-right">
          {counts}
        </span>
      ) : null}
    </button>
  );
}
