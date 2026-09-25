"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, Info } from "lucide-react";
import { teamEventTitle } from "@camp404/core";
import { AddCalendarEventInput } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
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
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { addCalendarEventAction } from "./actions";
import { MineStar } from "@/components/calendar/calendar-days";
import { cn } from "@camp404/ui/lib/utils";

// The add-event form, laid out like AfrikaBurn's bulletin composer: the fields
// in a card, the all-day switch in its own bordered row, a note, then the
// footer with what happens on save and the one button. The aside shows the
// event the way Home's "Coming up" will.
//
// The form's own check (the Zod shape) is a convenience; the action checks the
// shape, the date, the team and the author again.

export interface EventTeamOption {
  value: string;
  label: string;
}

/** The Select value for "no team". */
const WHOLE_CAMP = "__camp__";

type FieldName = "title" | "description" | "date" | "start" | "end";

const PREVIEW_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function EventComposer({
  teams,
  canPickWholeCamp,
  today,
}: {
  teams: EventTeamOption[];
  canPickWholeCamp: boolean;
  /** The camp's day, YYYY-MM-DD: the earliest date the form offers. */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [team, setTeam] = React.useState(
    canPickWholeCamp ? WHOLE_CAMP : (teams[0]?.value ?? WHOLE_CAMP),
  );
  const [date, setDate] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);

  const teamLabel =
    team === WHOLE_CAMP
      ? null
      : (teams.find((t) => t.value === team)?.label ?? null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fields = {
      title,
      description,
      team: team === WHOLE_CAMP ? null : team,
      date,
      allDay,
      start: allDay ? undefined : start,
      end: allDay ? undefined : end,
    };
    const parsed = AddCalendarEventInput.safeParse(fields);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      const result = await addCalendarEventAction(fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Event added");
      router.push("/");
      router.refresh();
    });
  }

  const previewTitle = title.trim() || "Untitled event";
  const previewWhen = date
    ? `${PREVIEW_DATE.format(new Date(`${date}T00:00:00Z`)).replace(",", "")}${
        !allDay && start ? ` · ${start}` : ""
      }`
    : "Pick a date";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form
        onSubmit={submit}
        noValidate
        className="flex min-w-0 flex-1 flex-col gap-6"
      >
        <Card>
          <CardContent className="flex flex-col gap-5 p-5">
            <Field
              label="Title"
              htmlFor="event-title"
              required
              help={
                teamLabel
                  ? `Google Calendar shows it as “${teamEventTitle(teamLabel, title.trim() || "…")}”.`
                  : "Keep it short: it is what Home shows."
              }
              error={fieldErrors.title}
            >
              <Input
                id="event-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kitchen briefing"
                disabled={pending}
                required
              />
            </Field>

            <Field
              label="Details"
              htmlFor="event-description"
              help="Written to the Google Calendar event only. The app never shows it."
              error={fieldErrors.description}
            >
              <Textarea
                id="event-description"
                value={description}
                maxLength={2000}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Team"
                htmlFor="event-team"
                required
                help={
                  canPickWholeCamp
                    ? "Members on the team see it marked as theirs."
                    : "Only a team you lead."
                }
              >
                <Select value={team} onValueChange={setTeam} disabled={pending}>
                  <SelectTrigger id="event-team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canPickWholeCamp ? (
                      <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
                    ) : null}
                    {teams.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Date"
                htmlFor="event-date"
                required
                error={fieldErrors.date}
              >
                <DateControl
                  id="event-date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={pending}
                  required
                />
              </Field>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">All day</span>
                <p className="max-w-md text-xs text-muted-foreground">
                  An all-day event has no times. A timed event starts and ends
                  on the same day, in camp time.
                </p>
              </div>
              <Switch
                checked={allDay}
                onCheckedChange={setAllDay}
                aria-label="All day"
                disabled={pending}
                className="mt-1"
              />
            </div>

            {allDay ? null : (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Starts"
                  htmlFor="event-start"
                  required
                  error={fieldErrors.start}
                >
                  <Input
                    id="event-start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    disabled={pending}
                    required
                  />
                </Field>
                <Field
                  label="Ends"
                  htmlFor="event-end"
                  required
                  error={fieldErrors.end}
                >
                  <Input
                    id="event-end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    disabled={pending}
                    required
                  />
                </Field>
              </div>
            )}

            <div className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3">
              <Info
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                aria-hidden
              />
              <p className="text-sm text-foreground">
                Events go on the camp&rsquo;s shared Google Calendar. To change
                or remove one, edit it there.
              </p>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {teamLabel
              ? `Everyone sees it under Coming up; the ${teamLabel} team sees it marked as theirs.`
              : "Everyone sees it under Coming up."}
          </p>
          <Button type="submit" disabled={pending} className="shrink-0">
            <CalendarPlus aria-hidden />
            {pending ? "Adding…" : "Add event"}
          </Button>
        </div>
      </form>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {/* The team's own view: the border and star mark an event of one of
              the viewer's teams, and this preview is how that team sees it,
              whoever adds it (a captain may add for a team they are not on). */}
          {teamLabel
            ? `Preview — how the ${teamLabel} team sees it on Home`
            : "Preview — how Home shows it"}
        </p>
        <Card>
          {/* The badge under the title, as Home draws it on a phone, so a
              long team name never hides the title in this narrow column. */}
          <CardContent
            className={cn(
              "flex flex-col items-start gap-1.5 p-4",
              teamLabel && "m-2 rounded-lg border border-accent/60",
            )}
          >
            <span className="w-full min-w-0">
              <span className="block truncate text-sm font-medium">
                {teamLabel ? <MineStar /> : null}
                {previewTitle}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {previewWhen}
              </span>
            </span>
            {teamLabel ? <Badge variant="outline">{teamLabel}</Badge> : null}
          </CardContent>
        </Card>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {teamLabel
            ? `The team sees it with a border and a star; everyone else sees the “${teamLabel}” badge.`
            : "A whole-camp event wears no badge."}
        </p>
      </aside>
    </div>
  );
}
