"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, ListChecks, Plus, Save, Trash2 } from "lucide-react";
import { MEETING_NOTE_PRIVACY_REMINDER } from "@camp404/core";
import { NewMeetingNoteInput } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { AckRow } from "@camp404/ui/components/checkbox";
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
import type { MeetingEventOption } from "@/lib/meeting-notes-view";
import { createMeetingNoteAction, editMeetingNoteAction } from "./actions";

// The meeting-note editor (#268), laid out like the add-event form: the
// fields in cards, the privacy reminder in the accent box, then the footer
// with the one button. The form's own check (the Zod shape) is a convenience;
// the action checks the shape, the team and the writer again.

export interface MeetingTeamOption {
  value: string;
  label: string;
}

export interface MeetingPerson {
  id: string;
  displayName: string;
}

export interface MeetingEditorItem {
  /** Null for an item not saved yet. */
  id: string | null;
  text: string;
  assigneeId: string | null;
  due: string;
  /** Already a task on the board: its words are fixed here. */
  onBoard: boolean;
}

export interface MeetingEditorValues {
  title: string;
  date: string;
  time: string;
  calendarEventId: string | null;
  agenda: string;
  notes: string;
  attendeeIds: string[];
  decisions: string[];
  actionItems: MeetingEditorItem[];
}

export type MeetingEditorMode =
  | {
      kind: "new";
      /** The teams this writer may pick; `WHOLE_CAMP` when they may. */
      teams: MeetingTeamOption[];
      canPickWholeCamp: boolean;
      team: string;
    }
  | { kind: "edit"; noteId: string; version: number; team: string };

/** The Select value for "no team" and for "not on the calendar". */
export const WHOLE_CAMP = "__camp__";
const NO_EVENT = "__none__";
const NOBODY = "__nobody__";

type FieldName = "title" | "date" | "time" | "agenda" | "notes";

let keySerial = 0;
const nextKey = () => `row-${++keySerial}`;

export function MeetingEditor({
  mode,
  initial,
  members,
  teamPeople,
  teamLabels,
  events,
  formerAttendees = [],
}: {
  mode: MeetingEditorMode;
  initial: MeetingEditorValues;
  /** Everyone who may be ticked or given an action item: approved members. */
  members: MeetingPerson[];
  /** Each team's people this year, by team key: ticked from first. */
  teamPeople: Record<string, string[]>;
  teamLabels: Record<string, string>;
  /** Upcoming events on the camp calendar, to link the meeting to. */
  events: MeetingEventOption[];
  /** People on the note who are no longer approved members, by name. */
  formerAttendees?: MeetingPerson[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [team, setTeam] = React.useState(mode.team);
  const [title, setTitle] = React.useState(initial.title);
  const [date, setDate] = React.useState(initial.date);
  const [time, setTime] = React.useState(initial.time);
  const [eventId, setEventId] = React.useState(
    initial.calendarEventId ?? NO_EVENT,
  );
  const [agenda, setAgenda] = React.useState(initial.agenda);
  const [notes, setNotes] = React.useState(initial.notes);
  const [attendees, setAttendees] = React.useState(
    () => new Set(initial.attendeeIds),
  );
  const [decisions, setDecisions] = React.useState(() =>
    initial.decisions.map((text) => ({ key: nextKey(), text })),
  );
  const [items, setItems] = React.useState(() =>
    initial.actionItems.map((item) => ({ ...item, key: nextKey() })),
  );
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);

  const teamKey = team === WHOLE_CAMP ? null : team;
  const teamLabel = teamKey ? (teamLabels[teamKey] ?? teamKey) : "Whole camp";

  // The team's people first, then everyone else; someone on the note who is no
  // longer on the approved list shows in a group of their own, so they can be
  // unticked.
  const known = new Map(members.map((m) => [m.id, m]));
  const onTeam = new Set(teamKey ? (teamPeople[teamKey] ?? []) : []);
  const teamRows = members.filter((m) => onTeam.has(m.id));
  const otherRows = members.filter((m) => !onTeam.has(m.id));
  const gone = formerAttendees.filter((p) => !known.has(p.id));
  const othersTicked = otherRows.filter((m) => attendees.has(m.id)).length;

  // The calendar's events for this team (or the whole camp's), plus the one
  // the note already names even if it has passed.
  const eventOptions = events.filter((e) => e.team === teamKey);
  const linkedGone =
    initial.calendarEventId !== null &&
    !eventOptions.some((e) => e.id === initial.calendarEventId);

  function pickEvent(next: string) {
    setEventId(next);
    const event = events.find((e) => e.id === next);
    if (!event) return;
    if (!title.trim()) setTitle(event.title);
    setDate(event.date);
    if (event.time) setTime(event.time);
  }

  function toggle(id: string, on: boolean) {
    setAttendees((before) => {
      const next = new Set(before);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      title,
      date,
      time,
      calendarEventId: eventId === NO_EVENT ? null : eventId,
      agenda,
      notes,
      attendeeIds: [...attendees],
      decisions: decisions.map((d) => d.text).filter((t) => t.trim()),
      actionItems: items
        .filter((i) => i.onBoard || i.text.trim())
        .map((i) => ({
          id: i.id,
          text: i.text,
          assigneeId: i.assigneeId,
          due: i.due || null,
        })),
    };
    const fields = { team: teamKey, ...body };
    const parsed = NewMeetingNoteInput.safeParse(fields);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      let other: string | null = null;
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (["title", "date", "time", "agenda", "notes"].includes(key)) {
          next[key as FieldName] ??= issue.message;
        } else {
          other ??= issue.message;
        }
      }
      setFieldErrors(next);
      setError(other);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      if (mode.kind === "new") {
        const result = await createMeetingNoteAction(fields);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Meeting saved");
        router.push(`/meetings/${result.data.id}`);
      } else {
        const result = await editMeetingNoteAction({
          ...body,
          noteId: mode.noteId,
          version: mode.version,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Meeting saved");
        router.push(`/meetings/${mode.noteId}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-6">
      <div className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm text-foreground">
          {MEETING_NOTE_PRIVACY_REMINDER}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {mode.kind === "new" ? (
              <Field
                label="Team"
                htmlFor="meeting-team"
                required
                help={
                  mode.canPickWholeCamp
                    ? "A whole-camp meeting is a captain's to write up."
                    : "A team you're on this year."
                }
              >
                <Select
                  value={team}
                  onValueChange={(next) => {
                    setTeam(next);
                    setEventId(NO_EVENT);
                  }}
                  disabled={pending}
                >
                  <SelectTrigger id="meeting-team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mode.canPickWholeCamp ? (
                      <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
                    ) : null}
                    {mode.teams.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="Team" help="A note keeps its team.">
                <p className="flex h-10 items-center text-sm">{teamLabel}</p>
              </Field>
            )}
            <Field
              label="On the calendar"
              htmlFor="meeting-event"
              help={
                eventOptions.length === 0 && !linkedGone
                  ? teamKey
                    ? "Nothing coming up on the camp calendar for this team."
                    : "No whole-camp events coming up on the calendar."
                  : "Picking an event fills in its date and time."
              }
            >
              <Select
                value={eventId}
                onValueChange={pickEvent}
                disabled={pending}
              >
                <SelectTrigger id="meeting-event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT}>Not on the calendar</SelectItem>
                  {linkedGone && initial.calendarEventId ? (
                    <SelectItem value={initial.calendarEventId}>
                      The event it names now
                    </SelectItem>
                  ) : null}
                  {eventOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Title"
            htmlFor="meeting-title"
            required
            error={fieldErrors.title}
          >
            <Input
              id="meeting-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kitchen kickoff"
              disabled={pending}
              required
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Date"
              htmlFor="meeting-date"
              required
              error={fieldErrors.date}
            >
              <DateControl
                id="meeting-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={pending}
                required
              />
            </Field>
            <Field
              label="Time"
              htmlFor="meeting-time"
              required
              help="Camp time."
              error={fieldErrors.time}
            >
              <Input
                id="meeting-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={pending}
                required
              />
            </Field>
          </div>

          <Field
            label="Agenda"
            htmlFor="meeting-agenda"
            help="Markdown works: - for a list, **bold**."
            error={fieldErrors.agenda}
          >
            <Textarea
              id="meeting-agenda"
              value={agenda}
              rows={4}
              maxLength={10_000}
              onChange={(e) => setAgenda(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="meeting-notes"
            help="What was said. Markdown works here too."
            error={fieldErrors.notes}
          >
            <Textarea
              id="meeting-notes"
              value={notes}
              rows={8}
              maxLength={20_000}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who was there</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <section aria-labelledby="attendees-team">
            <h2
              id="attendees-team"
              className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {teamKey ? `On ${teamLabel} this year` : "Whole camp"}
            </h2>
            {teamKey && teamRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody is on this team yet this year.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(teamKey ? teamRows : otherRows).map((m) => (
                  <AckRow
                    key={m.id}
                    checked={attendees.has(m.id)}
                    onCheckedChange={(on) => toggle(m.id, on === true)}
                    disabled={pending}
                  >
                    {m.displayName}
                  </AckRow>
                ))}
              </div>
            )}
          </section>
          {teamKey && otherRows.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-accent">
                Anyone else
                {othersTicked > 0 ? ` (${othersTicked} ticked)` : ""}
              </summary>
              <div className="grid gap-2 pt-3 sm:grid-cols-2">
                {otherRows.map((m) => (
                  <AckRow
                    key={m.id}
                    checked={attendees.has(m.id)}
                    onCheckedChange={(on) => toggle(m.id, on === true)}
                    disabled={pending}
                  >
                    {m.displayName}
                  </AckRow>
                ))}
              </div>
            </details>
          ) : null}
          {gone.length > 0 ? (
            <section aria-labelledby="attendees-gone">
              <h2
                id="attendees-gone"
                className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                No longer approved members
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {gone.map((p) => (
                  <AckRow
                    key={p.id}
                    checked={attendees.has(p.id)}
                    onCheckedChange={(on) => toggle(p.id, on === true)}
                    disabled={pending}
                  >
                    {p.displayName}
                  </AckRow>
                ))}
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Decisions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              One short line for each thing the meeting settled.
            </p>
          ) : (
            <ol className="flex flex-col gap-2" aria-label="Decisions">
              {decisions.map((d, index) => (
                <li key={d.key} className="flex items-center gap-2">
                  <Input
                    aria-label={`Decision ${index + 1}`}
                    value={d.text}
                    maxLength={500}
                    onChange={(e) =>
                      setDecisions((all) =>
                        all.map((x) =>
                          x.key === d.key ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                    disabled={pending}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove decision ${index + 1}`}
                    onClick={() =>
                      setDecisions((all) => all.filter((x) => x.key !== d.key))
                    }
                    disabled={pending}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setDecisions((all) => [...all, { key: nextKey(), text: "" }])
            }
            disabled={pending}
          >
            <Plus aria-hidden />
            Add decision
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Action items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Who does what next. Once saved, a lead or a captain can put each
              one on the task board.
            </p>
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Action items">
              {items.map((item, index) =>
                item.onBoard ? (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <ListChecks
                      className="h-4 w-4 shrink-0 text-accent"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 basis-40 text-sm [overflow-wrap:anywhere]">
                      {item.text}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      On the task board
                    </Badge>
                  </li>
                ) : (
                  <li
                    key={item.key}
                    className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto] sm:items-start"
                  >
                    <Field
                      label={`Action item ${index + 1}`}
                      htmlFor={`item-text-${item.key}`}
                    >
                      <Input
                        id={`item-text-${item.key}`}
                        value={item.text}
                        maxLength={120}
                        placeholder="e.g. Buy the gas"
                        onChange={(e) =>
                          setItems((all) =>
                            all.map((x) =>
                              x.key === item.key
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          )
                        }
                        disabled={pending}
                      />
                    </Field>
                    <Field label="Who" htmlFor={`item-who-${item.key}`}>
                      <Select
                        value={item.assigneeId ?? NOBODY}
                        onValueChange={(next) =>
                          setItems((all) =>
                            all.map((x) =>
                              x.key === item.key
                                ? {
                                    ...x,
                                    assigneeId: next === NOBODY ? null : next,
                                  }
                                : x,
                            ),
                          )
                        }
                        disabled={pending}
                      >
                        <SelectTrigger id={`item-who-${item.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOBODY}>Nobody yet</SelectItem>
                          {item.assigneeId && !known.has(item.assigneeId) ? (
                            <SelectItem value={item.assigneeId}>
                              Someone no longer approved
                            </SelectItem>
                          ) : null}
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Due" htmlFor={`item-due-${item.key}`}>
                      <DateControl
                        id={`item-due-${item.key}`}
                        value={item.due}
                        onChange={(e) =>
                          setItems((all) =>
                            all.map((x) =>
                              x.key === item.key
                                ? { ...x, due: e.target.value }
                                : x,
                            ),
                          )
                        }
                        disabled={pending}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="justify-self-end sm:self-end"
                      aria-label={`Remove action item ${index + 1}`}
                      onClick={() =>
                        setItems((all) => all.filter((x) => x.key !== item.key))
                      }
                      disabled={pending}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ),
              )}
            </ol>
          )}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setItems((all) => [
                ...all,
                {
                  key: nextKey(),
                  id: null,
                  text: "",
                  assigneeId: null,
                  due: "",
                  onBoard: false,
                },
              ])
            }
            disabled={pending}
          >
            <Plus aria-hidden />
            Add action item
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {teamKey
            ? `Every approved member can read it, under Meetings and on the ${teamLabel} page.`
            : "Every approved member can read it, under Meetings."}
        </p>
        <Button type="submit" disabled={pending} className="shrink-0">
          <Save aria-hidden />
          {pending ? "Saving…" : "Save meeting"}
        </Button>
      </div>
    </form>
  );
}
