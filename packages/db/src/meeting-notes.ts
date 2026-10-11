import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  CAMP_TIME_ZONE,
  campDayKey,
  campDayStart,
  canWorkInTeam,
} from "@camp404/core";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";
import { TEAM_NOT_ACTIVE, insertTaskWithin } from "./tasks";

// Meeting notes (#268): the data layer.
//
//  - Every approved member reads every note (the page gates on that).
//  - A team's members this year, and captains, write its notes; a whole-camp
//    note (no team) is a captain's (canWorkInTeam in @camp404/core). Every
//    write re-reads the actor's rank and teams INSIDE its own transaction and
//    locks them (lockTeamWork), so someone taken off the team a moment ago
//    cannot still write. A caller passes only who is acting, never a rank or
//    a team list.
//  - Every action item IS a task on the board (owner, 2026-10-11). Saving the
//    note puts each item that is not on the board yet there, filed under the
//    team the writer picked (an active team, or the whole camp), in the same
//    transaction as the save. Whoever may write the note may do this (the
//    owner accepted it): the board's own add rule (a captain or the team's
//    lead) is not asked. Once on the board, an item's words, person, team and
//    deadline are the task's, changed there: the note reads them live, and a
//    save that changes the words is refused.
//  - An edit is a compare-and-set on `version`: a lost race says so in a
//    sentence, never overwrites.
//
// No audit_log rows: this is team planning data, like the task board, not
// another member's data or camp config.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

type Team = (typeof schema.teamEnum.enumValues)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeetingNoteWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_NOTE_WRITER =
  "Only this team's members and captains can write its meeting notes.";
export const NOT_A_CAMP_NOTE_WRITER =
  "Only captains can write whole-camp meeting notes.";
export const NOTE_GONE = "That meeting note isn't there any more.";
export const NOTE_EDITED =
  "Someone else changed this note while you were editing. Open it again to see their changes.";
export const ATTENDEE_NOT_A_MEMBER =
  "One of the people ticked isn't an approved camp member.";
export const ASSIGNEE_NOT_A_MEMBER =
  "An action item's person isn't an approved camp member.";
export const EVENT_NOT_ON_CALENDAR =
  "That event isn't on the camp calendar any more. Pick another, or none.";
export const ON_THE_BOARD =
  "An action item on the task board was changed here. Change it on the board, or open the meeting again.";
export const MINUTES_STARTED =
  "Someone started this meeting's minutes a moment ago. Open it again to see them.";

/** A refusal thrown inside a transaction, so nothing it wrote is kept. */
class Refusal extends Error {}

function refuse(message: string): never {
  throw new Refusal(message);
}

async function refusing<T extends object>(
  fn: () => Promise<MeetingNoteWriteResult<T>>,
): Promise<MeetingNoteWriteResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    // One note per calendar event (meeting_notes_calendar_event_uniq): two
    // people writing a meeting's first minutes at once, the second loses.
    if (isUniqueViolation(error, "meeting_notes_calendar_event_uniq")) {
      return { ok: false, error: MINUTES_STARTED };
    }
    throw error;
  }
}

/** A unique violation on `constraint`; drizzle nests the PG error in .cause. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error, i = 0; e && i < 4; i++) {
    const pg = e as { code?: string; constraint?: string; cause?: unknown };
    if (pg.code === "23505" && pg.constraint === constraint) return true;
    e = pg.cause;
  }
  return false;
}

// --- Reads ---------------------------------------------------------------

export interface MeetingNoteSummary {
  id: string;
  team: Team | null;
  title: string;
  heldAt: Date;
  /** The meeting's calendar event (its Google id). */
  calendarEventId: string | null;
  /** Whether anything is written in the notes box. */
  notesWritten: boolean;
  /** Action items not yet done on the task board (or not on it yet). */
  openActionItems: number;
  decisions: number;
  actionItems: number;
  /** How many people were ticked as there. */
  attendees: number;
  /** The first thing decided, for a hint of the content; null for none. */
  firstDecision: string | null;
}

/**
 * Meeting notes, newest meeting first: one team's (`team`), the whole camp's
 * (`"camp"`), or every note (undefined). At most `limit`. The Calendar narrows
 * it to the meetings it shows: those whose event is in `eventIds`, or held
 * between `heldFrom` and `heldTo` (an event that has gone from Google).
 */
export async function listMeetingNotes(
  input: {
    team?: Team | "camp";
    limit?: number;
    eventIds?: readonly string[];
    heldFrom?: Date;
    heldTo?: Date;
  } = {},
): Promise<MeetingNoteSummary[]> {
  const db = createHttpDb();
  const n = schema.meetingNotes;
  const teamWhere =
    input.team === undefined
      ? undefined
      : input.team === "camp"
        ? isNull(n.team)
        : eq(n.team, input.team);
  const narrowed =
    input.eventIds !== undefined ||
    input.heldFrom !== undefined ||
    input.heldTo !== undefined;
  const scope = narrowed
    ? or(
        input.eventIds && input.eventIds.length > 0
          ? inArray(n.calendarEventId, [...input.eventIds])
          : undefined,
        input.heldFrom && input.heldTo
          ? and(gte(n.heldAt, input.heldFrom), lt(n.heldAt, input.heldTo))
          : undefined,
        sql`false`,
      )
    : undefined;
  const where = and(teamWhere, scope);
  const query = db
    .select({
      id: n.id,
      team: n.team,
      title: n.title,
      heldAt: n.heldAt,
      calendarEventId: n.calendarEventId,
      notesWritten: sql<boolean>`length(btrim(${n.notes})) > 0`,
      openActionItems: sql<number>`(select count(*)::int from meeting_note_action_items i left join tasks t on t.id = i.task_id where i.note_id = meeting_notes.id and (t.id is null or t.status in ('open', 'in_progress')))`,
      // Plain SQL names: inside a select, drizzle writes a column without its
      // table, which the subquery would read as its own row's id.
      decisions: sql<number>`(select count(*)::int from meeting_note_decisions d where d.note_id = meeting_notes.id)`,
      actionItems: sql<number>`(select count(*)::int from meeting_note_action_items i where i.note_id = meeting_notes.id)`,
      attendees: sql<number>`(select count(*)::int from meeting_note_attendees a where a.note_id = meeting_notes.id)`,
      firstDecision: sql<
        string | null
      >`(select d.text from meeting_note_decisions d where d.note_id = meeting_notes.id order by d.position limit 1)`,
    })
    .from(n)
    .where(where)
    .orderBy(desc(n.heldAt), desc(n.createdAt));
  return input.limit ? await query.limit(input.limit) : await query;
}

export interface MeetingNotePerson {
  id: string;
  displayName: string;
}

export interface MeetingNoteActionItem {
  id: string;
  /** The task's title once it is on the board; the item's words before. */
  text: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /**
   * Where the task is filed: the task's team once it is on the board; the
   * note's team (the editor's default) before. Null is the whole camp.
   */
  team: Team | null;
  /** A camp day, YYYY-MM-DD. */
  dueOn: string | null;
  /** The task it became, live from the board; null while it is not one. */
  task: {
    id: string;
    status: "open" | "in_progress" | "done" | "cancelled";
  } | null;
}

export interface MeetingNote {
  id: string;
  cycle: number;
  team: Team | null;
  title: string;
  heldAt: Date;
  calendarEventId: string | null;
  calendarEventTitle: string | null;
  agenda: string;
  notes: string;
  createdByName: string | null;
  updatedAt: Date;
  version: number;
  attendees: MeetingNotePerson[];
  decisions: { id: string; text: string }[];
  actionItems: MeetingNoteActionItem[];
}

const displayName = (name: string | null) => name?.trim() || "Unnamed member";

/** The task's person, beside the item's own (users joined twice). */
const taskAssignee = alias(schema.users, "task_assignee");

/** The note of the meeting whose calendar event is `calendarEventId`. */
export async function getMeetingNoteByEvent(
  calendarEventId: string,
): Promise<MeetingNote | null> {
  const [row] = await createHttpDb()
    .select({ id: schema.meetingNotes.id })
    .from(schema.meetingNotes)
    .where(eq(schema.meetingNotes.calendarEventId, calendarEventId));
  return row ? getMeetingNote(row.id) : null;
}

/** One note in full, or null when there is no such note. */
export async function getMeetingNote(
  noteId: string,
): Promise<MeetingNote | null> {
  if (!UUID.test(noteId)) return null;
  const db = createHttpDb();
  const n = schema.meetingNotes;
  const [note] = await db
    .select({
      id: n.id,
      cycle: n.cycle,
      team: n.team,
      title: n.title,
      heldAt: n.heldAt,
      calendarEventId: n.calendarEventId,
      calendarEventTitle: n.calendarEventTitle,
      agenda: n.agenda,
      notes: n.notes,
      createdByName: schema.users.displayName,
      updatedAt: n.updatedAt,
      version: n.version,
    })
    .from(n)
    .leftJoin(schema.users, eq(schema.users.id, n.createdByUserId))
    .where(eq(n.id, noteId));
  if (!note) return null;

  const [attendees, decisions, items] = await Promise.all([
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.meetingNoteAttendees)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.meetingNoteAttendees.userId),
      )
      .where(eq(schema.meetingNoteAttendees.noteId, noteId))
      .orderBy(asc(schema.users.displayName), asc(schema.users.id)),
    db
      .select({
        id: schema.meetingNoteDecisions.id,
        text: schema.meetingNoteDecisions.text,
      })
      .from(schema.meetingNoteDecisions)
      .where(eq(schema.meetingNoteDecisions.noteId, noteId))
      .orderBy(asc(schema.meetingNoteDecisions.position)),
    db
      .select({
        id: schema.meetingNoteActionItems.id,
        text: schema.meetingNoteActionItems.text,
        assigneeId: schema.meetingNoteActionItems.assigneeId,
        assigneeName: schema.users.displayName,
        dueOn: schema.meetingNoteActionItems.dueOn,
        taskId: schema.tasks.id,
        taskStatus: schema.tasks.status,
        taskTitle: schema.tasks.title,
        taskTeam: schema.tasks.team,
        taskAssigneeId: schema.tasks.assigneeId,
        taskAssigneeName: taskAssignee.displayName,
        taskDueAt: schema.tasks.dueAt,
      })
      .from(schema.meetingNoteActionItems)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.meetingNoteActionItems.assigneeId),
      )
      .leftJoin(
        schema.tasks,
        eq(schema.tasks.id, schema.meetingNoteActionItems.taskId),
      )
      .leftJoin(taskAssignee, eq(taskAssignee.id, schema.tasks.assigneeId))
      .where(eq(schema.meetingNoteActionItems.noteId, noteId))
      .orderBy(asc(schema.meetingNoteActionItems.position)),
  ]);

  return {
    ...note,
    createdByName: note.createdByName?.trim() || null,
    attendees: attendees.map((a) => ({
      id: a.id,
      displayName: displayName(a.displayName),
    })),
    decisions,
    actionItems: items.map((i) =>
      i.taskId && i.taskStatus
        ? {
            id: i.id,
            text: i.taskTitle ?? i.text,
            assigneeId: i.taskAssigneeId,
            assigneeName: i.taskAssigneeId
              ? displayName(i.taskAssigneeName)
              : null,
            team: i.taskTeam,
            dueOn: i.taskDueAt ? campDayKey(i.taskDueAt) : null,
            task: { id: i.taskId, status: i.taskStatus },
          }
        : {
            id: i.id,
            text: i.text,
            assigneeId: i.assigneeId,
            assigneeName: i.assigneeId ? displayName(i.assigneeName) : null,
            team: note.team,
            dueOn: i.dueOn,
            task: null,
          },
    ),
  };
}

// --- The write rule --------------------------------------------------------

export interface TeamWork {
  rank: "captain" | "team_lead" | "camp_member";
  /** The teams the actor is on this year. */
  memberTeams: Team[];
  cycle: number;
}

/**
 * The actor's rank and teams this year, read and locked inside the write's
 * own transaction (the lockSenderReach pattern): the camp settings row (the
 * year), the actor's user row and their team rows are held until it commits,
 * so a change that committed first is seen and one that comes later waits.
 * Null for someone who is not an approved, current member.
 */
export async function lockTeamWork(
  tx: DbOrTx,
  actorId: string,
): Promise<TeamWork | null> {
  if (!UUID.test(actorId)) return null;
  await tx
    .select({ id: schema.campSettings.id })
    .from(schema.campSettings)
    .for("share");
  const cycle = await currentCycleNumber(tx);
  const [actor] = await tx
    .select({
      rank: schema.users.rank,
      approvalStatus: schema.users.approvalStatus,
      isSystem: schema.users.isSystem,
      sanitised: schema.users.sanitised,
    })
    .from(schema.users)
    .where(eq(schema.users.id, actorId))
    .for("share");
  if (
    !actor ||
    actor.approvalStatus !== "approved" ||
    actor.isSystem ||
    actor.sanitised
  ) {
    return null;
  }
  const teams = await tx
    .select({
      team: schema.teamMemberships.team,
      isLead: schema.teamMemberships.isLead,
    })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, actorId),
        eq(schema.teamMemberships.cycle, cycle),
      ),
    )
    .for("share");
  return {
    rank:
      actor.rank === "captain"
        ? "captain"
        : teams.some((t) => t.isLead)
          ? "team_lead"
          : "camp_member",
    memberTeams: teams.map((t) => t.team),
    cycle,
  };
}

/** The refusal for someone who may not write `team`'s notes, or null. */
export function meetingNoteRefusal(
  work: Pick<TeamWork, "rank" | "memberTeams"> | null,
  team: string | null,
): string | null {
  if (work && canWorkInTeam(work.rank, work.memberTeams, team)) return null;
  return team === null ? NOT_A_CAMP_NOTE_WRITER : NOT_A_NOTE_WRITER;
}

// --- Writes --------------------------------------------------------------

export interface MeetingActionItemWrite {
  /** An item already on the note; null for a new one. */
  id: string | null;
  text: string;
  assigneeId: string | null;
  /** Where its task is filed: an active team, or null for the whole camp. */
  team: Team | null;
  dueOn: string | null;
}

export interface MeetingNoteFields {
  title: string;
  heldAt: Date;
  /**
   * The camp calendar event, as the action found it on the calendar. A null
   * title means the action could not find it: it is kept only when it is the
   * event the note already names.
   */
  calendarEvent: { id: string; title: string | null } | null;
  agenda: string;
  notes: string;
  attendeeIds: readonly string[];
  decisions: readonly string[];
  /**
   * Every action item, in order; each not yet on the board goes there. Left
   * out (an edit only, the Claude connector's), the items stay as they are.
   */
  actionItems?: readonly MeetingActionItemWrite[];
  /**
   * The teams switched on in the camp's config: a task is filed only under
   * one of them, or the whole camp.
   */
  activeTeams: readonly Team[];
}

/** The ids among `ids` that are not approved, current members. */
async function notMembers(
  tx: DbOrTx,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const valid = ids.filter((id) => UUID.test(id));
  const found =
    valid.length === 0
      ? []
      : await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              inArray(schema.users.id, valid),
              eq(schema.users.isSystem, false),
              eq(schema.users.sanitised, false),
              eq(schema.users.approvalStatus, "approved"),
            ),
          );
  const ok = new Set(found.map((r) => r.id));
  return ids.filter((id) => !ok.has(id));
}

/** Write the note's attendees and decisions afresh. */
async function writeLists(
  tx: DbOrTx,
  noteId: string,
  fields: Pick<MeetingNoteFields, "attendeeIds" | "decisions">,
): Promise<void> {
  await tx
    .delete(schema.meetingNoteAttendees)
    .where(eq(schema.meetingNoteAttendees.noteId, noteId));
  if (fields.attendeeIds.length > 0) {
    await tx
      .insert(schema.meetingNoteAttendees)
      .values(fields.attendeeIds.map((userId) => ({ noteId, userId })));
  }
  await tx
    .delete(schema.meetingNoteDecisions)
    .where(eq(schema.meetingNoteDecisions.noteId, noteId));
  if (fields.decisions.length > 0) {
    await tx.insert(schema.meetingNoteDecisions).values(
      fields.decisions.map((text, position) => ({
        noteId,
        position,
        text,
      })),
    );
  }
}

const TASK_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

/** The words a meeting's task carries under its title on the board. */
export function meetingTaskDescription(note: {
  title: string;
  heldAt: Date;
}): string {
  return `From the meeting “${note.title}” on ${TASK_DATE.format(note.heldAt)}.`;
}

/**
 * Put one action item on the task board and link it, inside the save's own
 * transaction: the task takes the item's words, person, team and deadline.
 * The note's write rule has already been checked; the team must be active
 * (or none, the whole camp), and the person an approved member.
 */
async function putOnBoard(
  tx: Tx,
  input: {
    actorId: string;
    itemId: string;
    item: MeetingActionItemWrite;
    note: { title: string; heldAt: Date };
    activeTeams: readonly Team[];
  },
): Promise<void> {
  if (input.item.team && !input.activeTeams.includes(input.item.team)) {
    refuse(TEAM_NOT_ACTIVE);
  }
  const task = await insertTaskWithin(tx, {
    creatorId: input.actorId,
    title: input.item.text,
    description: meetingTaskDescription(input.note),
    team: input.item.team,
    assigneeId: input.item.assigneeId,
    dueAt: input.item.dueOn ? campDayStart(input.item.dueOn) : null,
  });
  if (!task.ok) refuse(task.error);
  const linked = await tx
    .update(schema.meetingNoteActionItems)
    .set({ taskId: task.id })
    .where(
      and(
        eq(schema.meetingNoteActionItems.id, input.itemId),
        isNull(schema.meetingNoteActionItems.taskId),
      ),
    )
    .returning({ id: schema.meetingNoteActionItems.id });
  // The note's row is locked for the save, so nobody else links it; if that
  // ever failed, the task goes back with the save rather than stay unlinked.
  if (linked.length === 0) refuse(NOTE_EDITED);
}

/** Write a note, as one of its team's members or a captain. */
export async function createMeetingNote(
  input: MeetingNoteFields & { actorId: string; team: Team | null },
): Promise<MeetingNoteWriteResult<{ id: string }>> {
  return refusing(() =>
    withTransaction(async (tx) => {
      const work = await lockTeamWork(tx, input.actorId);
      const refusal = meetingNoteRefusal(work, input.team);
      if (refusal || !work) refuse(refusal ?? NOT_A_NOTE_WRITER);

      if (input.calendarEvent && input.calendarEvent.title === null) {
        refuse(EVENT_NOT_ON_CALENDAR);
      }
      if ((await notMembers(tx, input.attendeeIds)).length > 0) {
        refuse(ATTENDEE_NOT_A_MEMBER);
      }
      const actionItems = input.actionItems ?? [];
      const assignees = actionItems
        .map((i) => i.assigneeId)
        .filter((id): id is string => id !== null);
      if ((await notMembers(tx, assignees)).length > 0) {
        refuse(ASSIGNEE_NOT_A_MEMBER);
      }

      const [note] = await tx
        .insert(schema.meetingNotes)
        .values({
          cycle: work.cycle,
          team: input.team,
          title: input.title,
          heldAt: input.heldAt,
          calendarEventId: input.calendarEvent?.id ?? null,
          calendarEventTitle: input.calendarEvent?.title ?? null,
          agenda: input.agenda,
          notes: input.notes,
          createdByUserId: input.actorId,
          updatedByUserId: input.actorId,
        })
        .returning({ id: schema.meetingNotes.id });
      const id = note!.id;
      await writeLists(tx, id, input);
      for (const [position, item] of actionItems.entries()) {
        const [row] = await tx
          .insert(schema.meetingNoteActionItems)
          .values({
            noteId: id,
            position,
            text: item.text,
            assigneeId: item.assigneeId,
            dueOn: item.dueOn,
          })
          .returning({ id: schema.meetingNoteActionItems.id });
        await putOnBoard(tx, {
          actorId: input.actorId,
          itemId: row!.id,
          item,
          note: input,
          activeTeams: input.activeTeams,
        });
      }
      return { ok: true as const, id };
    }),
  );
}

/**
 * Change a note. `version` is the version the editor opened; if someone else
 * saved since, nothing changes and the editor is told.
 *
 * Every action item not on the board yet goes there with this save (a new
 * one, or one saved before every item was a task). One already on the board
 * keeps its words, person, team and deadline (the task is where the work is
 * tracked): only its place in the list moves, a save that changes its words
 * is refused (ON_THE_BOARD), and one left out of the list stays on the note,
 * at the end. An item not on the board that is left out is removed. A person
 * is checked only when they are new to the note, so a note keeps someone who
 * has since left the approved list. With no `actionItems` (the Claude
 * connector's save), the items are left exactly as they are.
 */
export async function editMeetingNote(
  input: MeetingNoteFields & {
    actorId: string;
    noteId: string;
    version: number;
  },
): Promise<MeetingNoteWriteResult<{ version: number }>> {
  if (!UUID.test(input.noteId)) return { ok: false, error: NOTE_GONE };
  return refusing(() =>
    withTransaction(async (tx) => {
      const work = await lockTeamWork(tx, input.actorId);
      const [note] = await tx
        .select({
          team: schema.meetingNotes.team,
          version: schema.meetingNotes.version,
          calendarEventId: schema.meetingNotes.calendarEventId,
          calendarEventTitle: schema.meetingNotes.calendarEventTitle,
        })
        .from(schema.meetingNotes)
        .where(eq(schema.meetingNotes.id, input.noteId))
        .for("update");
      if (!note) refuse(NOTE_GONE);
      const refusal = meetingNoteRefusal(work, note.team);
      if (refusal) refuse(refusal);
      if (note.version !== input.version) refuse(NOTE_EDITED);

      let calendarEventTitle: string | null = null;
      if (input.calendarEvent) {
        if (input.calendarEvent.title !== null) {
          calendarEventTitle = input.calendarEvent.title;
        } else if (input.calendarEvent.id === note.calendarEventId) {
          calendarEventTitle = note.calendarEventTitle;
        } else {
          refuse(EVENT_NOT_ON_CALENDAR);
        }
      }

      const attending = await tx
        .select({ userId: schema.meetingNoteAttendees.userId })
        .from(schema.meetingNoteAttendees)
        .where(eq(schema.meetingNoteAttendees.noteId, input.noteId));
      const already = new Set(attending.map((a) => a.userId));
      const newAttendees = input.attendeeIds.filter((id) => !already.has(id));
      if ((await notMembers(tx, newAttendees)).length > 0) {
        refuse(ATTENDEE_NOT_A_MEMBER);
      }

      const [written] = await tx
        .update(schema.meetingNotes)
        .set({
          title: input.title,
          heldAt: input.heldAt,
          calendarEventId: input.calendarEvent?.id ?? null,
          calendarEventTitle,
          agenda: input.agenda,
          notes: input.notes,
          updatedByUserId: input.actorId,
          updatedAt: new Date(),
          version: sql`${schema.meetingNotes.version} + 1`,
        })
        .where(eq(schema.meetingNotes.id, input.noteId))
        .returning({ version: schema.meetingNotes.version });
      if (!written) refuse(NOTE_GONE);
      await writeLists(tx, input.noteId, input);

      if (input.actionItems) {
        await writeActionItems(tx, {
          actorId: input.actorId,
          noteId: input.noteId,
          note: input,
          items: input.actionItems,
          activeTeams: input.activeTeams,
        });
      }
      // The version THIS save made, from its own UPDATE: a caller that
      // carries it on (voice's list) must never pick up a later save's.
      return { ok: true as const, version: written.version };
    }),
  );
}

/**
 * The action items of an edit: kept, changed, added or removed, in the order
 * sent, and each not on the board yet put there.
 */
async function writeActionItems(
  tx: Tx,
  input: {
    actorId: string;
    noteId: string;
    note: { title: string; heldAt: Date };
    items: readonly MeetingActionItemWrite[];
    activeTeams: readonly Team[];
  },
): Promise<void> {
  const items = await tx
    .select({
      id: schema.meetingNoteActionItems.id,
      assigneeId: schema.meetingNoteActionItems.assigneeId,
      taskId: schema.meetingNoteActionItems.taskId,
      taskTitle: schema.tasks.title,
    })
    .from(schema.meetingNoteActionItems)
    .leftJoin(
      schema.tasks,
      eq(schema.tasks.id, schema.meetingNoteActionItems.taskId),
    )
    .where(eq(schema.meetingNoteActionItems.noteId, input.noteId))
    .orderBy(asc(schema.meetingNoteActionItems.position))
    .for("update", { of: schema.meetingNoteActionItems });
  const saved = new Map(items.map((i) => [i.id, i]));

  // A person is checked only when new to the item, or when the item goes on
  // the board now (the board takes only an approved member).
  const toCheck = input.items
    .filter((i) => {
      if (i.assigneeId === null) return false;
      const before = i.id ? saved.get(i.id) : undefined;
      if (before?.taskId) return false;
      return true;
    })
    .map((i) => i.assigneeId as string);
  if ((await notMembers(tx, toCheck)).length > 0) {
    refuse(ASSIGNEE_NOT_A_MEMBER);
  }

  const sent = new Set<string>();
  let position = 0;
  for (const item of input.items) {
    const before = item.id ? saved.get(item.id) : undefined;
    if (before?.taskId) {
      // Its words are the task's now: the editor sends them back as read.
      if (item.text !== (before.taskTitle ?? item.text)) refuse(ON_THE_BOARD);
      sent.add(before.id);
      await tx
        .update(schema.meetingNoteActionItems)
        .set({ position })
        .where(eq(schema.meetingNoteActionItems.id, before.id));
      position += 1;
      continue;
    }
    let itemId: string;
    if (before) {
      sent.add(before.id);
      itemId = before.id;
      await tx
        .update(schema.meetingNoteActionItems)
        .set({
          position,
          text: item.text,
          assigneeId: item.assigneeId,
          dueOn: item.dueOn,
        })
        .where(eq(schema.meetingNoteActionItems.id, before.id));
    } else {
      const [row] = await tx
        .insert(schema.meetingNoteActionItems)
        .values({
          noteId: input.noteId,
          position,
          text: item.text,
          assigneeId: item.assigneeId,
          dueOn: item.dueOn,
        })
        .returning({ id: schema.meetingNoteActionItems.id });
      itemId = row!.id;
    }
    await putOnBoard(tx, {
      actorId: input.actorId,
      itemId,
      item,
      note: input.note,
      activeTeams: input.activeTeams,
    });
    position += 1;
  }
  for (const item of items) {
    if (sent.has(item.id)) continue;
    if (item.taskId) {
      await tx
        .update(schema.meetingNoteActionItems)
        .set({ position })
        .where(eq(schema.meetingNoteActionItems.id, item.id));
      position += 1;
    } else {
      await tx
        .delete(schema.meetingNoteActionItems)
        .where(eq(schema.meetingNoteActionItems.id, item.id));
    }
  }
}
