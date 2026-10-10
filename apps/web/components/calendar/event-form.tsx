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
import { PIXEL_HEADING, PRIMARY_BUTTON, QUIET_BUTTON } from "./parts";

// The New event form, beside the month (the approved mock-up's form): the
// type (an Event, or a Meeting with an agenda before and minutes after), the
// team, title, date (and a last day for an all-day event over several days),
// the times, place and description, and a meeting's agenda in the WYSIWYG
// Markdown editor. The same form changes an event the app made (its type
// stays) and takes it off the calendar. The form's own check is the Zod
// shape; the action checks the shape and the rule again, and the write once
// more inside its transaction.

export interface EventFormTeams {
  /** The teams this person may add events for. */
  teams: { value: string; label: string }[];
  canPickWholeCamp: boolean;
}

type Mode =
  | { kind: "new"; day: string }
  | { kind: "edit"; entry: CalendarEntry };

const WHOLE_CAMP = "__camp__";

type FieldName =
  | "title"
  | "date"
  | "endDate"
  | "start"
  | "end"
  | "place"
  | "description"
  | "agenda";

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
  const firstTeam = editing
    ? (editing.team?.key ?? WHOLE_CAMP)
    : (teams.teams[0]?.value ?? WHOLE_CAMP);
  const initial = {
    kind: editing?.kind ?? ("event" as const),
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
  };
  const [kind, setKind] = React.useState<"event" | "meeting">(initial.kind);
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
  const [errors, setErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);

  const values = {
    kind,
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
  };
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const settle = useWindowDirty(
    dirty,
    "This event isn't saved. Leave without adding it?",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fields = {
      kind,
      team: team === WHOLE_CAMP ? null : team,
      title,
      date,
      endDate: allDay ? endDate : "",
      allDay,
      start: allDay ? "" : start,
      end: allDay ? "" : end,
      place,
      description,
      agenda: kind === "meeting" ? agenda : "",
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
      else toast.success(editing ? "Event saved" : "Added to the calendar");
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
    ? "Whole camp events are for captains."
    : "A team you lead. Whole camp events are for captains.";

  return (
    <aside
      aria-label={heading}
      data-calendar-panel
      className="flex min-h-0 flex-col border border-border bg-card @min-[56rem]/page:order-last max-md:fixed max-md:inset-0 max-md:z-50 max-md:border-0 @min-[56rem]/page:w-[23.75rem] @min-[56rem]/page:shrink-0"
    >
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
        className="flex min-h-0 flex-1 flex-col"
        aria-label={heading}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="border-l-2 border-accent bg-accent/10 px-2.5 py-2 text-xs leading-4 text-muted-foreground">
            Goes on the camp&apos;s Google Calendar. Every member sees it.
          </p>

          {editing ? null : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Type</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["event", "Event", "Something on a day"],
                    [
                      "meeting",
                      "Meeting",
                      "With an agenda before and minutes after",
                    ],
                  ] as const
                ).map(([value, label, help]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                    disabled={pending}
                    className={cn(
                      "flex flex-col items-start gap-0.5 border px-3 py-2.5 text-left",
                      kind === value
                        ? "border-2 border-primary bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_24%,var(--color-card)))] px-[11px] py-[9px]"
                        : "border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))]",
                    )}
                  >
                    <b className="text-sm font-semibold">{label}</b>
                    <span className="text-xs text-muted-foreground">{help}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <Field label="Team" htmlFor="event-team" help={teamHelp}>
            <Select value={team} onValueChange={setTeam} disabled={pending}>
              <SelectTrigger id="event-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teams.canPickWholeCamp ? (
                  <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
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
              placeholder={
                kind === "meeting" ? "e.g. Kitchen planning" : "e.g. Dome rehearsal"
              }
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
            />
          </Field>

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
            label="Description"
            htmlFor="event-description"
            error={errors.description}
          >
            <Textarea
              id="event-description"
              rows={2}
              value={description}
              maxLength={2000}
              placeholder="What it is for. This goes on Google too."
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
            />
          </Field>

          {kind === "meeting" && !editing ? (
            <Field
              label="Agenda"
              error={errors.agenda}
              help="The minutes are written on the meeting after it starts."
            >
              <MarkdownField
                label="Agenda"
                value={agenda}
                onChange={setAgenda}
                disabled={pending}
                emptyPreview="No agenda yet."
              />
            </Field>
          ) : null}
          {editing?.kind === "meeting" ? (
            <p className="text-xs text-muted-foreground">
              The agenda is changed with the minutes.
            </p>
          ) : null}

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
