import "server-only";

import {
  afrikaburnDate,
  afrikaburnEventTitle,
  attendanceBoard,
  deadlineCalendarStep,
  logisticsCalendarStep,
  logisticsEventTitle,
  nextCampDay,
  type AttendancePhaseBoard,
} from "@camp404/core";
import * as deadlinesDb from "@camp404/db/deadlines";
import type { DeadlineRow, DeadlineWriteResult } from "@camp404/db/deadlines";
import * as db from "@camp404/db/logistics";
import type {
  AttendanceRead,
  LogisticsPhaseRow,
  LogisticsWriteResult,
} from "@camp404/db/logistics";
import {
  LOGISTICS_PHASE_HINTS,
  type AddDeadlineInput,
  type AttendanceAnswer,
  type ClearLogisticsPhaseInput,
  type EditDeadlineInput,
  type RemoveDeadlineInput,
  type SetAfrikaburnDateInput,
  type SetAttendanceInput,
  type SetDeadlineDoneInput,
  type SetLogisticsPhaseInput,
  type ViewerRank,
} from "@camp404/types";
import {
  isCampCalendarWritable,
  mirror,
  type CalendarMirrorOutcome,
  type MirrorTarget,
} from "./calendar-mirror";
import {
  campEventTargets,
  linkUnlinkedMeetingNotes,
  listCampEventsToSync,
} from "./camp-events";
import { newCalendarEventId, type CalendarEventBody } from "./google-calendar";
import { testStore } from "./test-store";
import { logisticsTestStore } from "./test-store-logistics";
import { twin } from "./twin";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days; who can help on the days that need hands; and the year's
// AfrikaBurn deadlines. From the database or, under E2E, the test store's
// twin (one per db module, below); the checks both sides share live once in
// @camp404/core (attendanceAnswerProblem, openAttendancePhases,
// attendanceAskTargets, afrikaburnDateToSave, dayOneMove), and
// lib/__tests__/logistics-agreement.test.ts holds the rest equal. And each
// phase and each dated deadline mirrored onto the camp's shared Google
// Calendar (owner, 2026-09-28: the calendar stays on Google).
//
// THE ORDER. The row is saved first (the rule, the compare-and-set and the
// audit row, in one transaction that also claims the row's Google event id).
// Then, with no transaction open, the calendar is made to match: the event is
// put under that id (an update, or a create when Google has none), or, for a
// row whose date was cleared or that was removed, deleted. A save is never
// lost to a Google failure: the page says the row is not on the calendar yet,
// saving again puts it there, and so does the catch-up on a later page load
// (catchUpCampCalendar, no cron). Re-saving never makes a second event,
// because the id never changes.
//
// TITLES ARE PLAIN (owner, 2026-09-30): "Build"; an AfrikaBurn date is
// "AfrikaBurn: Registration closes" (owner, 2026-10-01). Every phase is a whole-camp event, so no team tag either: the Calendar and
// Home read them as the camp's.
//
// Under E2E the store's own event list stands in for Google, so the same
// steps run and the Calendar page shows the phases and deadlines.

export type {
  AttendanceRead,
  DeadlineRow,
  DeadlineWriteResult,
  LogisticsPhaseRow,
  LogisticsWriteResult,
};

/** How the camp calendar stands after a save. */
export type LogisticsCalendarOutcome = CalendarMirrorOutcome;

/** Whether there is a camp calendar to write the phases to. */
export function isLogisticsCalendarConnected(): boolean {
  return isCampCalendarWritable();
}

const phases = twin(db, testStore, [
  "listLogisticsPhases",
  "setLogisticsPhase",
  "clearLogisticsPhase",
  "markLogisticsCalendarSynced",
]);

const attendance = twin(db, logisticsTestStore, [
  "listAttendance",
  "countAcceptedMembers",
  "hasOpenAttendanceAsk",
  "setMyAttendance",
  "askForAttendance",
]);

const deadlines = twin(deadlinesDb, logisticsTestStore, [
  "listDeadlines",
  "addDeadline",
  "editDeadline",
  "setAfrikaburnDate",
  "setDeadlineDone",
  "removeDeadline",
  "markDeadlineCalendarSynced",
]);

/** This year's phases that have a row (another year's for `cycle`). */
export const listLogisticsPhases = phases.listLogisticsPhases;

const APP_NOTE = (where: string) =>
  `Set in the Camp 404 app, under ${where}. Change it there.`;

/**
 * The Google event for a phase with days: all day, from the first day to the
 * last (Google's end date is the day after), titled plainly ("Build"). No
 * team: every phase is the whole camp's. The phase rides along as a private
 * property the app does not show.
 */
export function logisticsEventBody(
  row: LogisticsPhaseRow & { startDate: string; endDate: string },
): CalendarEventBody {
  const description = [
    LOGISTICS_PHASE_HINTS[row.phase],
    row.note,
    APP_NOTE("Logistics"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: logisticsEventTitle(row.phase),
    description,
    ...(row.place ? { location: row.place } : {}),
    start: { date: row.startDate },
    end: { date: nextCampDay(row.endDate) },
    extendedProperties: { private: { camp404Logistics: row.phase } },
  };
}

/**
 * The Google event for a deadline with a date: one all-day event, titled
 * "AfrikaBurn: <name>", whole-camp. A standard date says what it is.
 */
export function deadlineEventBody(
  row: DeadlineRow & { dueDate: string },
): CalendarEventBody {
  const help = row.kind ? afrikaburnDate(row.kind)?.help : null;
  return {
    summary: afrikaburnEventTitle(row),
    description: [help, row.note, APP_NOTE("Camp settings, The camp's year")]
      .filter(Boolean)
      .join("\n\n"),
    start: { date: row.dueDate },
    end: { date: nextCampDay(row.dueDate) },
    extendedProperties: { private: { camp404Deadline: row.id } },
  };
}

// --- The calendar mirror -----------------------------------------------------
// The mirror itself (put, mark, follow a newer save) is ./calendar-mirror,
// shared with the Calendar's own events.

/** A phase as a mirror target. */
function phaseTarget(row: LogisticsPhaseRow): MirrorTarget {
  const mark = (removed: boolean) =>
    phases.markLogisticsCalendarSynced({
      cycle: row.cycle,
      phase: row.phase,
      version: row.version,
      removed,
    });
  return {
    step: logisticsCalendarStep(row),
    eventId: row.calendarEventId,
    event:
      row.startDate && row.endDate
        ? {
            body: logisticsEventBody({
              ...row,
              startDate: row.startDate,
              endDate: row.endDate,
            }),
          }
        : null,
    mark,
    latest: async () => {
      const rows = await listLogisticsPhases(row.cycle);
      const now = rows.find((r) => r.phase === row.phase);
      return now ? phaseTarget(now) : undefined;
    },
  };
}

/** A deadline as a mirror target. */
function deadlineTarget(row: DeadlineRow): MirrorTarget {
  const removed = row.removedAt !== null;
  return {
    step: deadlineCalendarStep({ ...row, removed }),
    eventId: row.calendarEventId,
    event:
      row.dueDate && !removed
        ? { body: deadlineEventBody({ ...row, dueDate: row.dueDate }) }
        : null,
    mark: (gone: boolean) =>
      deadlines.markDeadlineCalendarSynced({
        id: row.id,
        version: row.version,
        removed: gone,
      }),
    latest: async () => {
      const rows = await deadlines.listDeadlines(row.cycle, {
        withRemoved: true,
      });
      const now = rows.find((r) => r.id === row.id);
      return now ? deadlineTarget(now) : undefined;
    },
  };
}

/** Whether a row's calendar event may not match it. */
function needsSync(
  row: { version: number; calendarSyncedVersion: number | null },
  step: "put" | "remove" | "none",
): boolean {
  return step !== "none" && row.calendarSyncedVersion !== row.version;
}

/**
 * The catch-up: make the camp calendar match every phase and deadline of this
 * year, and every event made in the Calendar, that it may not match yet. A save that Google refused, a removal that
 * did not reach it, and the phases written with the old team title before
 * titles went plain (migration 0080 marks those) are all put right, each
 * under the event id its row already owns, so nothing is duplicated. Run on a
 * page load after the response (runDueWork), never on a schedule. Returns how
 * many rows it tried and how many now match.
 */
export async function catchUpCampCalendar(): Promise<{
  tried: number;
  synced: number;
}> {
  // A meeting note that names no event gets one first (in the database, on
  // every environment), so the Calendar shows it and Google gets it below.
  await linkUnlinkedMeetingNotes();
  if (!isLogisticsCalendarConnected()) return { tried: 0, synced: 0 };
  const [phaseRows, deadlineRows, events] = await Promise.all([
    listLogisticsPhases(),
    deadlines.listDeadlines(undefined, { withRemoved: true }),
    listCampEventsToSync(),
  ]);
  const targets = [
    ...phaseRows.map((row) => ({ row, target: phaseTarget(row) })),
    ...deadlineRows.map((row) => ({ row, target: deadlineTarget(row) })),
    ...(await campEventTargets(events)),
  ].filter(({ row, target }) => needsSync(row, target.step));
  let synced = 0;
  for (const { target } of targets) {
    if ((await mirror(target, null)) === "synced") synced += 1;
  }
  return { tried: targets.length, synced };
}

// --- Phases ------------------------------------------------------------------

/**
 * Set one phase's days as `actorId`, if they may, then put it on the camp
 * calendar. The rule is checked inside the write.
 */
export async function saveLogisticsPhase(
  actorId: string,
  input: SetLogisticsPhaseInput,
): Promise<LogisticsWriteResult<{ calendar: LogisticsCalendarOutcome }>> {
  const saved = await phases.setLogisticsPhase({
    ...input,
    actorId,
    newEventId: newCalendarEventId(),
  });
  if (!saved.ok) return saved;
  return { ok: true, calendar: await mirror(phaseTarget(saved.row), actorId) };
}

/**
 * Clear one phase's days as `actorId`, if they may, then take its event off
 * the camp calendar.
 */
export async function clearLogisticsPhase(
  actorId: string,
  input: ClearLogisticsPhaseInput,
): Promise<LogisticsWriteResult<{ calendar: LogisticsCalendarOutcome }>> {
  const cleared = await phases.clearLogisticsPhase({ ...input, actorId });
  if (!cleared.ok) return cleared;
  return {
    ok: true,
    calendar: await mirror(phaseTarget(cleared.row), actorId),
  };
}

// --- Attendance --------------------------------------------------------------

/** What one viewer may see of the attendance board. */
export interface AttendanceView {
  phases: AttendancePhaseBoard[];
  /** The viewer's own answer per phase. */
  mine: Partial<Record<AttendancePhaseBoard["phase"], AttendanceAnswer>>;
  /**
   * Whether the names of who has not answered are shown. They are the
   * members who are coming, and whether someone is coming reads at team lead
   * (campParticipations.status in MEMBER_FIELD_READERS), so a plain member
   * gets the count only: `notAnswered` is emptied on the server.
   */
  namesWhoHaveNotAnswered: boolean;
  /** How many have not answered, per phase, for everyone. */
  notAnsweredCount: Record<AttendancePhaseBoard["phase"], number>;
}

/** The attendance board as `viewer` may see it. */
export async function getAttendanceView(viewer: {
  userId: string;
  rank: ViewerRank;
  cycle: number;
}): Promise<AttendanceView> {
  const read = await attendance.listAttendance(viewer.cycle);
  const board = attendanceBoard(read.entries, read.coming);
  const names = viewer.rank !== "camp_member";
  const mine: AttendanceView["mine"] = {};
  for (const e of read.entries) {
    if (e.userId === viewer.userId) mine[e.phase] = e.answer;
  }
  return {
    phases: board.map((p) => (names ? p : { ...p, notAnswered: [] })),
    mine,
    namesWhoHaveNotAnswered: names,
    notAnsweredCount: Object.fromEntries(
      board.map((p) => [p.phase, p.notAnswered.length]),
    ) as AttendanceView["notAnsweredCount"],
  };
}

/** How many members the captains accepted this year: a count, never names. */
export const countAcceptedMembers = attendance.countAcceptedMembers;

/** Whether a captain's "Ask everyone" is still open for this member. */
export const isAskedForAttendance = attendance.hasOpenAttendanceAsk;

// The writes stay functions because they take who is acting apart from the
// form's input; the rule is checked inside the write.

/** The signed-in member's own answer for one phase. */
export async function setMyAttendance(
  userId: string,
  input: SetAttendanceInput,
): Promise<LogisticsWriteResult<{ answer: AttendanceAnswer }>> {
  return attendance.setMyAttendance({ ...input, userId });
}

/** "Ask everyone", as `actorId`, if they may. */
export async function askForAttendance(
  actorId: string,
): Promise<LogisticsWriteResult<{ asked: number; notified: number }>> {
  return attendance.askForAttendance({ actorId });
}

// --- AfrikaBurn deadlines ----------------------------------------------------

/** This year's deadlines, soonest first. Every member reads them. */
export const listDeadlines = deadlines.listDeadlines;

type DeadlineSaved = DeadlineWriteResult<{
  calendar: LogisticsCalendarOutcome;
}>;

async function afterDeadlineWrite(
  saved: DeadlineWriteResult<{ row: DeadlineRow }>,
  actorId: string,
): Promise<DeadlineSaved> {
  if (!saved.ok) return saved;
  return {
    ok: true,
    calendar: await mirror(deadlineTarget(saved.row), actorId),
  };
}

/** Add a deadline as a captain, and put it on the camp calendar if dated. */
export async function addDeadline(
  actorId: string,
  input: AddDeadlineInput,
): Promise<DeadlineSaved> {
  const saved = await deadlines.addDeadline({
    ...input,
    actorId,
    newEventId: newCalendarEventId(),
  });
  return afterDeadlineWrite(saved, actorId);
}

/** Change a deadline as a captain; its event follows. */
export async function editDeadline(
  actorId: string,
  input: EditDeadlineInput,
): Promise<DeadlineSaved> {
  const saved = await deadlines.editDeadline({
    ...input,
    actorId,
    newEventId: newCalendarEventId(),
  });
  return afterDeadlineWrite(saved, actorId);
}

/**
 * Set or change one of AfrikaBurn's standard dates as a captain; its event
 * follows (off the calendar for "No round this year").
 */
export async function setAfrikaburnDate(
  actorId: string,
  input: SetAfrikaburnDateInput,
): Promise<DeadlineSaved> {
  const saved = await deadlines.setAfrikaburnDate({
    ...input,
    actorId,
    newEventId: newCalendarEventId(),
  });
  return afterDeadlineWrite(saved, actorId);
}

/** Tick a deadline done or not, as a captain. */
export async function setDeadlineDone(
  actorId: string,
  input: SetDeadlineDoneInput,
): Promise<DeadlineSaved> {
  const saved = await deadlines.setDeadlineDone({ ...input, actorId });
  return afterDeadlineWrite(saved, actorId);
}

/** Remove a deadline as a captain; its event comes off the camp calendar. */
export async function removeDeadline(
  actorId: string,
  input: RemoveDeadlineInput,
): Promise<DeadlineSaved> {
  const saved = await deadlines.removeDeadline({ ...input, actorId });
  return afterDeadlineWrite(saved, actorId);
}

/**
 * Where a deadline stands on the camp calendar, for the chip beside it: on
 * it, not yet, or nothing to say (no date, or no calendar connected).
 */
export function deadlineCalendarState(
  row: DeadlineRow,
  connected: boolean,
): "on" | "pending" | null {
  if (!connected || !row.dueDate) return null;
  return row.calendarSyncedVersion === row.version ? "on" : "pending";
}
