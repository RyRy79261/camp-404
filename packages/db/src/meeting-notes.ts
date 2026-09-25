import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { CAMP_TIME_ZONE, campDayStart, canWorkInTeam } from "@camp404/core";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { TEAM_NOT_ACTIVE, addTaskWithin } from "./tasks";

// Meeting notes (#268): the data layer.
//
//  - Every approved member reads every note (the page gates on that).
//  - A team's members this year, and captains, write its notes; a whole-camp
//    note (no team) is a captain's (canWorkInTeam in @camp404/core). Every
//    write re-reads the actor's rank and teams INSIDE its own transaction and
//    locks them (lockTeamWork), so someone taken off the team a moment ago
//    cannot still write. A caller passes only who is acting, never a rank or
//    a team list.
//  - An action item becomes a task through the task board's own add path
//    (addTaskWithin), in the same transaction that links the item to it, so
//    the board's rule decides: a captain, or a lead of the note's team.
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
export const ITEM_GONE = "That action item isn't on the note any more.";
export const ALREADY_A_TASK = "That action item is already on the task board.";

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
    throw error;
  }
}

// --- Reads ---------------------------------------------------------------

export interface MeetingNoteSummary {
  id: string;
  team: Team | null;
  title: string;
  heldAt: Date;
  decisions: number;
  actionItems: number;
}

/**
 * Meeting notes, newest meeting first: one team's (`team`), the whole camp's
 * (`"camp"`), or every note (undefined). At most `limit`.
 */
export async function listMeetingNotes(
  input: { team?: Team | "camp"; limit?: number } = {},
): Promise<MeetingNoteSummary[]> {
  const db = createHttpDb();
  const n = schema.meetingNotes;
  const where =
    input.team === undefined
      ? undefined
      : input.team === "camp"
        ? isNull(n.team)
        : eq(n.team, input.team);
  const query = db
    .select({
      id: n.id,
      team: n.team,
      title: n.title,
      heldAt: n.heldAt,
      // Plain SQL names: inside a select, drizzle writes a column without its
      // table, which the subquery would read as its own row's id.
      decisions: sql<number>`(select count(*)::int from meeting_note_decisions d where d.note_id = meeting_notes.id)`,
      actionItems: sql<number>`(select count(*)::int from meeting_note_action_items i where i.note_id = meeting_notes.id)`,
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
  text: string;
  assigneeId: string | null;
  assigneeName: string | null;
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
    actionItems: items.map((i) => ({
      id: i.id,
      text: i.text,
      assigneeId: i.assigneeId,
      assigneeName: i.assigneeId ? displayName(i.assigneeName) : null,
      dueOn: i.dueOn,
      task:
        i.taskId && i.taskStatus
          ? { id: i.taskId, status: i.taskStatus }
          : null,
    })),
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
  actionItems: readonly MeetingActionItemWrite[];
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
      const assignees = input.actionItems
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
      if (input.actionItems.length > 0) {
        await tx.insert(schema.meetingNoteActionItems).values(
          input.actionItems.map((item, position) => ({
            noteId: id,
            position,
            text: item.text,
            assigneeId: item.assigneeId,
            dueOn: item.dueOn,
          })),
        );
      }
      return { ok: true as const, id };
    }),
  );
}

/**
 * Change a note. `version` is the version the editor opened; if someone else
 * saved since, nothing changes and the editor is told.
 *
 * Action items that are already tasks keep their words (the task is where
 * the work is tracked): only their place in the list moves, and one left out
 * of the list stays on the note, at the end. Other items are saved as sent;
 * one left out is removed. A person is checked only when they are new to the
 * note, so a note keeps someone who has since left the approved list.
 */
export async function editMeetingNote(
  input: MeetingNoteFields & {
    actorId: string;
    noteId: string;
    version: number;
  },
): Promise<MeetingNoteWriteResult> {
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
      const items = await tx
        .select({
          id: schema.meetingNoteActionItems.id,
          position: schema.meetingNoteActionItems.position,
          assigneeId: schema.meetingNoteActionItems.assigneeId,
          taskId: schema.meetingNoteActionItems.taskId,
        })
        .from(schema.meetingNoteActionItems)
        .where(eq(schema.meetingNoteActionItems.noteId, input.noteId))
        .orderBy(asc(schema.meetingNoteActionItems.position))
        .for("update");
      const already = new Set(attending.map((a) => a.userId));
      const newAttendees = input.attendeeIds.filter((id) => !already.has(id));
      if ((await notMembers(tx, newAttendees)).length > 0) {
        refuse(ATTENDEE_NOT_A_MEMBER);
      }
      const saved = new Map(items.map((i) => [i.id, i]));
      const newAssignees = input.actionItems
        .filter(
          (i) =>
            i.assigneeId !== null &&
            (i.id === null || saved.get(i.id)?.assigneeId !== i.assigneeId),
        )
        .map((i) => i.assigneeId as string);
      if ((await notMembers(tx, newAssignees)).length > 0) {
        refuse(ASSIGNEE_NOT_A_MEMBER);
      }

      await tx
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
        .where(eq(schema.meetingNotes.id, input.noteId));
      await writeLists(tx, input.noteId, input);

      // The action items: kept, changed, added or removed, in the order sent.
      const sent = new Set<string>();
      let position = 0;
      for (const item of input.actionItems) {
        const before = item.id ? saved.get(item.id) : undefined;
        if (before) {
          sent.add(before.id);
          await tx
            .update(schema.meetingNoteActionItems)
            .set(
              before.taskId
                ? { position }
                : {
                    position,
                    text: item.text,
                    assigneeId: item.assigneeId,
                    dueOn: item.dueOn,
                  },
            )
            .where(eq(schema.meetingNoteActionItems.id, before.id));
        } else {
          await tx.insert(schema.meetingNoteActionItems).values({
            noteId: input.noteId,
            position,
            text: item.text,
            assigneeId: item.assigneeId,
            dueOn: item.dueOn,
          });
        }
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
      return { ok: true as const };
    }),
  );
}

const TASK_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

/**
 * Put an action item on the task board, and link it, in one transaction. The
 * task board's rule decides (addTaskWithin: a captain, or a lead of the
 * note's team); the task takes the note's team, the item's words, person and
 * deadline. `activeTeams` are the teams switched on in the camp's config: an
 * item on an archived team's note cannot become a task.
 */
export async function turnActionItemIntoTask(input: {
  actorId: string;
  itemId: string;
  activeTeams: readonly Team[];
}): Promise<MeetingNoteWriteResult<{ taskId: string; noteId: string }>> {
  if (!UUID.test(input.itemId)) return { ok: false, error: ITEM_GONE };
  return refusing(() =>
    withTransaction(async (tx) => {
      const [item] = await tx
        .select({
          noteId: schema.meetingNoteActionItems.noteId,
          text: schema.meetingNoteActionItems.text,
          assigneeId: schema.meetingNoteActionItems.assigneeId,
          dueOn: schema.meetingNoteActionItems.dueOn,
          taskId: schema.meetingNoteActionItems.taskId,
        })
        .from(schema.meetingNoteActionItems)
        .where(eq(schema.meetingNoteActionItems.id, input.itemId))
        .for("update");
      if (!item) refuse(ITEM_GONE);
      if (item.taskId) refuse(ALREADY_A_TASK);
      const [note] = await tx
        .select({
          team: schema.meetingNotes.team,
          title: schema.meetingNotes.title,
          heldAt: schema.meetingNotes.heldAt,
        })
        .from(schema.meetingNotes)
        .where(eq(schema.meetingNotes.id, item.noteId));
      if (!note) refuse(ITEM_GONE);
      if (note.team && !input.activeTeams.includes(note.team)) {
        refuse(TEAM_NOT_ACTIVE);
      }

      const task = await addTaskWithin(tx, {
        creatorId: input.actorId,
        title: item.text,
        description: `From the meeting “${note.title}” on ${TASK_DATE.format(note.heldAt)}.`,
        team: note.team,
        assigneeId: item.assigneeId,
        dueAt: item.dueOn ? campDayStart(item.dueOn) : null,
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
      // The row is locked, so this cannot lose; if it ever did, the task is
      // rolled back with it rather than left on the board unlinked.
      if (linked.length === 0) refuse(ALREADY_A_TASK);
      return { ok: true as const, taskId: task.id, noteId: item.noteId };
    }),
  );
}
