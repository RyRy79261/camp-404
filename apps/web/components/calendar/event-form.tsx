"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useWindowDirty } from "@camp404/os";
import { NewCampEventInput } from "@camp404/types";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  createCampEventAction,
  editCampEventAction,
  removeCampEventAction,
  type CalendarSaved,
} from "@/app/(console)/calendar/actions";
import { MarkdownField } from "@/components/markdown/markdown-field";
import type { CalendarEntry } from "@/lib/calendar-month";
import { campDayLabel } from "@/lib/meeting-notes-view";
import {
  PANEL_FILL,
  PANEL_FRAME,
  PANEL_SCROLL,
  PIXEL_HEADING,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "./parts";

// The New event form, beside the month: the title, the agenda (owner,
// 2026-10-11: the composer's Details became the Agenda, in the WYSIWYG
// Markdown editor), the team, the date (and a last day for an all-day event
// over several days), the times and the place. The agenda goes into the
// Google event's details; an event added with one is a meeting, and the app
// makes its meeting page with the same agenda and opens it. One with no
// agenda stays a plain event. The same form changes an event the app made
// (its type stays: a meeting's agenda is changed with its minutes) and takes
// it off the calendar. The form's own check is the Zod
// shape; the action checks the shape and the rule again, and the write once
// more inside its transaction.

export interface EventFormTeams {
  /** The teams this person may add events for. */
  teams: { value: string; label: string }[];
  /** A captain: the whole camp, the team leads and picked people too. */
  canPickWholeCamp: boolean;
  /** Approved members, for an event for picked people (captains only). */
  members: { value: string; label: string }[];
}

type Mode =
  | {
      kind: "new";
      day: string;
      /** The Calendar's team filter, as the form's start. */
      team?: string | null;
    }
  | { kind: "edit"; entry: CalendarEntry };

const WHOLE_CAMP = "__camp__";
const TEAM_LEADS = "__leads__";
const PEOPLE = "__people__";

/** The "Who is it for" value an event opens with. */
function whoOf(entry: CalendarEntry): string {
  if (entry.audience === "team_leads") return TEAM_LEADS;
  if (entry.audience === "people") return PEOPLE;
  return entry.team?.key ?? WHOLE_CAMP;
}

type FieldName =
  | "title"
  | "date"
  | "endDate"
  | "start"
  | "end"
  | "place"
  | "description"
  | "agenda"
  | "people"
  | "callUrl";

const GOOGLE_NOTE = {
  synced: null,
  not_connected:
    "Saved. The camp's Google Calendar isn't connected here, so it is in the app only.",
  failed:
    "Saved. Google didn't take it just now; it goes on the camp's Google Calendar shortly.",
} as const;

export function EventForm({
  mode,
  teams,
  onClose,
  onSaved,
  onRemoved,
}: {
  mode: Mode;
  teams: EventFormTeams;
  onClose: () => void;
  onSaved: (saved: CalendarSaved) => void;
  onRemoved?: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.entry : null;
  // A new event starts on the team the Calendar is filtered to, when this
  // person may add for it; else the whole camp for a captain, or the first
  // team a lead leads.
  const filtered = mode.kind === "new" ? mode.team : null;
  const firstTeam = editing
    ? whoOf(editing)
    : filtered && teams.teams.some((t) => t.value === filtered)
      ? filtered
      : teams.canPickWholeCamp
        ? WHOLE_CAMP
        : (teams.teams[0]?.value ?? WHOLE_CAMP);
  const initial = {
    team: firstTeam,
    title: editing?.title ?? "",
    date: editing?.startDay ?? (mode.kind === "new" ? mode.day : ""),
    endDate:
      editing && editing.allDay && editing.endDay !== editing.startDay
        ? editing.endDay
        : "",
    allDay: editing?.allDay ?? false,
    start: editing?.startTime ?? "19:00",
    end: editing?.endTime ?? "20:00",
    place: editing?.place ?? "",
    description: editing?.description ?? "",
    agenda: "",
    people: editing?.people ?? ([] as string[]),
    callUrl: editing?.callUrl ?? "",
  };
  const [team, setTeam] = React.useState(initial.team);
  const [title, setTitle] = React.useState(initial.title);
  const [date, setDate] = React.useState(initial.date);
  const [endDate, setEndDate] = React.useState(initial.endDate);
  const [allDay, setAllDay] = React.useState(initial.allDay);
  const [start, setStart] = React.useState(initial.start);
  const [end, setEnd] = React.useState(initial.end);
  const [place, setPlace] = React.useState(initial.place);
  const [description, setDescription] = React.useState(initial.description);
  const [agenda, setAgenda] = React.useState(initial.agenda);
  const [people, setPeople] = React.useState<string[]>(initial.people);
  const [peopleFilter, setPeopleFilter] = React.useState("");
  const [callUrl, setCallUrl] = React.useState(initial.callUrl);
  const [errors, setErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);

  const values = {
    team,
    title,
    date,
    endDate,
    allDay,
    start,
    end,
    place,
    description,
    agenda,
    people,
    callUrl,
  };
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const settle = useWindowDirty(
    dirty,
    "This event isn't saved. Leave without adding it?",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // A new event's agenda is its Google details too; an event with one is
    // a meeting. A changed event keeps its details (a meeting's agenda is
    // changed with its minutes).
    const newAgenda = editing ? "" : agenda;
    const fields = {
      kind: newAgenda.trim() ? ("meeting" as const) : ("event" as const),
      team: [WHOLE_CAMP, TEAM_LEADS, PEOPLE].includes(team) ? null : team,
      audience:
        team === WHOLE_CAMP
          ? ("camp" as const)
          : team === TEAM_LEADS
            ? ("team_leads" as const)
            : team === PEOPLE
              ? ("people" as const)
              : ("team" as const),
      people: team === PEOPLE ? people : [],
      callUrl,
      title,
      date,
      endDate: allDay ? endDate : "",
      allDay,
      start: allDay ? "" : start,
      end: allDay ? "" : end,
      place,
      description: editing
        ? editing.kind === "meeting"
          ? (editing.description ?? "")
          : description
        : newAgenda,
      agenda: newAgenda,
    };
    const parsed = NewCampEventInput.safeParse(fields);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      let other: string | null = null;
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        if (
          [
            "title",
            "date",
            "endDate",
            "start",
            "end",
            "place",
            "description",
            "agenda",
            "people",
            "callUrl",
          ].includes(key)
        ) {
          next[key] ??= issue.message;
        } else other ??= issue.message;
      }
      setErrors(next);
      setError(other);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const { kind: _kind, agenda: _agenda, ...rest } = fields;
      const meeting = fields.kind === "meeting";
      const result = editing
        ? await editCampEventAction({
            ...rest,
            eventId: editing.id,
            version: editing.version,
          })
        : await createCampEventAction(fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      settle();
      const note = GOOGLE_NOTE[result.data.calendar];
      if (note) toast.info(note);
      else
        toast.success(
          editing
            ? "Event saved"
            : meeting
              ? "Added to the calendar, with its meeting page"
              : "Added to the calendar",
        );
      onSaved(result.data);
    });
  }

  function remove() {
    if (!editing?.version) return;
    startTransition(async () => {
      const result = await removeCampEventAction({
        eventId: editing.id,
        version: editing.version,
      });
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      settle();
      setConfirming(false);
      toast.success("Taken off the calendar");
      onRemoved?.();
    });
  }

  const heading = editing ? "Edit event" : "New event";
  const teamHelp = teams.canPickWholeCamp
    ? "Every member still sees it. This says whose it is."
    : "A team you lead. Events for the whole camp, the team leads or picked people are for captains.";
  const shownPeople = teams.members.filter((m) =>
    m.label.toLowerCase().includes(peopleFilter.trim().toLowerCase()),
  );

  return (
    <aside aria-label={heading} data-calendar-panel className={PANEL_FRAME}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-2.5 pl-4 pr-3 max-md:border-0 max-md:bg-primary max-md:text-primary-foreground">
        <span
          className={cn(
            PIXEL_HEADING,
            "text-primary max-md:text-primary-foreground",
          )}
        >
          {heading}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            settle();
            onClose();
          }}
          className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground max-md:text-primary-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <form
        onSubmit={submit}
        noValidate
        className={cn("flex flex-col", PANEL_FILL)}
        aria-label={heading}
      >
        <div className={cn("flex flex-col gap-4 p-4", PANEL_SCROLL)}>
          <p className="border-l-2 border-accent bg-accent/10 px-2.5 py-2 text-xs leading-4 text-muted-foreground">
            Goes on the camp&apos;s Google Calendar. Every member sees it.
          </p>

          <Field
            label="Title"
            htmlFor="event-title"
            required
            error={errors.title}
          >
            <Input
              id="event-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Kitchen planning"
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
            />
          </Field>

          {editing === null ? (
            <Field
              label="Agenda"
              error={errors.agenda ?? errors.description}
              help="Written to the Google Calendar event's details, and to the meeting page the app makes for it. Leave it empty for an event that is not a meeting."
            >
              <MarkdownField
                label="Agenda"
                value={agenda}
                onChange={setAgenda}
                disabled={pending}
                emptyPreview="No agenda yet."
              />
            </Field>
          ) : editing.kind === "meeting" ? (
            <p className="text-xs text-muted-foreground">
              The agenda is changed with the minutes.
            </p>
          ) : (
            <Field
              label="Description"
              htmlFor="event-description"
              error={errors.description}
            >
              <Textarea
                id="event-description"
                rows={2}
                value={description}
                maxLength={10_000}
                placeholder="What it is for. This goes on Google too."
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
              />
            </Field>
          )}

          <Field label="Who is it for" htmlFor="event-team" help={teamHelp}>
            <Select value={team} onValueChange={setTeam} disabled={pending}>
              <SelectTrigger id="event-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teams.canPickWholeCamp ? (
                  <>
                    <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
                    <SelectItem value={TEAM_LEADS}>Team leads</SelectItem>
                    <SelectItem value={PEOPLE}>Pick people</SelectItem>
                  </>
                ) : null}
                {teams.teams.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
                {editing?.team &&
                !teams.teams.some((t) => t.value === editing.team?.key) ? (
                  <SelectItem value={editing.team.key}>
                    {editing.team.label}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Field>

          {team === PEOPLE ? (
            <Field
              label="People"
              htmlFor="event-people-filter"
              required
              help={
                people.length === 1
                  ? "1 person picked."
                  : `${people.length} people picked.`
              }
              error={errors.people}
            >
              <div className="flex flex-col gap-2">
                <Input
                  emoji={false}
                  id="event-people-filter"
                  value={peopleFilter}
                  placeholder="Find someone"
                  onChange={(e) => setPeopleFilter(e.target.value)}
                  disabled={pending}
                />
                <ul
                  aria-label="People"
                  className="flex max-h-48 flex-col overflow-y-auto border border-border"
                >
                  {shownPeople.map((m) => {
                    const on = people.includes(m.value);
                    return (
                      <li key={m.value}>
                        <label className="flex min-h-9 cursor-pointer items-center gap-2 px-2.5 text-sm">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(next) =>
                              setPeople((list) =>
                                next === true
                                  ? [...list, m.value]
                                  : list.filter((id) => id !== m.value),
                              )
                            }
                            disabled={pending}
                            aria-label={m.label}
                          />
                          {m.label}
                        </label>
                      </li>
                    );
                  })}
                  {shownPeople.length === 0 ? (
                    <li className="px-2.5 py-2 text-sm text-muted-foreground">
                      Nobody by that name.
                    </li>
                  ) : null}
                </ul>
              </div>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 items-start gap-2.5">
            <Field
              label="Date"
              htmlFor="event-date"
              required
              help={campDayLabel(date) ?? undefined}
              error={errors.date}
            >
              <DateControl
                id="event-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={pending}
              />
            </Field>
            <label className="mt-6 flex h-9 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={allDay}
                onCheckedChange={(on) => setAllDay(on === true)}
                disabled={pending}
                aria-label="All day"
              />
              All day
            </label>
          </div>

          {allDay ? (
            <Field
              label="Last day"
              htmlFor="event-end-date"
              help="For an event over several days. Leave it empty for one day."
              error={errors.endDate}
            >
              <DateControl
                id="event-end-date"
                value={endDate}
                min={date || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={pending}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Starts" htmlFor="event-start" error={errors.start}>
                <Input
                  id="event-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={pending}
                />
              </Field>
              <Field label="Ends" htmlFor="event-end" error={errors.end}>
                <Input
                  id="event-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={pending}
                />
              </Field>
            </div>
          )}

          <Field label="Place" htmlFor="event-place" error={errors.place}>
            <Input
              id="event-place"
              value={place}
              maxLength={200}
              placeholder="An address, or Online"
              onChange={(e) => setPlace(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field
            label="Video call link"
            htmlFor="event-call"
            help="Paste a Google Meet or Zoom link, or leave it empty. It goes on the Google event too."
            error={errors.callUrl}
          >
            <Input
              id="event-call"
              type="url"
              inputMode="url"
              value={callUrl}
              maxLength={500}
              placeholder="https://meet.google.com/…"
              onChange={(e) => setCallUrl(e.target.value)}
              disabled={pending}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
          <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
            {pending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add to the calendar"}
          </button>
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={pending}
            onClick={() => {
              settle();
              onClose();
            }}
          >
            Cancel
          </button>
          {editing ? (
            <button
              type="button"
              className={cn(QUIET_BUTTON, "ml-auto text-destructive")}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </form>
      {editing ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Take this event off the calendar?"
          description={
            editing.kind === "meeting"
              ? "It comes off the camp's Google Calendar, with its agenda. A meeting with minutes can't be removed."
              : "It comes off the camp's Google Calendar for everyone."
          }
          confirmLabel="Remove"
          destructive
          pending={pending}
          onConfirm={remove}
        />
      ) : null}
    </aside>
  );
}
