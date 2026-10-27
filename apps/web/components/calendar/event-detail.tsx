"use client";

import * as React from "react";
import Link from "next/link";
import {
  Clock,
  MapPin,
  Pencil,
  SquareKanban,
  Users,
  Video,
} from "lucide-react";
import { MarkdownBody } from "@camp404/ui/components/markdown-body";
import { cn } from "@camp404/ui/lib/utils";
import { entryWhen, isPastEntry, shortDayLabel } from "@/lib/calendar-month";
import type { MeetingNote } from "@/lib/meeting-notes";
import { TASK_STATUS_LABEL } from "@/lib/meeting-notes-view";
import type { SelectedEvent } from "./calendar-board";
import {
  GHOST_BUTTON,
  MeetingBadge,
  PIXEL_HEADING,
  QUIET_BUTTON,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  SMALL_CAPS,
  TeamBadge,
} from "./parts";

// One event, beside the month or in a phone's sheet (the approved mock-up's
// detail): its type and team, title, when and where, its description, and
// where it is kept. A meeting shows its agenda before, and its minutes after:
// the notes, what was decided, the action items (each a task on the board:
// who, under which team, by when, and how it stands there), who came, then
// the agenda folded away. A meeting with
// no minutes has "Write minutes" for its team's members and captains.

/** Where an event is kept and changed, said once under it. */
const SOURCE_LINE = {
  app: "On the camp's Google Calendar.",
  google:
    "On the camp's Google Calendar. It was made there, so change it there.",
  logistics: "One of the camp's days, set on Logistics.",
  deadline: "An AfrikaBurn date, set on the camp's year page.",
  note: "From its minutes: the camp's Google Calendar doesn't have this event any more.",
} as const;

/** The minutes editor of a meeting. */
export function minutesHref(eventId: string): string {
  return `/calendar/${encodeURIComponent(eventId)}/minutes`;
}

export function EventDetail({
  selected,
  today,
}: {
  selected: SelectedEvent;
  today: string;
}) {
  const { entry, note } = selected;
  const past = isPastEntry(entry, today);
  return (
    <div data-event-detail>
      <div className="flex flex-wrap gap-1.5">
        {entry.kind === "meeting" ? <MeetingBadge /> : null}
        <TeamBadge entry={entry} />
      </div>
      <h2 className="my-2 font-sans text-xl font-semibold normal-case leading-7 tracking-normal">
        {entry.title}
      </h2>
      <dl className="mb-3 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm leading-5">
        <dt className="pt-0.5 text-muted-foreground">
          <Clock className="h-4 w-4" aria-label="When" />
        </dt>
        <dd>{entryWhen(entry)}</dd>
        {entry.place ? (
          <>
            <dt className="pt-0.5 text-muted-foreground">
              <MapPin className="h-4 w-4" aria-label="Where" />
            </dt>
            <dd>{entry.place}</dd>
          </>
        ) : null}
        {entry.audience === "people" ? (
          <>
            <dt className="pt-0.5 text-muted-foreground">
              <Users className="h-4 w-4" aria-label="For" />
            </dt>
            <dd>
              {selected.peopleNames.length > 0
                ? selected.peopleNames.join(", ")
                : "Nobody who is still in the camp"}
            </dd>
          </>
        ) : null}
        {entry.callUrl ? (
          <>
            <dt className="pt-0.5 text-muted-foreground">
              <Video className="h-4 w-4" aria-label="Video call" />
            </dt>
            <dd>
              <a
                href={entry.callUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Join the call
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {/* A meeting made here keeps its agenda on its note, shown below as
          Markdown; the event's copy (Google's details) would say it twice. */}
      {entry.description &&
      !(entry.kind === "meeting" && entry.source === "app") ? (
        <p className="whitespace-pre-line text-sm leading-[21px] text-foreground/90">
          {entry.description}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {SOURCE_LINE[entry.source]}
      </p>

      {entry.kind === "meeting" ? (
        <Meeting
          eventId={entry.id}
          note={note}
          minutes={entry.meeting?.minutes ?? false}
          past={past}
          canWrite={selected.canWriteMinutes}
          teamLabels={selected.teamLabels}
        />
      ) : selected.canWriteMinutes ? (
        <section className="mt-5 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Was this a meeting? Write its minutes and it becomes one.
          </p>
          <Link
            href={minutesHref(entry.id)}
            className={cn(SMALL_BUTTON, "mt-3")}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Write minutes
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label={title}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className={PIXEL_HEADING}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Meeting({
  eventId,
  note,
  minutes,
  past,
  canWrite,
  teamLabels,
}: {
  eventId: string;
  note: MeetingNote | null;
  minutes: boolean;
  past: boolean;
  canWrite: boolean;
  teamLabels: Record<string, string>;
}) {
  const edit = canWrite ? (
    <Link href={minutesHref(eventId)} className={GHOST_BUTTON}>
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Edit
    </Link>
  ) : null;
  const agenda = note?.agenda ? (
    <MarkdownBody className="text-sm text-foreground">
      {note.agenda}
    </MarkdownBody>
  ) : (
    <p className="text-sm text-muted-foreground">No agenda was written.</p>
  );

  if (!minutes || !note) {
    return (
      <>
        <Section title="Agenda" action={edit}>
          {agenda}
        </Section>
        <Section title="Minutes">
          <div className="border border-dashed border-border p-4 text-sm leading-5 text-muted-foreground">
            {past
              ? canWrite
                ? "No minutes yet. Anyone on this team can write them."
                : "No minutes yet. The team's members write them."
              : "Write the minutes during or after the meeting: notes, decisions, action items and who came."}
            {canWrite ? (
              <div className="mt-3">
                <Link
                  href={minutesHref(eventId)}
                  className={past ? PRIMARY_BUTTON : QUIET_BUTTON}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Write minutes
                </Link>
              </div>
            ) : null}
          </div>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section title="Minutes" action={edit}>
        {note.notes ? (
          <MarkdownBody className="text-sm text-foreground">
            {note.notes}
          </MarkdownBody>
        ) : null}
        {note.decisions.length > 0 ? (
          <>
            <h4 className={cn(SMALL_CAPS, "mb-1.5 mt-3.5")}>Decisions</h4>
            <ol
              aria-label="Decisions"
              className="list-decimal pl-5 text-sm leading-[21px]"
            >
              {note.decisions.map((d) => (
                <li key={d.id} className="mb-1 [overflow-wrap:anywhere]">
                  {d.text}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {note.actionItems.length > 0 ? (
          <>
            <h4 className={cn(SMALL_CAPS, "mb-1.5 mt-3.5")}>Action items</h4>
            <ul
              aria-label="Action items"
              className="flex flex-col border border-border"
            >
              {note.actionItems.map((item) => (
                <ActionItem key={item.id} item={item} teamLabels={teamLabels} />
              ))}
            </ul>
          </>
        ) : null}
        {note.attendees.length > 0 ? (
          <>
            <h4 className={cn(SMALL_CAPS, "mb-1.5 mt-3.5")}>
              Who came ({note.attendees.length})
            </h4>
            <ul aria-label="Who came" className="flex flex-wrap gap-1.5">
              {note.attendees.map((a) => (
                <li
                  key={a.id}
                  className="border border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))] px-2 py-0.5 text-[13px] leading-[18px]"
                >
                  {a.displayName}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>
      <details className="mt-5 border-t border-border pt-4">
        <summary className={cn(PIXEL_HEADING, "cursor-pointer")}>
          Agenda
        </summary>
        <div className="mt-2">{agenda}</div>
      </details>
    </>
  );
}

function ActionItem({
  item,
  teamLabels,
}: {
  item: MeetingNote["actionItems"][number];
  teamLabels: Record<string, string>;
}) {
  const done = item.task?.status === "done";
  const team = item.team ? (teamLabels[item.team] ?? item.team) : "Whole camp";
  return (
    <li className="grid grid-cols-[1.125rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 border-border px-3 py-2.5 text-sm leading-5 [&:not(:first-child)]:border-t">
      <SquareKanban
        aria-hidden
        className={cn("mt-0.5 h-4 w-4", done ? "text-success" : "text-accent")}
      />
      <span
        className={cn(
          "[overflow-wrap:anywhere]",
          done && "text-muted-foreground line-through",
        )}
      >
        {item.text}
        {done ? <span className="sr-only"> (done)</span> : null}
      </span>
      <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-muted-foreground">
        <span>
          {[
            item.assigneeName ?? "Nobody yet",
            team,
            item.dueOn ? `Due ${shortDayLabel(item.dueOn)}` : "No deadline",
          ].join(" · ")}
        </span>
        {item.task ? (
          <Link
            href="/tasks"
            className={cn(
              "border px-1.5 py-0.5 font-semibold hover:underline",
              done
                ? "border-success/60 text-success"
                : "border-border text-foreground",
            )}
          >
            {item.task.status === "cancelled"
              ? "Taken off the task board"
              : `On the board: ${TASK_STATUS_LABEL[item.task.status]}`}
          </Link>
        ) : (
          <span>Goes on the task board when the minutes are saved</span>
        )}
      </span>
    </li>
  );
}
