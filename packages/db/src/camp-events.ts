import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  campDayStart,
  campEventChangeRefusal,
  campEventGuestIds,
  campEventInviteNotification,
  campEventKindFor,
  campEventWhenText,
  campEventRefusal,
  hasMinutes,
  meetingInstant,
  meetingPostBody,
  MEETING_HAS_MINUTES,
  storedCampEventAudience,
  storedCampEventWhen,
  PICK_SOMEONE,
  type CampEventAudience,
  TELEGRAM_OPEN_BUTTON,
  type CampEventKind,
} from "@camp404/core";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { deliveryValues } from "./deliveries";
import { lockSenderReach } from "./broadcasts";
import { resolveTeamsConfig, teamLabelMap } from "./camp-config";
import { queueTelegramPosts } from "./telegram-posts";
import { currentCycleNumber } from "./cycles";
import { hasNotSaidNotComing } from "./participations";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// The Calendar's own events and meetings (owner, 2026-10-10: "you make events
// in the calendar app"). The data layer.
//
//  - Every approved member reads them (the page gates on that).
//  - A captain, or a lead of the event's team, makes, changes and removes one;
//    a whole-camp event is a captain's (canManageCampEvent / campEventRefusal
//    in @camp404/core, owner's 1A). The rule is read again inside each
//    write's own transaction (lockSenderReach), so a lead who lost the role a
//    moment ago is refused. A change is checked against the event's team
//    before AND after, so a lead cannot move another team's event to theirs.
//  - Every change is a compare-and-set on `version`, audited in the same
//    transaction (the events go on the camp's shared Google Calendar).
//  - The Google mirror is the logistics phases' (#247): the row claims ONE
//    Google event id when it is made, inside the write, before Google is
//    called; the caller then puts the event there with no transaction open,
//    and marks the version it matched (markCampEventCalendarSynced). A
//    removed event keeps its row (removed_at) until its event is off Google.
//  - A meeting's agenda and minutes are its meeting_notes row, linked by the
//    event's Google id. Making a meeting writes the note (with the agenda) in
//    the same transaction; changing it keeps the note's title, team and time
//    in step. A meeting with minutes is never removed.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

type Team = (typeof schema.teamEnum.enumValues)[number];
export type { CampEventAudience };

export type CampEventWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const EVENT_GONE = "That event isn't on the calendar any more.";
export const EVENT_CHANGED =
  "Someone else changed this event while you were editing. Open it again to see their changes.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One event the app made, as the Calendar and the mirror read it. */
export interface CampEventRow {
  id: string;
  cycle: number;
  kind: CampEventKind;
  team: Team | null;
  /** Who it is for: the camp, `team`, the team leads, or `peopleUserIds`. */
  audience: CampEventAudience;
  peopleUserIds: string[];
  /** A video call link the maker pasted, or null. */
  callUrl: string | null;
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  description: string | null;
  calendarEventId: string;
  calendarSyncedVersion: number | null;
  version: number;
  removedAt: Date | null;
  createdByUserId: string | null;
  updatedAt: Date;
}

const e = schema.campEvents;
const COLUMNS = {
  id: e.id,
  cycle: e.cycle,
  kind: e.kind,
  team: e.team,
  audience: e.audience,
  peopleUserIds: e.peopleUserIds,
  callUrl: e.callUrl,
  title: e.title,
  allDay: e.allDay,
  startDate: e.startDate,
  endDate: e.endDate,
  startTime: e.startTime,
  endTime: e.endTime,
  place: e.place,
  description: e.description,
  calendarEventId: e.calendarEventId,
  calendarSyncedVersion: e.calendarSyncedVersion,
  version: e.version,
  removedAt: e.removedAt,
  createdByUserId: e.createdByUserId,
  updatedAt: e.updatedAt,
};

/** A refusal thrown inside a transaction, so nothing it wrote is kept. */
class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<CampEventWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/** The instant a meeting starts: its day and time, or its day's start. */
export function campEventStart(row: {
  startDate: string;
  startTime: string | null;
}): Date {
  return row.startTime
    ? meetingInstant(row.startDate, row.startTime)
    : campDayStart(row.startDate);
}

// --- Reads -------------------------------------------------------------------

/**
 * The events the app made that touch the camp days `from`..`to` (both
 * counted), soonest first. Removed ones only when `withRemoved`.
 */
export async function listCampEvents(input: {
  from: string;
  to: string;
  withRemoved?: boolean;
}): Promise<CampEventRow[]> {
  return createHttpDb()
    .select(COLUMNS)
    .from(e)
    .where(
      and(
        lte(e.startDate, input.to),
        gte(e.endDate, input.from),
        input.withRemoved ? undefined : isNull(e.removedAt),
      ),
    )
    .orderBy(asc(e.startDate), asc(e.startTime), asc(e.createdAt));
}

/** One event the app made, by its Google id; removed ones are not found. */
export async function getCampEvent(
  calendarEventId: string,
): Promise<CampEventRow | null> {
  const [row] = await createHttpDb()
    .select(COLUMNS)
    .from(e)
    .where(and(eq(e.calendarEventId, calendarEventId), isNull(e.removedAt)));
  return row ?? null;
}

/**
 * One row by its own id, removed or not, whatever its sync state: the
 * mirror's follow-up after a newer save. Null only once the row is gone
 * (its removal confirmed by Google).
 */
export async function getCampEventRow(
  id: string,
): Promise<CampEventRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await createHttpDb()
    .select(COLUMNS)
    .from(e)
    .where(eq(e.id, id));
  return row ?? null;
}

/**
 * Every event the camp calendar may not match yet: a save Google did not take,
 * a removal that did not reach it, and the meetings 0108 made from old notes.
 */
export async function listCampEventsToSync(): Promise<CampEventRow[]> {
  return createHttpDb()
    .select(COLUMNS)
    .from(e)
    .where(sql`${e.calendarSyncedVersion} is distinct from ${e.version}`)
    .orderBy(asc(e.updatedAt));
}

// --- Writes ------------------------------------------------------------------

export interface CampEventFields {
  team: Team | null;
  /** Absent: the team's, or the camp's when there is no team. */
  audience?: CampEventAudience;
  /** The people a `people` event is for; ignored for any other. */
  people?: readonly string[];
  /** A pasted video call link; absent or null for none. */
  callUrl?: string | null;
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  description: string | null;
}

/**
 * The actor's reach, read and locked inside the write: undefined for a
 * captain, else the teams they lead this year (none for a member, or for an
 * id that is no member's).
 */
async function lockReach(
  tx: Tx,
  actorId: string,
): Promise<readonly string[] | undefined> {
  return UUID.test(actorId) ? lockSenderReach(tx, actorId) : [];
}

async function assertManager(
  tx: Tx,
  actorId: string,
  team: Team | null,
): Promise<void> {
  const refusal = campEventRefusal(await lockReach(tx, actorId), team);
  if (refusal) refuse(refusal);
}

export { PICK_SOMEONE };

/**
 * Who an event is for, as stored: a team only on a `team` event, and the
 * people only on a `people` one, kept to members who are still here and
 * approved (read inside the write). Refused when a `people` event is left
 * with nobody.
 */
async function storedAudience(
  tx: Tx,
  fields: CampEventFields,
): Promise<{
  team: Team | null;
  audience: CampEventAudience;
  peopleUserIds: string[];
}> {
  // Only a people event reads its members; the rule is core's.
  const asked =
    (fields.audience ?? null) === "people"
      ? [...new Set(fields.people ?? [])].filter((id) => UUID.test(id))
      : [];
  const found =
    asked.length === 0
      ? []
      : await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              inArray(schema.users.id, asked),
              eq(schema.users.sanitised, false),
              eq(schema.users.isSystem, false),
              eq(schema.users.approvalStatus, "approved"),
            ),
          );
  const here = new Set(found.map((r) => r.id));
  const stored = storedCampEventAudience(
    fields,
    asked.filter((id) => here.has(id)),
  );
  if (!stored.ok) refuse(stored.error);
  return {
    team: stored.team,
    audience: stored.audience,
    peopleUserIds: stored.peopleUserIds,
  };
}

/**
 * Who an event is for by name (owner, 2026-10-27): its picked people, or
 * this year's team leads, kept to approved members still here, by name.
 * Nobody for any other event.
 */
async function guestCandidates(
  db: DbOrTx,
  row: { audience: CampEventAudience; peopleUserIds: readonly string[] },
): Promise<{ id: string; name: string }[]> {
  const here = and(
    eq(schema.users.sanitised, false),
    eq(schema.users.isSystem, false),
    eq(schema.users.approvalStatus, "approved"),
  );
  if (row.audience === "people") {
    if (row.peopleUserIds.length === 0) return [];
    const found = await db
      .select({ id: schema.users.id, name: schema.users.displayName })
      .from(schema.users)
      .where(and(inArray(schema.users.id, [...row.peopleUserIds]), here));
    const byId = new Map(
      found.map((r) => [r.id, r.name?.trim() || "Camp member"]),
    );
    return row.peopleUserIds.flatMap((id) =>
      byId.has(id) ? [{ id, name: byId.get(id)! }] : [],
    );
  }
  if (row.audience !== "team_leads") return [];
  const cycle = await currentCycleNumber(db);
  return (
    await db
      .selectDistinct({ id: schema.users.id, name: schema.users.displayName })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.teamMemberships.userId),
      )
      .where(
        and(
          eq(schema.teamMemberships.cycle, cycle),
          eq(schema.teamMemberships.isLead, true),
          here,
          // A group invite: a lead who said Not coming this year is left
          // out (owner, 2026-10-27). Picked people are named one by one, so
          // they are asked whatever they said, as an `individual` send is.
          hasNotSaidNotComing(schema.users.id, cycle),
        ),
      )
      .orderBy(asc(schema.users.displayName))
  ).map((r) => ({ id: r.id, name: r.name?.trim() || "Camp member" }));
}

/**
 * The names an event is for, for its Google details ("For: ..."): Google
 * takes no guests from the camp's service account, so the names say it.
 */
export async function listCampEventGuests(row: {
  audience: CampEventAudience;
  peopleUserIds: readonly string[];
}): Promise<{ id: string; name: string }[]> {
  return guestCandidates(createHttpDb(), row);
}

/** Tell each new guest about the event, in the write's transaction. */
async function inviteGuests(
  tx: Tx,
  row: CampEventRow,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const payload = campEventInviteNotification({
    calendarEventId: row.calendarEventId,
    title: row.title,
    when: campEventWhenText(row),
    forTeamLeads: row.audience === "team_leads",
    callUrl: row.callUrl,
  });
  await tx.insert(schema.notificationDeliveries).values(
    userIds.map((userId) =>
      deliveryValues(payload, {
        userId,
        broadcastId: null,
        channel: "both",
        presentation: "feed",
      }),
    ),
  );
}

function auditMetadata(
  row: CampEventFields & { kind: CampEventKind; audience: CampEventAudience },
) {
  return {
    title: row.title,
    team: row.team,
    kind: row.kind,
    date: row.startDate,
    allDay: row.allDay,
    audience: row.audience,
  };
}

/**
 * Make an event, or a meeting with its agenda, as a captain or a lead of its
 * team. The row claims `newEventId` (a fresh Google id) for life.
 */
export async function createCampEvent(
  input: CampEventFields & {
    actorId: string;
    kind: CampEventKind;
    /** The agenda: when it is not empty, the event is a meeting. */
    agenda: string;
    newEventId: string;
  },
): Promise<CampEventWriteResult<{ row: CampEventRow; noteId: string | null }>> {
  // An event with an agenda is a meeting (owner, 2026-10-11: a meeting
  // starts by adding an event with its agenda); one with none stays plain.
  const kind = campEventKindFor(input.kind, input.agenda);
  return write(async (tx) => {
    const who = await storedAudience(tx, input);
    await assertManager(tx, input.actorId, who.team);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .insert(e)
      .values({
        cycle,
        kind,
        ...who,
        callUrl: input.callUrl ?? null,
        title: input.title,
        ...storedCampEventWhen(input),
        place: input.place,
        description: input.description,
        calendarEventId: input.newEventId,
        createdByUserId: input.actorId,
        updatedByUserId: input.actorId,
      })
      .returning(COLUMNS);
    // The people it is for hear about it (Google takes no guests from us).
    await inviteGuests(
      tx,
      row!,
      campEventGuestIds(
        row!,
        (await guestCandidates(tx, row!)).map((g) => g.id),
        input.actorId,
      ),
    );
    let noteId: string | null = null;
    if (kind === "meeting") {
      const [note] = await tx
        .insert(schema.meetingNotes)
        .values({
          cycle,
          team: who.team,
          title: input.title,
          heldAt: campEventStart(row!),
          calendarEventId: input.newEventId,
          calendarEventTitle: input.title,
          agenda: input.agenda,
          createdByUserId: input.actorId,
          updatedByUserId: input.actorId,
        })
        .returning({ id: schema.meetingNotes.id });
      noteId = note!.id;
    }
    // Ol' Jeb tells the camp's chats about a new meeting, but not one only
    // for people picked by name.
    if (kind === "meeting" && who.audience !== "people") {
      const [settings] = await tx
        .select({ config: schema.campSettings.config })
        .from(schema.campSettings)
        .limit(1);
      const labels = teamLabelMap(resolveTeamsConfig(settings?.config));
      await queueTelegramPosts(tx, {
        kind: "meeting",
        title: `New meeting: ${input.title}`,
        body: meetingPostBody({
          ...row!,
          teamLabel: row!.team ? (labels[row!.team] ?? row!.team) : null,
          audience: row!.audience,
        }),
        refId: null,
        buttonText: TELEGRAM_OPEN_BUTTON,
        buttonPath: `/calendar?view=month&month=${row!.startDate.slice(0, 7)}&event=${encodeURIComponent(input.newEventId)}`,
        dedupe: `meeting:${input.newEventId}`,
      });
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "calendar.event_created",
      target: `calendar_event:${input.newEventId}`,
      metadata: auditMetadata({ ...input, ...who, kind }),
    });
    return { row: row!, noteId };
  });
}

/** How much of a note is minutes, counted now (not from a snapshot). */
async function minutesCounts(
  tx: Tx,
  noteId: string,
): Promise<{ decisions: number; actionItems: number; attendees: number }> {
  const count = async (table: string) => {
    const result = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where note_id = ${noteId}`,
    );
    return Number(result.rows[0]?.n ?? 0);
  };
  return {
    decisions: await count("meeting_note_decisions"),
    actionItems: await count("meeting_note_action_items"),
    attendees: await count("meeting_note_attendees"),
  };
}

/** The row, locked for the write; refused when it is gone. */
async function lockEvent(tx: Tx, calendarEventId: string) {
  const [row] = await tx
    .select(COLUMNS)
    .from(e)
    .where(and(eq(e.calendarEventId, calendarEventId), isNull(e.removedAt)))
    .for("update");
  if (!row) refuse(EVENT_GONE);
  return row;
}

/**
 * Change an event the app made, as a captain or a lead of its team (before
 * and after the change), over the version the form opened. Its type stays.
 * A meeting's note follows its title, team and time.
 */
export async function editCampEvent(
  input: CampEventFields & {
    actorId: string;
    calendarEventId: string;
    expectedVersion: number;
  },
): Promise<CampEventWriteResult<{ row: CampEventRow }>> {
  return write(async (tx) => {
    const before = await lockEvent(tx, input.calendarEventId);
    const who = await storedAudience(tx, input);
    const refusal = campEventChangeRefusal(
      await lockReach(tx, input.actorId),
      before.team,
      who.team,
    );
    if (refusal) refuse(refusal);
    if (before.version !== input.expectedVersion) refuse(EVENT_CHANGED);
    const invitedBefore = new Set(
      campEventGuestIds(
        before,
        (await guestCandidates(tx, before)).map((g) => g.id),
        "",
      ),
    );
    const [row] = await tx
      .update(e)
      .set({
        ...who,
        callUrl: input.callUrl ?? null,
        title: input.title,
        ...storedCampEventWhen(input),
        place: input.place,
        description: input.description,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
        version: sql`${e.version} + 1`,
      })
      .where(and(eq(e.id, before.id), eq(e.version, input.expectedVersion)))
      .returning(COLUMNS);
    if (!row) refuse(EVENT_CHANGED);
    // Someone the change adds (picked, or the event now for the team leads)
    // hears about it; anyone already told does not again.
    await inviteGuests(
      tx,
      row,
      campEventGuestIds(
        row,
        (await guestCandidates(tx, row)).map((g) => g.id),
        input.actorId,
      ).filter((id) => !invitedBefore.has(id)),
    );
    if (row.kind === "meeting") {
      await tx
        .update(schema.meetingNotes)
        .set({
          team: row.team,
          title: row.title,
          heldAt: campEventStart(row),
          calendarEventTitle: row.title,
        })
        .where(eq(schema.meetingNotes.calendarEventId, row.calendarEventId));
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "calendar.event_changed",
      target: `calendar_event:${row.calendarEventId}`,
      metadata: {
        ...auditMetadata(row),
        ...(before.team !== row.team ? { fromTeam: before.team } : {}),
        ...(before.audience !== row.audience
          ? { fromAudience: before.audience }
          : {}),
      },
    });
    return { row };
  });
}

/**
 * Take an event the app made off the calendar, as a captain or a lead of its
 * team, over the version the page showed. A meeting with minutes stays; a
 * meeting with only an agenda goes with its note. The row waits (removed_at)
 * until its Google event is gone.
 */
export async function removeCampEvent(input: {
  actorId: string;
  calendarEventId: string;
  expectedVersion: number;
}): Promise<CampEventWriteResult<{ row: CampEventRow }>> {
  return write(async (tx) => {
    const before = await lockEvent(tx, input.calendarEventId);
    await assertManager(tx, input.actorId, before.team);
    if (before.version !== input.expectedVersion) refuse(EVENT_CHANGED);
    // The note first, locked: a minutes save holds the same lock
    // (editMeetingNote), so one in flight commits first and is counted. The
    // counts are read only AFTER the lock, each in a statement of its own: a
    // subquery in the locking statement would read its snapshot from before
    // the wait, and miss decisions or attendees just saved.
    const [locked] = await tx
      .select({
        id: schema.meetingNotes.id,
        notes: schema.meetingNotes.notes,
      })
      .from(schema.meetingNotes)
      .where(eq(schema.meetingNotes.calendarEventId, before.calendarEventId))
      .for("update");
    const note = locked
      ? { ...locked, ...(await minutesCounts(tx, locked.id)) }
      : null;
    if (note && hasMinutes(note)) refuse(MEETING_HAS_MINUTES);
    if (note) {
      await tx
        .delete(schema.meetingNotes)
        .where(eq(schema.meetingNotes.id, note.id));
    }
    const [row] = await tx
      .update(e)
      .set({
        removedAt: new Date(),
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
        version: sql`${e.version} + 1`,
      })
      .where(and(eq(e.id, before.id), eq(e.version, input.expectedVersion)))
      .returning(COLUMNS);
    if (!row) refuse(EVENT_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "calendar.event_removed",
      target: `calendar_event:${row.calendarEventId}`,
      metadata: auditMetadata(row),
    });
    return { row };
  });
}

/**
 * Give every meeting note that names no calendar event a meeting event of its
 * own, as migration 0108 did: on its day, at its camp time, an hour long (to
 * 23:59 at most), with its team, title, year and writer, not yet on Google
 * (the catch-up puts it there). A note written by the old Meetings pages while
 * a deploy was rolling out is the case. Idempotent: a note is linked only
 * while it still names nothing. Returns how many it linked.
 */
export async function linkUnlinkedMeetingNotes(): Promise<number> {
  return withTransaction(async (tx) => {
    const result = await tx.execute<{ event_id: string }>(sql`
      with picked as (
        select id,
               replace(gen_random_uuid()::text, '-', '') as event_id,
               least(held_at + interval '2 hours',
                     date_trunc('day', held_at + interval '2 hours') + interval '23 hours 58 minutes') as local_at
        from meeting_notes
        where calendar_event_id is null
        for update skip locked
      ), linked as (
        update meeting_notes n
        set calendar_event_id = p.event_id
        from picked p
        where n.id = p.id and n.calendar_event_id is null
        returning n.cycle, n.team, n.title, n.created_by_user_id,
                  n.updated_by_user_id, p.event_id, p.local_at
      )
      insert into camp_events (
        cycle, kind, team, audience, title, all_day, start_date, end_date,
        start_time, end_time, calendar_event_id, calendar_synced_version,
        version, created_by_user_id, updated_by_user_id
      )
      select cycle, 'meeting', team,
             (case when team is null then 'camp' else 'team' end)::camp_event_audience,
             title, false,
             local_at::date, local_at::date,
             to_char(local_at, 'HH24:MI'),
             to_char(least(local_at + interval '1 hour',
                           date_trunc('day', local_at) + interval '23 hours 59 minutes'), 'HH24:MI'),
             event_id, null, 1, created_by_user_id, updated_by_user_id
      from linked
      returning calendar_event_id as event_id
    `);
    return result.rows.length;
  });
}

/**
 * Record that the camp calendar now matches `version` of an event: its Google
 * event is there as saved, or (`removed`) it is gone, and so the row goes. A
 * compare-and-set on the version, so a step that finished after a newer save
 * never marks the newer one as done. True when it was marked.
 */
export async function markCampEventCalendarSynced(input: {
  id: string;
  version: number;
  removed: boolean;
}): Promise<boolean> {
  const db = createHttpDb();
  if (input.removed) {
    const gone = await db
      .delete(e)
      .where(
        and(
          eq(e.id, input.id),
          eq(e.version, input.version),
          sql`${e.removedAt} is not null`,
        ),
      )
      .returning({ id: e.id });
    return gone.length > 0;
  }
  const rows = await db
    .update(e)
    .set({ calendarSyncedVersion: input.version })
    .where(and(eq(e.id, input.id), eq(e.version, input.version)))
    .returning({ id: e.id });
  return rows.length > 0;
}
