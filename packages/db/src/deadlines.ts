import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  afrikaburnDate,
  afrikaburnDateMayBeSkipped,
  canManageDeadlines,
} from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The year's AfrikaBurn deadlines (owner, 2026-09-30: "Captains add however
// those dates might not be known at the same time, this should be under the
// years settings page"). The data layer.
//
//  - Every member reads them.
//  - Only a captain writes (canManageDeadlines), re-read inside the write's
//    own transaction (lockSenderReach), so a demotion that committed first is
//    seen. A caller passes only who is acting.
//  - Every change is a compare-and-set on `version` and audited in the same
//    transaction: the deadlines go onto the camp's shared Google Calendar,
//    which is camp config.
//  - The camp calendar mirror is the logistics phases' (#247): a deadline
//    claims ONE Google event id the first time it has a date, inside the
//    write, before Google is called, so a re-save or a retry never makes a
//    second event. A removed deadline keeps its row (removed_at) until its
//    event is off the calendar, so a failed delete is not lost; one that
//    never had an event goes at once.
//
//  - AfrikaBurn's standard dates (owner, 2026-10-01) are rows with a `kind`,
//    at most one per year each (a partial unique index), written the first
//    time a captain sets one (setAfrikaburnDate). They are changed, never
//    removed: editDeadline and removeDeadline touch "Other" rows only.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type DeadlineWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_DEADLINE_KEEPER =
  "Only captains can change the AfrikaBurn deadlines.";
export const DEADLINE_CHANGED =
  "Someone changed this deadline first. Reload the page.";
/** The most deadlines one year may hold: a guard, not a plan. */
export const MAX_DEADLINES = 60;
export const TOO_MANY_DEADLINES = `A year holds at most ${MAX_DEADLINES} deadlines.`;
export const DATE_SET_FIRST = "Someone set this date first. Reload the page.";
export const NOT_AN_AFRIKABURN_DATE = "That isn't one of AfrikaBurn's dates.";
export const CANNOT_SKIP_DATE =
  "Only the second DDT round can be marked as no round this year.";
export const PICK_THE_DATE = "Pick the date.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One deadline, as the pages and the calendar step read it. */
export interface DeadlineRow {
  id: string;
  cycle: number;
  /** Which standard AfrikaBurn date; null for an "Other" one. */
  kind: string | null;
  title: string;
  dueDate: string | null;
  note: string | null;
  done: boolean;
  /** "No round this year": no day, and nothing on the calendar. */
  skipped: boolean;
  calendarEventId: string | null;
  calendarSyncedVersion: number | null;
  version: number;
  /** Set once a captain removed it; the row waits for its event to go. */
  removedAt: Date | null;
}

const COLUMNS = {
  id: schema.afrikaburnDeadlines.id,
  cycle: schema.afrikaburnDeadlines.cycle,
  kind: schema.afrikaburnDeadlines.kind,
  title: schema.afrikaburnDeadlines.title,
  dueDate: schema.afrikaburnDeadlines.dueDate,
  note: schema.afrikaburnDeadlines.note,
  done: schema.afrikaburnDeadlines.done,
  skipped: schema.afrikaburnDeadlines.skipped,
  calendarEventId: schema.afrikaburnDeadlines.calendarEventId,
  calendarSyncedVersion: schema.afrikaburnDeadlines.calendarSyncedVersion,
  version: schema.afrikaburnDeadlines.version,
  removedAt: schema.afrikaburnDeadlines.removedAt,
};

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<DeadlineWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

async function assertKeeper(tx: Tx, actorId: string): Promise<void> {
  if (!UUID.test(actorId)) refuse(NOT_A_DEADLINE_KEEPER);
  const reach = await lockSenderReach(tx, actorId);
  if (!canManageDeadlines(reachRank(reach))) refuse(NOT_A_DEADLINE_KEEPER);
}

// --- Reads -------------------------------------------------------------------

/**
 * This year's deadlines, soonest first; those with no date yet after them.
 * Removed ones only when `withRemoved` (the calendar catch-up).
 */
export async function listDeadlines(
  cycle?: number,
  options: { withRemoved?: boolean } = {},
): Promise<DeadlineRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  return db
    .select(COLUMNS)
    .from(schema.afrikaburnDeadlines)
    .where(
      and(
        eq(schema.afrikaburnDeadlines.cycle, year),
        options.withRemoved
          ? undefined
          : isNull(schema.afrikaburnDeadlines.removedAt),
      ),
    )
    .orderBy(
      sql`${schema.afrikaburnDeadlines.dueDate} asc nulls last`,
      asc(schema.afrikaburnDeadlines.createdAt),
    );
}

// --- Writes ------------------------------------------------------------------

interface DeadlineWords {
  title: string;
  dueDate: string | null;
  note: string | null;
}

/**
 * Add a deadline for this year, as a captain. `newEventId` is claimed when it
 * has a date. Returns the row as saved, for the calendar step.
 */
export async function addDeadline(
  input: DeadlineWords & { actorId: string; newEventId: string },
): Promise<DeadlineWriteResult<{ row: DeadlineRow }>> {
  return write(async (tx) => {
    await assertKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.afrikaburnDeadlines)
      .where(
        and(
          eq(schema.afrikaburnDeadlines.cycle, cycle),
          isNull(schema.afrikaburnDeadlines.removedAt),
        ),
      );
    if (count >= MAX_DEADLINES) refuse(TOO_MANY_DEADLINES);
    const [row] = await tx
      .insert(schema.afrikaburnDeadlines)
      .values({
        cycle,
        title: input.title,
        dueDate: input.dueDate,
        note: input.note,
        calendarEventId: input.dueDate ? input.newEventId : null,
        createdByUserId: input.actorId,
        updatedByUserId: input.actorId,
      })
      .returning(COLUMNS);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.deadline_added",
      target: `afrikaburn_deadline:${row!.id}`,
      metadata: { cycle, title: input.title, dueDate: input.dueDate },
    });
    return { row: row! };
  });
}

/** The row a change applies to: this deadline, at the version seen, live. */
function live(id: string, expectedVersion: number) {
  return and(
    eq(schema.afrikaburnDeadlines.id, id),
    eq(schema.afrikaburnDeadlines.version, expectedVersion),
    isNull(schema.afrikaburnDeadlines.removedAt),
  );
}

/** An "Other" deadline: the only kind a title edit or a removal touches. */
function other(id: string, expectedVersion: number) {
  return and(
    live(id, expectedVersion),
    isNull(schema.afrikaburnDeadlines.kind),
  );
}

/**
 * Set or change one of AfrikaBurn's standard dates for this year, as a
 * captain. `expectedVersion` null means it was "Not announced yet": the row
 * is written then, and a captain who set it first wins (DATE_SET_FIRST).
 * Otherwise a compare-and-set on the version seen. A date claims an event id
 * as editDeadline does; "No round this year" (`skipped`) clears the day, so
 * its event comes off the calendar. `done` is kept unless sent.
 */
export async function setAfrikaburnDate(input: {
  actorId: string;
  kind: string;
  dueDate: string | null;
  note: string | null;
  skipped: boolean;
  done?: boolean;
  expectedVersion: number | null;
  newEventId: string;
}): Promise<DeadlineWriteResult<{ row: DeadlineRow }>> {
  return write(async (tx) => {
    await assertKeeper(tx, input.actorId);
    const standard = afrikaburnDate(input.kind);
    if (!standard) refuse(NOT_AN_AFRIKABURN_DATE);
    if (input.skipped && !afrikaburnDateMayBeSkipped(input.kind)) {
      refuse(CANNOT_SKIP_DATE);
    }
    const dueDate = input.skipped ? null : input.dueDate;
    if (!input.skipped && !dueDate) refuse(PICK_THE_DATE);
    const cycle = await currentCycleNumber(tx);
    const d = schema.afrikaburnDeadlines;
    let row: DeadlineRow | undefined;
    if (input.expectedVersion === null) {
      [row] = await tx
        .insert(d)
        .values({
          cycle,
          kind: standard.kind,
          title: standard.name,
          dueDate,
          note: input.note,
          skipped: input.skipped,
          done: input.done ?? false,
          calendarEventId: dueDate ? input.newEventId : null,
          createdByUserId: input.actorId,
          updatedByUserId: input.actorId,
        })
        .onConflictDoNothing({
          target: [d.cycle, d.kind],
          where: sql`${d.kind} is not null`,
        })
        .returning(COLUMNS);
      if (!row) refuse(DATE_SET_FIRST);
    } else {
      [row] = await tx
        .update(d)
        .set({
          title: standard.name,
          dueDate,
          note: input.note,
          skipped: input.skipped,
          ...(input.done === undefined ? {} : { done: input.done }),
          calendarEventId: dueDate
            ? sql`coalesce(${d.calendarEventId}, ${input.newEventId})`
            : sql`${d.calendarEventId}`,
          version: sql`${d.version} + 1`,
          updatedByUserId: input.actorId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(d.cycle, cycle),
            eq(d.kind, standard.kind),
            eq(d.version, input.expectedVersion),
            isNull(d.removedAt),
          ),
        )
        .returning(COLUMNS);
      if (!row) refuse(DEADLINE_CHANGED);
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action:
        input.expectedVersion === null
          ? "logistics.deadline_added"
          : "logistics.deadline_changed",
      target: `afrikaburn_deadline:${row.id}`,
      metadata: {
        cycle,
        kind: standard.kind,
        title: standard.name,
        dueDate,
        skipped: input.skipped,
        ...(input.done === undefined ? {} : { done: input.done }),
      },
    });
    return { row };
  });
}

/**
 * Change an "Other" deadline's title, date and note, as a captain. A date claims an
 * event id when it has none; one that loses its date keeps its id until the
 * event is off the calendar.
 */
export async function editDeadline(
  input: DeadlineWords & {
    actorId: string;
    id: string;
    expectedVersion: number;
    newEventId: string;
    done?: boolean;
  },
): Promise<DeadlineWriteResult<{ row: DeadlineRow }>> {
  return write(async (tx) => {
    await assertKeeper(tx, input.actorId);
    if (!UUID.test(input.id)) refuse(DEADLINE_CHANGED);
    const d = schema.afrikaburnDeadlines;
    const [row] = await tx
      .update(d)
      .set({
        title: input.title,
        dueDate: input.dueDate,
        note: input.note,
        ...(input.done === undefined ? {} : { done: input.done }),
        calendarEventId: input.dueDate
          ? sql`coalesce(${d.calendarEventId}, ${input.newEventId})`
          : sql`${d.calendarEventId}`,
        version: sql`${d.version} + 1`,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(other(input.id, input.expectedVersion))
      .returning(COLUMNS);
    if (!row) refuse(DEADLINE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.deadline_changed",
      target: `afrikaburn_deadline:${row.id}`,
      metadata: {
        cycle: row.cycle,
        title: input.title,
        dueDate: input.dueDate,
        ...(input.done === undefined ? {} : { done: input.done }),
      },
    });
    return { row };
  });
}

/** Tick a deadline done, or not done, as a captain. */
export async function setDeadlineDone(input: {
  actorId: string;
  id: string;
  done: boolean;
  expectedVersion: number;
}): Promise<DeadlineWriteResult<{ row: DeadlineRow }>> {
  return write(async (tx) => {
    await assertKeeper(tx, input.actorId);
    if (!UUID.test(input.id)) refuse(DEADLINE_CHANGED);
    const d = schema.afrikaburnDeadlines;
    const [row] = await tx
      .update(d)
      .set({
        done: input.done,
        version: sql`${d.version} + 1`,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(live(input.id, input.expectedVersion))
      .returning(COLUMNS);
    if (!row) refuse(DEADLINE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.deadline_done",
      target: `afrikaburn_deadline:${row.id}`,
      metadata: { cycle: row.cycle, title: row.title, done: input.done },
    });
    return { row };
  });
}

/**
 * Remove an "Other" deadline, as a captain (a standard one is only changed). One with no calendar event goes at once;
 * one with an event is marked removed and goes when the event is off the
 * calendar (markDeadlineCalendarSynced).
 */
export async function removeDeadline(input: {
  actorId: string;
  id: string;
  expectedVersion: number;
}): Promise<DeadlineWriteResult<{ row: DeadlineRow }>> {
  return write(async (tx) => {
    await assertKeeper(tx, input.actorId);
    if (!UUID.test(input.id)) refuse(DEADLINE_CHANGED);
    const d = schema.afrikaburnDeadlines;
    const now = new Date();
    const [row] = await tx
      .update(d)
      .set({
        removedAt: now,
        version: sql`${d.version} + 1`,
        updatedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(other(input.id, input.expectedVersion))
      .returning(COLUMNS);
    if (!row) refuse(DEADLINE_CHANGED);
    if (row.calendarEventId === null) {
      await tx.delete(d).where(eq(d.id, row.id));
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.deadline_removed",
      target: `afrikaburn_deadline:${row.id}`,
      metadata: { cycle: row.cycle, title: row.title, dueDate: row.dueDate },
    });
    return { row };
  });
}

/**
 * Record that the camp calendar now matches `version` of a deadline: its
 * event is there, or (`removed`) it is gone and the deadline lets go of its
 * id; a removed deadline then goes for good. A compare-and-set on the
 * version, so a step that finished after a newer save never marks the newer
 * one. True when it was marked.
 */
export async function markDeadlineCalendarSynced(input: {
  id: string;
  version: number;
  removed: boolean;
}): Promise<boolean> {
  const db = createHttpDb();
  const d = schema.afrikaburnDeadlines;
  const where = and(eq(d.id, input.id), eq(d.version, input.version));
  if (input.removed) {
    // A removed deadline whose event is gone has nothing left to keep.
    const gone = await db
      .delete(d)
      .where(and(where, sql`${d.removedAt} is not null`))
      .returning({ id: d.id });
    if (gone.length > 0) return true;
  }
  const rows = await db
    .update(d)
    .set({
      calendarSyncedVersion: input.version,
      ...(input.removed ? { calendarEventId: null } : {}),
    })
    .where(where)
    .returning({ id: d.id });
  return rows.length > 0;
}
