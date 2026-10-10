"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, ListChecks, Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";
import { MEETING_NOTE_PRIVACY_REMINDER } from "@camp404/core";
import { MeetingMinutesInput } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { toast } from "@camp404/ui/components/toast";
import {
  DraftRestoredNote,
  useDraftAutosave,
  useEditorDraft,
  type EditorDraft,
} from "@/components/os/editor-draft";
import { saveMinutesAction } from "@/app/(console)/calendar/actions";
import { MarkdownField } from "@/components/markdown/markdown-field";

// A meeting's agenda and minutes (#268; owner, 2026-10-10: a meeting is an
// event on the calendar, with an agenda before and minutes after). The
// meeting's title, team and time are its calendar event's, said in the page's
// heading, never fields here. The fields in cards, the privacy reminder in
// the accent box, then the footer with the one button, kept in sight at the
// bottom of the window (long minutes on a phone are four screens). The agenda
// and the notes are written in the WYSIWYG Markdown editor with a live
// preview (owner, 2026-10-01: never a raw Markdown textarea). The form's own
// check (the Zod shape) is a convenience; the action checks the shape, the
// meeting and the writer again.

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
  agenda: string;
  notes: string;
  attendeeIds: string[];
  decisions: string[];
  actionItems: MeetingEditorItem[];
}

/** Which meeting: its calendar event, its team, and the note's version. */
export interface MinutesTarget {
  eventId: string;
  /** The note's version the editor opened; null for a meeting with none yet. */
  version: number | null;
  /** The meeting's team key; null for a whole-camp meeting. */
  team: string | null;
  teamLabel: string;
  /** Where Save goes back to: the meeting open in the Calendar. */
  returnHref: string;
}

const NOBODY = "__nobody__";

type FieldName = "agenda" | "notes";

// A row's key (and its fields' ids). The rows the form opens with are keyed
// by their place, the same on the server and in the browser (a module counter
// gave each render its own ids, and hydration did not match); a row added
// later takes the next number from the counter, in the browser only.
let keySerial = 0;
const nextKey = () => `row-new-${++keySerial}`;

/**
 * Everything the form holds, as its unsaved draft (editor-draft.tsx): kept in
 * memory across a Back and in this tab's storage across a reload. A draft
 * names the meeting and the version it was typed over, and is thrown away
 * once the note has moved on.
 */
const MeetingDraft = z.object({
  eventId: z.string().max(200),
  version: z.number().int().nullable(),
  agenda: z.string().max(20_000),
  notes: z.string().max(40_000),
  attendeeIds: z.array(z.string().max(200)).max(1_000),
  decisions: z.array(z.string().max(2_000)).max(200),
  actionItems: z
    .array(
      z.object({
        id: z.string().max(200).nullable(),
        text: z.string().max(1_000),
        assigneeId: z.string().max(200).nullable(),
        due: z.string().max(40),
        onBoard: z.boolean(),
      }),
    )
    .max(200),
});
type MeetingDraft = z.infer<typeof MeetingDraft>;

/** The editor's values as a draft; attendees in one order, so equal is equal. */
function meetingDraft(
  target: MinutesTarget,
  values: MeetingEditorValues,
): MeetingDraft {
  return {
    eventId: target.eventId,
    version: target.version,
    agenda: values.agenda,
    notes: values.notes,
    attendeeIds: [...values.attendeeIds].sort(),
    decisions: values.decisions,
    actionItems: values.actionItems.map((i) => ({
      id: i.id,
      text: i.text,
      assigneeId: i.assigneeId,
      due: i.due,
      onBoard: i.onBoard,
    })),
  };
}

/** A draft read back, if it still fits this meeting and its version. */
function parseMeetingDraft(
  raw: unknown,
  target: MinutesTarget,
): MeetingDraft | null {
  const parsed = MeetingDraft.safeParse(raw);
  if (!parsed.success) return null;
  const draft = parsed.data;
  return draft.eventId === target.eventId && draft.version === target.version
    ? draft
    : null;
}

type MeetingEditorProps = {
  target: MinutesTarget;
  initial: MeetingEditorValues;
  /** Everyone who may be ticked or given an action item: approved members. */
  members: MeetingPerson[];
  /** The meeting's team's people this year: ticked from first. */
  teamPeople: string[];
  /** People on the note who are no longer approved members, by name. */
  formerAttendees?: MeetingPerson[];
};

/**
 * The meeting editor. Unsaved input asks before its window goes, survives a
 * Back and a reload in this tab, and comes back with "Unsaved changes
 * restored" and Discard.
 */
export function MinutesEditor(props: MeetingEditorProps) {
  const { target, initial } = props;
  const draft = useEditorDraft({
    editor: "meeting",
    baseline: meetingDraft(target, initial),
    parse: (raw) => parseMeetingDraft(raw, target),
  });
  return <MeetingEditorForm key={draft.generation} {...props} draft={draft} />;
}

function MeetingEditorForm({
  target,
  members,
  teamPeople,
  formerAttendees = [],
  draft,
}: MeetingEditorProps & { draft: EditorDraft<MeetingDraft> }) {
  const router = useRouter();
  // Where the form starts: the saved note, or the draft the member left.
  const initial: MeetingEditorValues = draft.start;
  const [pending, startTransition] = React.useTransition();
  const [agenda, setAgenda] = React.useState(initial.agenda);
  const [notes, setNotes] = React.useState(initial.notes);
  const [attendees, setAttendees] = React.useState(
    () => new Set(initial.attendeeIds),
  );
  const [decisions, setDecisions] = React.useState(() =>
    initial.decisions.map((text, i) => ({ key: `decision-${i}`, text })),
  );
  const [items, setItems] = React.useState(() =>
    initial.actionItems.map((item, i) => ({ ...item, key: `item-${i}` })),
  );
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);

  // What is typed now, against what is saved: the guard, the kept draft and
  // this tab's autosave (editor-draft.tsx).
  const { saved: markSaved } = useDraftAutosave(
    draft,
    meetingDraft(target, {
      agenda,
      notes,
      attendeeIds: [...attendees],
      decisions: decisions.map((d) => d.text),
      actionItems: items.map(({ key: _key, ...item }) => item),
    }),
  );

  const teamKey = target.team;
  const teamLabel = target.teamLabel;

  // The team's people first, then everyone else; someone on the note who is no
  // longer on the approved list shows in a group of their own, so they can be
  // unticked.
  const known = new Map(members.map((m) => [m.id, m]));
  const onTeam = new Set(teamKey ? teamPeople : []);
  const teamRows = members.filter((m) => onTeam.has(m.id));
  const otherRows = members.filter((m) => !onTeam.has(m.id));
  const gone = formerAttendees.filter((p) => !known.has(p.id));
  const othersTicked = otherRows.filter((m) => attendees.has(m.id)).length;

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
      eventId: target.eventId,
      version: target.version,
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
    const parsed = MeetingMinutesInput.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      let other: string | null = null;
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (key === "agenda" || key === "notes") {
          next[key] ??= issue.message;
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
      const result = await saveMinutesAction(body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      markSaved();
      toast.success("Minutes saved");
      router.push(target.returnHref);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-6">
      <DraftRestoredNote draft={draft} disabled={pending} />
      <div className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm text-foreground">
          {MEETING_NOTE_PRIVACY_REMINDER}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <Field label="Agenda" error={fieldErrors.agenda}>
            <MarkdownField
              label="Agenda"
              value={agenda}
              onChange={setAgenda}
              disabled={pending}
              emptyPreview="No agenda yet."
            />
          </Field>

          <Field label="Notes" error={fieldErrors.notes}>
            <MarkdownField
              label="Notes"
              value={notes}
              onChange={setNotes}
              disabled={pending}
              minHeight="min-h-48"
              emptyPreview="What was said goes here."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who was there</CardTitle>
          <CardDescription>
            {teamKey
              ? `On ${teamLabel} this year first, then anyone else.`
              : "Anyone in camp."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <section
            aria-label={teamKey ? `On ${teamLabel} this year` : "Whole camp"}
          >
            {teamKey && teamRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody is on this team yet this year.
              </p>
            ) : (
              <div className="grid gap-2 page-sm:grid-cols-2">
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
              <div className="grid gap-2 pt-3 page-sm:grid-cols-2">
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
              <div className="grid gap-2 page-sm:grid-cols-2">
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
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <span className="text-sm font-medium leading-none">
                      Action item {index + 1}
                    </span>
                    <span className="flex items-start gap-2 text-sm [overflow-wrap:anywhere]">
                      <ListChecks
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden
                      />
                      {item.text}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      On the task board: change it there.
                    </span>
                  </li>
                ) : (
                  <li
                    key={item.key}
                    className="grid gap-3 rounded-lg border border-border p-3 page-sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto] page-sm:items-start"
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
                      className="justify-self-end page-sm:self-end"
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

      {/* Kept at the bottom of the window while the form scrolls, so Save is
          in reach on a phone without scrolling to the end. */}
      <div
        data-testid="meeting-save-bar"
        className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t border-border bg-background px-1 py-3 page-sm:flex-row page-sm:items-center page-sm:justify-between"
      >
        <p className="text-xs text-muted-foreground">
          {teamKey
            ? `Every member can read it on the Calendar and on the ${teamLabel} page.`
            : "Every member can read it on the Calendar."}
        </p>
        <Button type="submit" disabled={pending} className="shrink-0">
          <Save aria-hidden />
          {pending ? "Saving…" : "Save minutes"}
        </Button>
      </div>
    </form>
  );
}
