import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  ATTENDANCE_ACTION_KEY,
  ATTENDANCE_ACTION_TITLE,
  ATTENDANCE_REF_TYPE,
  attendanceAnswered,
  attendanceAskNotification,
  attendanceIsOpen,
  campDayKey,
  campOnSite,
  canAskForAttendance,
  canEditLogistics,
  dayOneShift,
  isAskedForAttendance,
  type AttendanceEntry,
  type PhaseDays,
} from "@camp404/core";
import {
  ATTENDANCE_PHASES,
  DAY_ONE_NEEDED_FOR_PREP,
  LOGISTICS_PHASE_LABELS,
  MEAL_PLAN_MAX_DAYS,
  type AttendanceAnswer,
  type AttendancePhase,
  type LogisticsPhase,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { redatePrepSteps } from "./meal-plan";
import { openNudges, closeNudge } from "./nudges";
import { reachRank } from "./power";
import * as schema from "./schema";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days. The data layer.
//
//  - Every member reads the days.
//  - Only a captain or a Transport and Logistics lead writes
//    (canEditLogistics). Every write re-reads the actor's rank and the teams
//    they lead this year INSIDE its own transaction (lockSenderReach), so a
//    demotion that committed first is seen and one that comes later waits. A
//    caller passes only who is acting, never a rank or a team list.
//  - Every write is a compare-and-set on `version`: a lost race says so in a
//    sentence, never overwrites. Each is audited in the same transaction: the
//    days go onto the camp's shared Google Calendar, which is camp config.
//  - The camp calendar is Google's (owner, 2026-09-28). A phase claims ONE
//    Google event id the first time it gets days, inside the write, before
//    Google is called: the caller then puts the event under that id, so a
//    re-save, a retry or two editors at once can never make a second event.
//    Google is called after the transaction, never inside it.
//  - The days set the meal plan's Day 1 (the owner, 2026-10-03: one place
//    to set dates; campOnSite: the first Build day, else the first Burn day).
//    A write that moves Day 1 re-dates the Kitchen's prep steps and their
//    tasks in the same transaction, audited (redatePrepSteps), and a clear
//    that would leave no Day 1 while prep steps exist is refused in a
//    sentence (DAY_ONE_NEEDED_FOR_PREP).
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type LogisticsWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_LOGISTICS_EDITOR =
  "Only captains and Transport and Logistics leads can change the logistics days.";
export const PHASE_CHANGED =
  "Someone changed these days first. Reload the page.";
export const NOT_AN_ATTENDANCE_ASKER =
  "Only captains can ask everyone about the logistics days.";
export const ATTENDANCE_NOT_A_MEMBER = "Only approved camp members can answer.";
export const ATTENDANCE_CHANGED =
  "Your answer changed somewhere else. Reload the page.";
/** A phase that has started takes no more answers. */
export function attendanceClosed(phase: AttendancePhase): string {
  return `${LOGISTICS_PHASE_LABELS[phase]} has started, so answers are closed.`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One phase of one year, as the page and the calendar step read it. */
export interface LogisticsPhaseRow {
  cycle: number;
  phase: LogisticsPhase;
  startDate: string | null;
  endDate: string | null;
  place: string | null;
  note: string | null;
  calendarEventId: string | null;
  calendarSyncedVersion: number | null;
  version: number;
  updatedAt: Date;
}

const COLUMNS = {
  cycle: schema.logisticsPhases.cycle,
  phase: schema.logisticsPhases.phase,
  startDate: schema.logisticsPhases.startDate,
  endDate: schema.logisticsPhases.endDate,
  place: schema.logisticsPhases.place,
  note: schema.logisticsPhases.note,
  calendarEventId: schema.logisticsPhases.calendarEventId,
  calendarSyncedVersion: schema.logisticsPhases.calendarSyncedVersion,
  version: schema.logisticsPhases.version,
  updatedAt: schema.logisticsPhases.updatedAt,
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
): Promise<LogisticsWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

async function assertLogisticsEditor(tx: Tx, actorId: string): Promise<void> {
  if (!UUID.test(actorId)) refuse(NOT_A_LOGISTICS_EDITOR);
  const reach = await lockSenderReach(tx, actorId);
  if (!canEditLogistics(reachRank(reach), reach ?? [])) {
    refuse(NOT_A_LOGISTICS_EDITOR);
  }
}

/**
 * The year's phase days, locked for the write: a prep step added at the same
 * time (which reads Day 1 with a share lock) either lands first and is
 * re-dated here, or waits and reads the new Day 1.
 */
async function lockPhaseDays(tx: Tx, cycle: number): Promise<PhaseDays[]> {
  return tx
    .select({
      phase: schema.logisticsPhases.phase,
      startDate: schema.logisticsPhases.startDate,
      endDate: schema.logisticsPhases.endDate,
    })
    .from(schema.logisticsPhases)
    .where(eq(schema.logisticsPhases.cycle, cycle))
    .for("update");
}

/**
 * After a phase's days changed from `before` to `row`: when Day 1 moved, move
 * the prep steps and their tasks with it; when Day 1 is gone and prep steps
 * exist, refuse (the whole write rolls back).
 */
async function followDayOne(
  tx: Tx,
  input: {
    actorId: string;
    cycle: number;
    before: readonly PhaseDays[];
    row: PhaseDays;
  },
): Promise<void> {
  const after = [
    ...input.before.filter((p) => p.phase !== input.row.phase),
    input.row,
  ];
  const from = campOnSite(input.before, MEAL_PLAN_MAX_DAYS)?.firstDay ?? null;
  const to = campOnSite(after, MEAL_PLAN_MAX_DAYS)?.firstDay ?? null;
  if (from !== null && to === null) {
    const [step] = await tx
      .select({ id: schema.kitchenPrepSteps.id })
      .from(schema.kitchenPrepSteps)
      .where(eq(schema.kitchenPrepSteps.cycle, input.cycle))
      .limit(1)
      .for("update");
    if (step) refuse(DAY_ONE_NEEDED_FOR_PREP);
    return;
  }
  const shift = dayOneShift(from, to);
  if (shift === null) return;
  await redatePrepSteps(tx, {
    actorId: input.actorId,
    cycle: input.cycle,
    shift,
    from: from!,
    to: to!,
  });
}

// --- Reads -------------------------------------------------------------------

/** This year's phases that have a row, in the camp's order. */
export async function listLogisticsPhases(
  cycle?: number,
): Promise<LogisticsPhaseRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  // The enum's own order is the camp's order.
  return db
    .select(COLUMNS)
    .from(schema.logisticsPhases)
    .where(eq(schema.logisticsPhases.cycle, year))
    .orderBy(asc(schema.logisticsPhases.phase));
}

// --- Writes ------------------------------------------------------------------

/**
 * Set one phase's days for this year, as a captain or a Transport and
 * Logistics lead. `newEventId` is the Google event id to claim if the phase
 * has none yet; a phase that has one keeps it. When the days move Day 1, the
 * meal plan's prep steps and their tasks move with it, in this transaction.
 * Returns the row as saved, for the calendar step.
 */
export async function setLogisticsPhase(input: {
  actorId: string;
  phase: LogisticsPhase;
  startDate: string;
  endDate: string;
  place: string | null;
  note: string | null;
  expectedVersion: number;
  newEventId: string;
}): Promise<LogisticsWriteResult<{ row: LogisticsPhaseRow }>> {
  return write(async (tx) => {
    await assertLogisticsEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const before = await lockPhaseDays(tx, cycle);
    const now = new Date();
    const fields = {
      startDate: input.startDate,
      endDate: input.endDate,
      place: input.place,
      note: input.note,
      updatedByUserId: input.actorId,
      updatedAt: now,
    };
    let row: LogisticsPhaseRow | undefined;
    if (input.expectedVersion === 0) {
      [row] = await tx
        .insert(schema.logisticsPhases)
        .values({
          ...fields,
          cycle,
          phase: input.phase,
          calendarEventId: input.newEventId,
          version: 1,
        })
        .onConflictDoNothing({
          target: [schema.logisticsPhases.cycle, schema.logisticsPhases.phase],
        })
        .returning(COLUMNS);
    } else {
      [row] = await tx
        .update(schema.logisticsPhases)
        .set({
          ...fields,
          // Keep the event already claimed; claim one only when there is none.
          calendarEventId: sql`coalesce(${schema.logisticsPhases.calendarEventId}, ${input.newEventId})`,
          version: sql`${schema.logisticsPhases.version} + 1`,
        })
        .where(
          and(
            eq(schema.logisticsPhases.cycle, cycle),
            eq(schema.logisticsPhases.phase, input.phase),
            eq(schema.logisticsPhases.version, input.expectedVersion),
          ),
        )
        .returning(COLUMNS);
    }
    if (!row) refuse(PHASE_CHANGED);
    await followDayOne(tx, { actorId: input.actorId, cycle, before, row });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.phase_set",
      target: `logistics_phase:${cycle}:${input.phase}`,
      metadata: {
        cycle,
        phase: input.phase,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    return { row };
  });
}

/**
 * Clear one phase's days (and its place and note) for this year. Refused
 * while prep steps exist if it would leave the meal plan with no Day 1. The row
 * keeps its Google event id until the caller has taken the event off the
 * calendar (markLogisticsCalendarSynced), so a failed delete is not lost.
 */
export async function clearLogisticsPhase(input: {
  actorId: string;
  phase: LogisticsPhase;
  expectedVersion: number;
}): Promise<LogisticsWriteResult<{ row: LogisticsPhaseRow }>> {
  return write(async (tx) => {
    await assertLogisticsEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const before = await lockPhaseDays(tx, cycle);
    const [row] = await tx
      .update(schema.logisticsPhases)
      .set({
        startDate: null,
        endDate: null,
        place: null,
        note: null,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
        version: sql`${schema.logisticsPhases.version} + 1`,
      })
      .where(
        and(
          eq(schema.logisticsPhases.cycle, cycle),
          eq(schema.logisticsPhases.phase, input.phase),
          eq(schema.logisticsPhases.version, input.expectedVersion),
        ),
      )
      .returning(COLUMNS);
    if (!row) refuse(PHASE_CHANGED);
    await followDayOne(tx, { actorId: input.actorId, cycle, before, row });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.phase_cleared",
      target: `logistics_phase:${cycle}:${input.phase}`,
      metadata: { cycle, phase: input.phase },
    });
    return { row };
  });
}

/**
 * Record that the camp calendar now matches `version` of a phase: its event
 * is there with those days, or (`removed`) it is gone and the phase lets go
 * of its id. A compare-and-set on the version, so a step that finished after
 * a newer save never marks the newer one as done. True when it was marked.
 */
export async function markLogisticsCalendarSynced(input: {
  cycle: number;
  phase: LogisticsPhase;
  version: number;
  removed: boolean;
}): Promise<boolean> {
  const rows = await createHttpDb()
    .update(schema.logisticsPhases)
    .set({
      calendarSyncedVersion: input.version,
      ...(input.removed ? { calendarEventId: null } : {}),
    })
    .where(
      and(
        eq(schema.logisticsPhases.cycle, input.cycle),
        eq(schema.logisticsPhases.phase, input.phase),
        eq(schema.logisticsPhases.version, input.version),
      ),
    )
    .returning({ version: schema.logisticsPhases.version });
  return rows.length > 0;
}

// --- Attendance --------------------------------------------------------------
// Who can help on Pack, Build, Strike and Unpack (owner, 2026-09-30). A member
// writes only their own answer (the caller passes the signed-in member's id),
// until the phase starts, as a compare-and-set on the answer they saw. Every
// member reads the answers by name. A captain's "Ask everyone" opens the
// shared nudge (./nudges) for each member who is coming and has not answered
// a phase that is still open; answering them all closes it.

/** What the Logistics page reads: every answer, and who is coming. */
export interface AttendanceRead {
  entries: AttendanceEntry[];
  /** Members who are coming this year: the ones asked. */
  coming: { userId: string; name: string }[];
}

const nameOf = (name: string | null) => name?.trim() || "Unnamed burner";

/** Approved, real, not erased: a member whose answer counts. */
const realMember = and(
  eq(schema.users.isSystem, false),
  eq(schema.users.sanitised, false),
  eq(schema.users.approvalStatus, "approved"),
);

/** Every answer this year, and the members who are coming. */
export async function listAttendance(cycle: number): Promise<AttendanceRead> {
  const db = createHttpDb();
  const [answers, places] = await Promise.all([
    db
      .select({
        phase: schema.logisticsAttendance.phase,
        userId: schema.logisticsAttendance.userId,
        name: schema.users.displayName,
        answer: schema.logisticsAttendance.answer,
      })
      .from(schema.logisticsAttendance)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.logisticsAttendance.userId),
      )
      .where(and(eq(schema.logisticsAttendance.cycle, cycle), realMember)),
    comingMembers(db, cycle),
  ]);
  return {
    entries: answers.flatMap((a) =>
      (ATTENDANCE_PHASES as readonly string[]).includes(a.phase)
        ? [
            {
              phase: a.phase as AttendancePhase,
              userId: a.userId,
              name: nameOf(a.name),
              answer: a.answer,
            },
          ]
        : [],
    ),
    coming: places,
  };
}

/** The members who are coming this year (isAskedForAttendance). */
export async function comingMembers(
  db: DbOrTx,
  cycle: number,
): Promise<{ userId: string; name: string }[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.displayName,
      status: schema.campParticipations.status,
    })
    .from(schema.users)
    .innerJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .where(realMember);
  return rows
    .filter((r) => isAskedForAttendance(r.status))
    .map((r) => ({ userId: r.userId, name: nameOf(r.name) }));
}

/**
 * How many members the captains accepted this year: real, approved members
 * only. A count, never names (the burn timeline prints it for burn days; the
 * join site shows the camp's headcount publicly too).
 */
export async function countAcceptedMembers(cycle: number): Promise<number> {
  const [row] = await createHttpDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.campParticipations)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.campParticipations.userId),
    )
    .where(
      and(
        eq(schema.campParticipations.cycle, cycle),
        eq(schema.campParticipations.status, "accepted"),
        realMember,
      ),
    );
  return row?.n ?? 0;
}

/** Whether the member's "Ask everyone" nudge is still open. */
export async function hasOpenAttendanceAsk(userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const rows = await createHttpDb()
    .select({ id: schema.requiredActions.id })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.actionKey, ATTENDANCE_ACTION_KEY),
        eq(schema.requiredActions.status, "pending"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** The attendance phases that still take answers on `today`. */
async function openPhases(
  tx: Tx,
  cycle: number,
  today: string,
): Promise<Set<AttendancePhase>> {
  const rows = await tx
    .select({
      phase: schema.logisticsPhases.phase,
      startDate: schema.logisticsPhases.startDate,
    })
    .from(schema.logisticsPhases)
    .where(
      and(
        eq(schema.logisticsPhases.cycle, cycle),
        inArray(schema.logisticsPhases.phase, [...ATTENDANCE_PHASES]),
      ),
    )
    .for("share");
  const starts = new Map(rows.map((r) => [r.phase, r.startDate]));
  return new Set(
    ATTENDANCE_PHASES.filter((p) => attendanceIsOpen(starts.get(p), today)),
  );
}

/**
 * A member's own answer for one phase, until it starts. A compare-and-set on
 * the answer they saw (`expected`, null before their first), so two tabs
 * never overwrite each other silently. Answering every phase that is still
 * open closes their "Ask everyone" nudge and reads its notice.
 */
export async function setMyAttendance(input: {
  userId: string;
  phase: AttendancePhase;
  answer: AttendanceAnswer;
  expected: AttendanceAnswer | null;
  now?: Date;
}): Promise<LogisticsWriteResult<{ answer: AttendanceAnswer }>> {
  return write(async (tx) => {
    if (!UUID.test(input.userId)) refuse(ATTENDANCE_NOT_A_MEMBER);
    const [member] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, input.userId), realMember))
      .for("share");
    if (!member) refuse(ATTENDANCE_NOT_A_MEMBER);
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    const open = await openPhases(tx, cycle, campDayKey(now));
    if (!open.has(input.phase)) refuse(attendanceClosed(input.phase));

    const key = and(
      eq(schema.logisticsAttendance.cycle, cycle),
      eq(schema.logisticsAttendance.phase, input.phase),
      eq(schema.logisticsAttendance.userId, input.userId),
    );
    const won =
      input.expected === null
        ? await tx
            .insert(schema.logisticsAttendance)
            .values({
              cycle,
              phase: input.phase,
              userId: input.userId,
              answer: input.answer,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ answer: schema.logisticsAttendance.answer })
        : await tx
            .update(schema.logisticsAttendance)
            .set({ answer: input.answer, updatedAt: now })
            .where(
              and(key, eq(schema.logisticsAttendance.answer, input.expected)),
            )
            .returning({ answer: schema.logisticsAttendance.answer });
    if (won.length === 0) refuse(ATTENDANCE_CHANGED);

    const mine = await tx
      .select({ phase: schema.logisticsAttendance.phase })
      .from(schema.logisticsAttendance)
      .where(
        and(
          eq(schema.logisticsAttendance.cycle, cycle),
          eq(schema.logisticsAttendance.userId, input.userId),
        ),
      );
    const answered = new Set(mine.map((r) => r.phase as AttendancePhase));
    if (attendanceAnswered(answered, open)) {
      await closeNudge(tx, {
        userId: input.userId,
        actionKey: ATTENDANCE_ACTION_KEY,
        refType: ATTENDANCE_REF_TYPE,
        now,
      });
    }
    return { answer: input.answer };
  });
}

/**
 * "Ask everyone": nudge each member who is coming this year and has not
 * answered every phase that is still open. A nudge, never a block (the shared
 * nudge: one non-blocking required action and one notice, no second notice
 * while the first is unread). A captain only (canAskForAttendance), checked
 * inside the write. Audited.
 */
export async function askForAttendance(input: {
  actorId: string;
  now?: Date;
}): Promise<LogisticsWriteResult<{ asked: number; notified: number }>> {
  return write(async (tx) => {
    if (!UUID.test(input.actorId)) refuse(NOT_AN_ATTENDANCE_ASKER);
    const reach = await lockSenderReach(tx, input.actorId);
    if (!canAskForAttendance(reachRank(reach))) {
      refuse(NOT_AN_ATTENDANCE_ASKER);
    }
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    const open = await openPhases(tx, cycle, campDayKey(now));
    const coming = await comingMembers(tx, cycle);
    const answers = await tx
      .select({
        userId: schema.logisticsAttendance.userId,
        phase: schema.logisticsAttendance.phase,
      })
      .from(schema.logisticsAttendance)
      .where(eq(schema.logisticsAttendance.cycle, cycle));
    const answered = new Map<string, Set<AttendancePhase>>();
    for (const a of answers) {
      const set = answered.get(a.userId) ?? new Set<AttendancePhase>();
      set.add(a.phase as AttendancePhase);
      answered.set(a.userId, set);
    }
    const targets = coming.filter(
      (m) => !attendanceAnswered(answered.get(m.userId) ?? new Set(), open),
    );
    const notified = await openNudges(tx, {
      userIds: targets.map((t) => t.userId),
      actionKey: ATTENDANCE_ACTION_KEY,
      title: ATTENDANCE_ACTION_TITLE,
      refType: ATTENDANCE_REF_TYPE,
      notice: (requiredActionId) =>
        attendanceAskNotification({ requiredActionId }),
      now,
    });
    if (targets.length > 0) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "logistics.attendance_asked",
        target: String(cycle),
        metadata: { cycle, asked: targets.length, notified },
      });
    }
    return { asked: targets.length, notified };
  });
}
