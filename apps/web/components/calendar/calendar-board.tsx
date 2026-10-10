"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { FilterToggle } from "@/components/kitchen/kit";
import {
  addMonths,
  calendarHref,
  longDayLabel,
  monthLabel,
  WHOLE_CAMP,
  type CalendarEntry,
  type CalendarState,
  type CalendarTypeFilter,
} from "@/lib/calendar-month";
import type { MeetingNote } from "@/lib/meeting-notes";
import { CalendarList } from "./calendar-list";
import { DayEntries } from "./day-entries";
import { EventDetail } from "./event-detail";
import { EventForm, type EventFormTeams } from "./event-form";
import { MonthGrid } from "./month-grid";
import { PhoneMonth } from "./phone-month";
import {
  PANEL_FRAME,
  PANEL_SCROLL,
  PIXEL_HEADING,
  QUIET_BUTTON,
  SMALL_BUTTON,
} from "./parts";

// The Calendar program's body (owner, 2026-10-10, the approved mock-up
// calendar-meetings.html): the toolbar, the month or the list, and the open
// event (or the New event form, or a day's events) beside it. Everything a
// link should say lives in the URL: each change here is a router.replace to
// the new state's link (lib/calendar-month.ts calendarHref), which the
// server draws. Never a prefetch.
//
// Laid out by the WINDOW's width (page-*), never a screen check: below
// page-md the month is the phone's compact grid with the day's events under
// it; in a window under 56rem the panel sits above the calendar instead of
// beside it (beside, the month keeps about 70px a day);
// on a phone's screen (below md) it is a full-screen sheet.

export interface SelectedEvent {
  entry: CalendarEntry;
  note: MeetingNote | null;
  canEditEvent: boolean;
  canWriteMinutes: boolean;
  canMakeTasks: boolean;
}

export interface CalendarBoardProps {
  state: CalendarState;
  today: string;
  entries: CalendarEntry[];
  readStatus: "ok" | "not_configured" | "unavailable";
  /** The URL names an event nobody could find. */
  eventMissing: boolean;
  selected: SelectedEvent | null;
  teamOptions: { value: string; label: string }[];
  /** What the New event form may offer; null for someone who cannot add. */
  form: EventFormTeams | null;
}

const READ_NOTE = {
  not_configured:
    "The camp's Google Calendar isn't connected yet, so only the events made here show. A captain can connect it under System status.",
  unavailable:
    "Couldn't reach the camp's Google Calendar just now, so only the events made here show. Try again shortly.",
} as const;

const ALL_TEAMS = "__all__";

export function CalendarBoard(props: CalendarBoardProps) {
  const { state, today, entries, selected, form } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // The event being changed, in the panel (not a link: a form is not shared).
  const [editing, setEditing] = React.useState<CalendarEntry | null>(null);
  // "+2 more" on a crowded day lists that day in the panel.
  const [dayPanel, setDayPanel] = React.useState<string | null>(null);

  // What the member asked for, ahead of the server's answer: two quick
  // clicks (List, then Past) build on each other instead of the second
  // replacing the first with the page's older state. Once nothing is pending,
  // the server's state is the truth again.
  const [wanted, setWanted] = React.useState(state);
  const [seen, setSeen] = React.useState(() => calendarHref(state));
  const href = calendarHref(state);
  if (href !== seen && !pending) {
    setSeen(href);
    setWanted(state);
  }

  const go = (patch: Partial<CalendarState>) => {
    setEditing(null);
    setDayPanel(null);
    const next = { ...wanted, ...patch };
    setWanted(next);
    startTransition(() => {
      router.replace(calendarHref(next), { scroll: false });
    });
  };

  const openEvent = (id: string) => go({ event: id, newOn: null });
  const newOn = (day: string) =>
    form ? go({ newOn: day, event: null }) : undefined;
  const close = () => {
    if (editing || dayPanel) {
      setEditing(null);
      setDayPanel(null);
      if (!state.event && !state.newOn) return;
    }
    go({ event: null, newOn: null });
  };

  const typeOptions: { value: CalendarTypeFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "meetings", label: "Meetings" },
    { value: "events", label: "Events" },
  ];

  const panel =
    editing && form && selected ? (
      <EventForm
        key={`edit-${editing.id}-${editing.version}`}
        mode={{ kind: "edit", entry: editing }}
        teams={form}
        onClose={() => setEditing(null)}
        onSaved={(saved) =>
          go({ event: saved.eventId, month: saved.month, newOn: null })
        }
        onRemoved={() => go({ event: null, newOn: null })}
      />
    ) : state.newOn && form ? (
      <EventForm
        key={`new-${state.newOn}`}
        mode={{
          kind: "new",
          day: state.newOn,
          team: state.team,
          meeting: state.type === "meetings",
        }}
        teams={form}
        onClose={close}
        onSaved={(saved) =>
          go({ event: saved.eventId, month: saved.month, newOn: null })
        }
      />
    ) : dayPanel ? (
      <PanelFrame
        label={longDayLabel(dayPanel)}
        heading={longDayLabel(dayPanel)}
        onClose={close}
      >
        <DayEntries
          day={dayPanel}
          entries={entries}
          onOpen={openEvent}
          onNew={form ? newOn : undefined}
        />
      </PanelFrame>
    ) : selected ? (
      <PanelFrame
        label={selected.entry.title}
        heading={selected.entry.kind === "meeting" ? "Meeting" : "Event"}
        onClose={close}
        actions={
          <>
            <CopyLinkButton state={{ ...state, newOn: null }} />
            {selected.canEditEvent && form ? (
              <button
                type="button"
                className={cn(SMALL_BUTTON, "max-md:hidden")}
                onClick={() => setEditing(selected.entry)}
              >
                Edit event
              </button>
            ) : null}
          </>
        }
        footer={
          selected.canEditEvent && form ? (
            <button
              type="button"
              className={cn(QUIET_BUTTON, "h-11 w-full")}
              onClick={() => setEditing(selected.entry)}
            >
              Edit event
            </button>
          ) : null
        }
      >
        <EventDetail selected={selected} today={today} />
      </PanelFrame>
    ) : state.event && props.eventMissing ? (
      <PanelFrame label="Event" heading="Event" onClose={close}>
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          That event isn&apos;t on the calendar any more.
        </p>
      </PanelFrame>
    ) : null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={pending || undefined}
      data-calendar-board
    >
      <Toolbar
        state={wanted}
        today={today}
        go={go}
        teamOptions={props.teamOptions}
        typeOptions={typeOptions}
      />

      {props.readStatus !== "ok" ? (
        <p className="mb-3 border-l-2 border-accent bg-accent/10 px-3 py-2 text-xs text-muted-foreground">
          {READ_NOTE[props.readStatus]}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 @min-[56rem]/page:flex-row">
        {panel}
        <div className="flex min-w-0 flex-1 flex-col">
          {state.view === "month" ? (
            <>
              <div className="hidden min-h-0 flex-1 flex-col page-md:flex">
                <MonthGrid
                  month={state.month}
                  today={today}
                  entries={entries}
                  selectedId={state.event}
                  pickedDay={state.newOn}
                  narrow={panel !== null}
                  onOpen={openEvent}
                  onNew={form ? newOn : undefined}
                  onMore={(day) => {
                    setEditing(null);
                    setDayPanel(day);
                  }}
                />
              </div>
              <div className="page-md:hidden">
                <PhoneMonth
                  key={state.month}
                  month={state.month}
                  today={today}
                  entries={entries}
                  onOpen={openEvent}
                  onNew={form ? newOn : undefined}
                />
              </div>
            </>
          ) : (
            <CalendarList
              entries={entries}
              scope={state.when}
              today={today}
              selectedId={state.event}
              onOpen={openEvent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  state,
  today,
  go,
  teamOptions,
  typeOptions,
}: {
  state: CalendarState;
  today: string;
  go: (patch: Partial<CalendarState>) => void;
  teamOptions: { value: string; label: string }[];
  typeOptions: { value: CalendarTypeFilter; label: string }[];
}) {
  const nav = (wide: boolean) =>
    state.view === "month" ? (
      <div className={cn("flex items-center gap-2", !wide && "w-full")}>
        <button
          type="button"
          aria-label="Previous month"
          className={cn(QUIET_BUTTON, "w-9 px-0")}
          onClick={() =>
            go({ month: addMonths(state.month, -1), event: null, newOn: null })
          }
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <h2
          className={cn(
            "text-center font-sans font-semibold normal-case tracking-normal",
            wide ? "min-w-[9.5rem] text-lg" : "flex-1 text-base",
          )}
          aria-live="polite"
        >
          {monthLabel(state.month)}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          className={cn(QUIET_BUTTON, "w-9 px-0")}
          onClick={() =>
            go({ month: addMonths(state.month, 1), event: null, newOn: null })
          }
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={QUIET_BUTTON}
          onClick={() => go({ month: today.slice(0, 7) })}
        >
          Today
        </button>
      </div>
    ) : (
      <FilterToggle
        label="When"
        options={[
          { value: "upcoming", label: "Coming up" },
          { value: "past", label: "Past" },
        ]}
        value={state.when}
        onChange={(when) => go({ when, event: null })}
        className={cn("h-9", !wide && "w-full")}
      />
    );

  const teamValue = state.team ?? ALL_TEAMS;
  const teamSelect = (id: string, labelled: boolean) => (
    <div
      className={cn(
        "flex h-9 min-w-0 items-center border border-[var(--color-choice-edge,var(--color-input))] bg-[var(--color-choice,var(--color-card))]",
        labelled ? "page-md:w-56" : "flex-1",
      )}
    >
      {labelled ? (
        <label
          htmlFor={id}
          className="pl-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        >
          Team
        </label>
      ) : null}
      <Select
        value={teamValue}
        onValueChange={(next) =>
          go({ team: next === ALL_TEAMS ? null : next, event: null })
        }
      >
        <SelectTrigger
          id={id}
          aria-label={labelled ? undefined : "Team"}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
          <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
          {teamOptions.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const viewToggle = (
    <FilterToggle
      label="View"
      options={[
        { value: "month", label: "Month" },
        { value: "list", label: "List" },
      ]}
      value={state.view}
      onChange={(view) => go({ view, event: null, newOn: null })}
      className="h-9 shrink-0"
    />
  );

  return (
    <div className="mb-3 flex flex-col gap-2">
      {/* A wide window: one row, as the mock-up. */}
      <div className="hidden flex-wrap items-center gap-3 page-md:flex">
        {nav(true)}
        <span className="flex-1" />
        {viewToggle}
        {teamSelect("calendar-team", true)}
        <FilterToggle
          label="Type"
          options={typeOptions}
          value={state.type}
          onChange={(type) => go({ type, event: null })}
          className="h-9"
        />
      </div>
      {/* A narrow window or a phone: the month, then the view and filters. */}
      <div className="flex flex-col gap-2 page-md:hidden">
        {nav(false)}
        <div className="flex gap-2">
          {viewToggle}
          {teamSelect("calendar-team-narrow", false)}
          <div className="flex h-9 min-w-0 flex-1 border border-[var(--color-choice-edge,var(--color-input))] bg-[var(--color-choice,var(--color-card))]">
            <Select
              value={state.type}
              onValueChange={(type) =>
                go({ type: type as CalendarTypeFilter, event: null })
              }
            >
              <SelectTrigger
                aria-label="Type"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="meetings">Meetings</SelectItem>
                <SelectItem value="events">Events</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The panel beside the calendar: a heading in pixel capitals, its buttons and
 * a close, the body, and an optional footer (a phone's Edit event). On a
 * phone's screen it covers the window as a sheet, its heading the window's
 * pink title bar.
 */
export function PanelFrame({
  label,
  heading,
  actions,
  footer,
  onClose,
  children,
}: {
  label: string;
  heading: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside aria-label={label} data-calendar-panel className={PANEL_FRAME}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-2.5 pl-4 pr-3 max-md:border-0 max-md:bg-primary max-md:text-primary-foreground">
        <span
          className={cn(
            PIXEL_HEADING,
            "text-primary max-md:text-primary-foreground",
          )}
        >
          {heading}
        </span>
        <span className="flex items-center gap-1">
          {actions}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground max-md:text-primary-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </div>
      <div className={cn(PANEL_SCROLL, "p-4")}>{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-border px-4 py-3 md:hidden">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}

/** Copy this view's link, the open event with it. */
function CopyLinkButton({ state }: { state: CalendarState }) {
  async function copy() {
    const url = `${window.location.origin}${calendarHref(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar.");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy link"
      title="Copy link"
      className={cn(
        SMALL_BUTTON,
        "w-[30px] px-0 max-md:border-primary-foreground/50 max-md:text-primary-foreground",
      )}
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
