"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Info,
  Plus,
  Save,
  Sparkles,
  SquareKanban,
  Trash2,
  X,
} from "lucide-react";
import { z } from "zod";
import { useWindowDirty } from "@camp404/os";
import {
  MEETING_NOTE_PRIVACY_REMINDER,
  type MeetingSuggestions,
} from "@camp404/core";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  saveMinutesAction,
  suggestMeetingItemsAction,
} from "@/app/(console)/calendar/actions";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { shortDayLabel } from "@/lib/calendar-month";
import { TASK_STATUS_LABEL } from "@/lib/meeting-notes-view";

// A meeting's agenda and minutes (#268; owner, 2026-10-10: a meeting is an
// event on the calendar, with an agenda before and minutes after). The
// meeting's title, team and time are its calendar event's, said in the page's
// heading, never fields here. Every action item is a task on the board (owner,
// 2026-10-11): a row has its words, a person, the team whose board it goes on
// (the meeting's by default, Whole camp allowed) and a deadline, and Save
// meeting puts each new one there; one already there shows how it stands and
// is changed on the board. "Find decisions and action items" asks Claude to
// read the agenda and notes and propose rows, shown as dashed "Suggested"
// rows with Keep and Drop: nothing is kept until Keep, and nothing stored
// until Save meeting. The fields in cards, the privacy reminder in
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

type TaskStatus = keyof typeof TASK_STATUS_LABEL;

export interface MeetingEditorItem {
  /** Null for an item not saved yet. */
  id: string | null;
  text: string;
  assigneeId: string | null;
  /** The team whose board its task is on: a key, or null (whole camp). */
  team: string | null;
  due: string;
  /** Already a task on the board: it is changed there, not here. */
  onBoard: boolean;
  /** Its task's column, when it is on the board. */
  status: TaskStatus | null;
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
const WHOLE_CAMP = "__camp__";

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
        team: z.string().max(100).nullable(),
        due: z.string().max(40),
        onBoard: z.boolean(),
        status: z.enum(["open", "in_progress", "done", "cancelled"]).nullable(),
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
      team: i.team,
      due: i.due,
      onBoard: i.onBoard,
      status: i.status,
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
  /** The active teams a task may be filed under. */
  teams: { value: string; label: string }[];
  /** Every team's name by key, archived ones too, for rows on the board. */
  teamLabels: Record<string, string>;
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
  teams,
  teamLabels,
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

  // Claude's proposals: in this editor only, never in the draft or the save.
  const [finding, startFinding] = React.useTransition();
  const [found, setFound] = React.useState<FoundState>({ kind: "idle" });
  const [suggestedDecisions, setSuggestedDecisions] = React.useState<
    SuggestedDecisionRow[]
  >([]);
  const [suggestedItems, setSuggestedItems] = React.useState<
    SuggestedItemRow[]
  >([]);

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

  // Suggestions are never stored, but losing them unasked wastes one of the
  // member's asks: close, minimise, a switch or a link asks first while any
  // are on screen (a Back, which cannot ask, drops them).
  const settleSuggestions = useWindowDirty(
    suggestedDecisions.length + suggestedItems.length > 0,
    SUGGESTIONS_PENDING,
  );

  const teamKey = target.team;
  const teamLabel = target.teamLabel;
  // A new action item is filed where the meeting is, when that team is active.
  const defaultTeam =
    teamKey && teams.some((t) => t.value === teamKey) ? teamKey : null;
  const labelOf = (team: string | null) =>
    team ? (teamLabels[team] ?? team) : "Whole camp";

  // The team's people first, then everyone else; someone on the note who is no
  // longer on the approved list shows in a group of their own, so they can be
  // unticked.
  const known = new Map(members.map((m) => [m.id, m]));
  const onTeam = new Set(teamKey ? teamPeople : []);
  const teamRows = members.filter((m) => onTeam.has(m.id));
  const otherRows = members.filter((m) => !onTeam.has(m.id));
  const gone = formerAttendees.filter((p) => !known.has(p.id));
  const othersTicked = otherRows.filter((m) => attendees.has(m.id)).length;
  const nameOf = (id: string | null) =>
    id ? (known.get(id)?.displayName ?? "Someone no longer approved") : null;

  function toggle(id: string, on: boolean) {
    setAttendees((before) => {
      const next = new Set(before);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function patchItem(key: string, patch: Partial<MeetingEditorItem>) {
    setItems((all) => all.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function findSuggestions() {
    setFound({ kind: "loading" });
    startFinding(async () => {
      const result = await suggestMeetingItemsAction({
        eventId: target.eventId,
        agenda,
        notes,
        attendeeIds: [...attendees],
        decisions: decisions
          .map((d) => d.text.trim())
          .filter(Boolean)
          .slice(0, 50),
        actionItems: items
          .map((i) => i.text.trim())
          .filter(Boolean)
          .slice(0, 50),
      }).catch(() => null);
      if (!result || !result.ok) {
        setFound({ kind: "error", message: result?.error ?? FIND_FAILED });
        return;
      }
      const s: MeetingSuggestions = result.data;
      setSuggestedDecisions(
        s.decisions.map((d) => ({ key: nextKey(), text: d.text })),
      );
      setSuggestedItems(
        s.actionItems.map((i) => ({
          key: nextKey(),
          text: i.text,
          assigneeId: i.assigneeId,
          unmatchedName: i.unmatchedName,
          team: i.team,
          due: i.due ?? "",
          dueSaid: i.dueSaid,
        })),
      );
      setFound({
        kind: "ready",
        decisions: s.decisions.length,
        actionItems: s.actionItems.length,
        alreadyThere: s.alreadyThere,
      });
    });
  }

  function keepDecisions(keys: readonly string[]) {
    const keep = suggestedDecisions.filter((d) => keys.includes(d.key));
    setDecisions((all) => [
      ...all,
      ...keep.map((d) => ({ key: nextKey(), text: d.text })),
    ]);
    setSuggestedDecisions((all) => all.filter((d) => !keys.includes(d.key)));
  }

  function keepItems(keys: readonly string[]) {
    const keep = suggestedItems.filter((i) => keys.includes(i.key));
    setItems((all) => [
      ...all,
      ...keep.map((i) => ({
        key: nextKey(),
        id: null,
        text: i.text,
        assigneeId: i.assigneeId,
        team: i.team,
        due: i.due,
        onBoard: false,
        status: null,
      })),
    ]);
    setSuggestedItems((all) => all.filter((i) => !keys.includes(i.key)));
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
          team: i.team,
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
      settleSuggestions();
      toast.success("Meeting saved");
      router.push(target.returnHref);
      router.refresh();
    });
  }

  const busy = pending || finding;

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

      <FindPanel found={found} busy={busy} onFind={findSuggestions} />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">Decisions</CardTitle>
          {suggestedDecisions.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                keepDecisions(suggestedDecisions.map((d) => d.key))
              }
              disabled={pending}
            >
              <Check aria-hidden />
              Keep all {suggestedDecisions.length}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {decisions.length === 0 && suggestedDecisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              One short line for each thing the meeting settled.
            </p>
          ) : null}
          {decisions.length > 0 ? (
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
          ) : null}
          {suggestedDecisions.length > 0 ? (
            <ul
              className="flex flex-col gap-2"
              aria-label="Suggested decisions"
            >
              {suggestedDecisions.map((d) => (
                <SuggestedRow
                  key={d.key}
                  text={d.text}
                  onKeep={() => keepDecisions([d.key])}
                  onDrop={() =>
                    setSuggestedDecisions((all) =>
                      all.filter((x) => x.key !== d.key),
                    )
                  }
                  disabled={pending}
                />
              ))}
            </ul>
          ) : null}
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
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">Action items</CardTitle>
            <CardDescription>
              Each one is a task: Save meeting puts it on the board, under its
              team.
            </CardDescription>
          </div>
          {suggestedItems.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => keepItems(suggestedItems.map((i) => i.key))}
              disabled={pending}
            >
              <Check aria-hidden />
              Keep all {suggestedItems.length}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {items.length === 0 && suggestedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Who does what next, under which team, by when.
            </p>
          ) : null}
          {items.length > 0 ? (
            <ol className="flex flex-col gap-3" aria-label="Action items">
              {items.map((item, index) =>
                item.onBoard ? (
                  <li
                    key={item.key}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-none">
                        Action item {index + 1}
                      </span>
                      {item.status ? (
                        <span className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs font-semibold">
                          <SquareKanban className="h-3.5 w-3.5" aria-hidden />
                          {item.status === "cancelled"
                            ? "Taken off the task board"
                            : `On the board: ${TASK_STATUS_LABEL[item.status]}`}
                        </span>
                      ) : null}
                    </div>
                    <span className="flex items-start gap-2 text-sm [overflow-wrap:anywhere]">
                      <SquareKanban
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden
                      />
                      {item.text}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        nameOf(item.assigneeId) ?? "Nobody yet",
                        labelOf(item.team),
                        item.due
                          ? `Due ${shortDayLabel(item.due)}`
                          : "No deadline",
                      ].join(" · ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      On the task board: change it there.
                    </span>
                  </li>
                ) : (
                  <li
                    key={item.key}
                    className="flex flex-col gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-end gap-2">
                      <Field
                        label={`Action item ${index + 1}`}
                        htmlFor={`item-text-${item.key}`}
                        className="min-w-0 flex-1"
                      >
                        <Input
                          id={`item-text-${item.key}`}
                          value={item.text}
                          maxLength={120}
                          placeholder="e.g. Buy the gas"
                          onChange={(e) =>
                            patchItem(item.key, { text: e.target.value })
                          }
                          disabled={pending}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove action item ${index + 1}`}
                        onClick={() =>
                          setItems((all) =>
                            all.filter((x) => x.key !== item.key),
                          )
                        }
                        disabled={pending}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                    <ItemFields
                      idPrefix={item.key}
                      assigneeId={item.assigneeId}
                      team={item.team}
                      due={item.due}
                      members={members}
                      there={attendees}
                      teams={teams}
                      labelOf={labelOf}
                      onChange={(patch) => patchItem(item.key, patch)}
                      disabled={pending}
                    />
                    {item.id ? (
                      <p className="text-xs text-muted-foreground">
                        Not on the task board. Change it, and Save meeting puts
                        it there.
                      </p>
                    ) : null}
                  </li>
                ),
              )}
            </ol>
          ) : null}
          {suggestedItems.length > 0 ? (
            <ul
              className="flex flex-col gap-2"
              aria-label="Suggested action items"
            >
              {suggestedItems.map((i) => (
                <SuggestedRow
                  key={i.key}
                  text={i.text}
                  onKeep={() => keepItems([i.key])}
                  onDrop={() =>
                    setSuggestedItems((all) =>
                      all.filter((x) => x.key !== i.key),
                    )
                  }
                  disabled={pending}
                >
                  <ItemFields
                    idPrefix={i.key}
                    assigneeId={i.assigneeId}
                    unmatchedName={i.unmatchedName}
                    team={i.team}
                    due={i.due}
                    dueSaid={i.dueSaid}
                    members={members}
                    there={attendees}
                    teams={teams}
                    labelOf={labelOf}
                    onChange={(patch) =>
                      setSuggestedItems((all) =>
                        all.map((x) =>
                          x.key === i.key
                            ? {
                                ...x,
                                ...patch,
                                // A person picked answers "Who is this?".
                                unmatchedName:
                                  "assigneeId" in patch
                                    ? null
                                    : x.unmatchedName,
                                // A date changed is the writer's, not the notes'.
                                dueSaid: "due" in patch ? null : x.dueSaid,
                              }
                            : x,
                        ),
                      )
                    }
                    disabled={pending}
                  />
                </SuggestedRow>
              ))}
            </ul>
          ) : null}
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
                  team: defaultTeam,
                  due: "",
                  onBoard: false,
                  status: null,
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
          {pending ? "Saving…" : "Save meeting"}
        </Button>
      </div>
    </form>
  );
}

const SUGGESTIONS_PENDING =
  "Claude's suggestions are not kept yet. Leave without keeping them? They will be lost.";

const FIND_FAILED =
  "Claude could not read the notes. Your notes are safe. Try again.";

type FoundState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      decisions: number;
      actionItems: number;
      alreadyThere: { decisions: number; actionItems: number };
    };

interface SuggestedDecisionRow {
  key: string;
  text: string;
}

interface SuggestedItemRow {
  key: string;
  text: string;
  assigneeId: string | null;
  /** The name the notes give when it matched nobody: "Who is this?". */
  unmatchedName: string | null;
  team: string | null;
  due: string;
  /** The notes' words the date came from, shown as "From “…”". */
  dueSaid: string | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Claude suggests 5 decisions and 7 action items." */
function foundSentence(f: Extract<FoundState, { kind: "ready" }>): string {
  if (f.decisions === 0 && f.actionItems === 0) {
    return "Claude found nothing new to suggest.";
  }
  return `Claude suggests ${plural(f.decisions, "decision", "decisions")} and ${plural(f.actionItems, "action item", "action items")}.`;
}

/** "1 action item was already there." or null. */
function alreadySentence(a: {
  decisions: number;
  actionItems: number;
}): string | null {
  const parts = [
    a.decisions > 0 ? plural(a.decisions, "decision", "decisions") : null,
    a.actionItems > 0
      ? plural(a.actionItems, "action item", "action items")
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const total = a.decisions + a.actionItems;
  return `${parts.join(" and ")} ${total === 1 ? "was" : "were"} already there.`;
}

/** The "Let Claude read the notes" box: its button, and how it went. */
function FindPanel({
  found,
  busy,
  onFind,
}: {
  found: FoundState;
  busy: boolean;
  onFind: () => void;
}) {
  const heading =
    found.kind === "loading"
      ? "Reading the notes…"
      : found.kind === "ready"
        ? foundSentence(found)
        : found.kind === "error"
          ? found.message
          : "Let Claude read the notes";
  const detail =
    found.kind === "ready"
      ? [alreadySentence(found.alreadyThere), "Keep what is right, below."]
          .filter(Boolean)
          .join(" ")
      : found.kind === "idle"
        ? "It suggests the decisions and the action items. Nothing is added until you keep it."
        : null;
  return (
    <section
      aria-label="Find decisions and action items"
      aria-busy={found.kind === "loading"}
      className="flex flex-col gap-3 rounded-lg border border-primary/50 bg-primary/10 p-4 page-sm:flex-row page-sm:items-center page-sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden
        />
        <div className="flex flex-col gap-0.5">
          <p
            className={
              found.kind === "error"
                ? "text-sm font-semibold text-destructive"
                : "text-sm font-semibold"
            }
            role={found.kind === "error" ? "alert" : "status"}
          >
            {heading}
          </p>
          {detail ? (
            <p className="text-sm text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        onClick={onFind}
        disabled={busy}
      >
        <Sparkles aria-hidden />
        {found.kind === "ready"
          ? "Find again"
          : found.kind === "error"
            ? "Try again"
            : "Find decisions and action items"}
      </Button>
    </section>
  );
}

/**
 * One of Claude's proposals: dashed, marked Suggested, with Keep (the same
 * place on every row) and a quiet Drop.
 */
function SuggestedRow({
  text,
  onKeep,
  onDrop,
  disabled,
  children,
}: {
  text: string;
  onKeep: () => void;
  onDrop: () => void;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-suggested
      className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/70 p-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="self-start border border-primary/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Suggested
          </span>
          <span className="text-sm [overflow-wrap:anywhere]">{text}</span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onKeep}
          disabled={disabled}
          aria-label={`Keep “${text}”`}
        >
          <Check aria-hidden />
          Keep
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDrop}
          disabled={disabled}
          aria-label={`Drop “${text}”`}
        >
          <X aria-hidden />
        </Button>
      </div>
      {children}
    </li>
  );
}

const GROUP_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** An action item's person, team and deadline. */
function ItemFields({
  idPrefix,
  assigneeId,
  unmatchedName = null,
  team,
  due,
  dueSaid = null,
  members,
  there,
  teams,
  labelOf,
  onChange,
  disabled,
}: {
  idPrefix: string;
  assigneeId: string | null;
  unmatchedName?: string | null;
  team: string | null;
  due: string;
  dueSaid?: string | null;
  members: MeetingPerson[];
  /** Who is ticked as there: listed first, the likely people. */
  there: ReadonlySet<string>;
  teams: { value: string; label: string }[];
  labelOf: (team: string | null) => string;
  onChange: (patch: {
    assigneeId?: string | null;
    team?: string | null;
    due?: string;
  }) => void;
  disabled: boolean;
}) {
  const known = new Set(members.map((m) => m.id));
  const asking = unmatchedName !== null && assigneeId === null;
  const wasThere = members.filter((m) => there.has(m.id));
  const everyoneElse = members.filter((m) => !there.has(m.id));
  return (
    <div className="grid gap-3 page-sm:grid-cols-3">
      <Field
        label="Who"
        htmlFor={`item-who-${idPrefix}`}
        help={asking ? `The notes say “${unmatchedName}”` : undefined}
      >
        <Select
          value={asking ? undefined : (assigneeId ?? NOBODY)}
          onValueChange={(next) =>
            onChange({ assigneeId: next === NOBODY ? null : next })
          }
          disabled={disabled}
        >
          <SelectTrigger
            id={`item-who-${idPrefix}`}
            className={asking ? "border-warning text-warning" : undefined}
          >
            <SelectValue placeholder="Who is this? Pick" />
          </SelectTrigger>
          <SelectContent>
            {assigneeId && !known.has(assigneeId) ? (
              <SelectItem value={assigneeId}>
                Someone no longer approved
              </SelectItem>
            ) : null}
            {wasThere.length > 0 ? (
              <SelectGroup>
                <SelectLabel className={GROUP_LABEL}>Who was there</SelectLabel>
                {wasThere.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {everyoneElse.length > 0 ? (
              <SelectGroup>
                {wasThere.length > 0 ? (
                  <SelectLabel className={GROUP_LABEL}>
                    Everyone else
                  </SelectLabel>
                ) : null}
                {everyoneElse.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            <SelectItem value={NOBODY}>Nobody yet</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Team" htmlFor={`item-team-${idPrefix}`}>
        <Select
          value={team ?? WHOLE_CAMP}
          onValueChange={(next) =>
            onChange({ team: next === WHOLE_CAMP ? null : next })
          }
          disabled={disabled}
        >
          <SelectTrigger id={`item-team-${idPrefix}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WHOLE_CAMP}>Whole camp</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
            {team && !teams.some((t) => t.value === team) ? (
              <SelectItem value={team}>
                {labelOf(team)} (switched off)
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Due"
        htmlFor={`item-due-${idPrefix}`}
        help={dueSaid && due ? `From “${dueSaid}”` : undefined}
      >
        <DateControl
          id={`item-due-${idPrefix}`}
          value={due}
          onChange={(e) => onChange({ due: e.target.value })}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
