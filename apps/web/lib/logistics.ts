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
  calendarConfig,
  deleteCalendarEvent,
  forgetCalendarCache,
  newCalendarEventId,
  putCalendarEvent,
  type CalendarEventBody,
} from "./google-calendar";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { logisticsTestStore } from "./test-store-logistics";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days; who can help on the days that need hands; and the year's
// AfrikaBurn deadlines. From the database or, under E2E, the test store; and
// each phase and each dated deadline mirrored onto the camp's shared Google
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
export type LogisticsCalendarOutcome =
  /** The camp calendar matches the row. */
  | "synced"
  /** There is no camp calendar to write to: it is in the app only. */
  | "not_connected"
  /** Google did not take the change; saving again retries. */
  | "failed";

/** Whether there is a camp calendar to write the phases to. */
export function isLogisticsCalendarConnected(): boolean {
  return usesTestStore() || calendarConfig(process.env) !== null;
}

export async function listLogisticsPhases(): Promise<LogisticsPhaseRow[]> {
  return usesTestStore()
    ? testStore.listLogisticsPhases()
    : db.listLogisticsPhases();
}

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

/** One row, as the mirror needs it. */
interface MirrorTarget {
  step: "put" | "remove" | "none";
  eventId: string | null;
  /** The event to put, when the step is `put`. */
  event: { body: CalendarEventBody; date: string; place: string | null } | null;
  /** Record that the calendar matches this version. False: a newer one landed. */
  mark: (removed: boolean) => Promise<boolean> | boolean;
  /** The row as it stands now, to follow a newer save. */
  latest: () => Promise<MirrorTarget | undefined>;
}

/** How many times a sync follows a newer save before it gives up. */
const MAX_SYNC_ROUNDS = 3;

async function removeEvent(id: string): Promise<boolean> {
  return usesTestStore()
    ? testStore.deleteCalendarEvent(id)
    : deleteCalendarEvent(process.env, id);
}

/**
 * Make the camp calendar match a row as saved. Never throws.
 *
 * Google is written with no lock held, so two saves close together can reach
 * Google in the wrong order. The mark is a compare-and-set on the version:
 * when it misses, a newer save has landed, and what this step just wrote may
 * be stale. So it reads the row again and makes Google match that instead,
 * first taking off an event it put under an id the row no longer holds.
 * Whichever step finishes last therefore leaves Google matching the newest
 * save.
 */
async function mirror(
  target: MirrorTarget,
  actorId: string | null,
  round = 1,
): Promise<LogisticsCalendarOutcome> {
  if (!isLogisticsCalendarConnected()) return "not_connected";
  const { step, eventId } = target;
  try {
    let marked = true;
    if (step === "put" && eventId && target.event) {
      if (usesTestStore()) {
        testStore.putCalendarEvent({
          id: eventId,
          title: target.event.body.summary,
          date: target.event.date,
          location: target.event.place,
          teamTag: null,
          actorId: actorId ?? "",
        });
      } else {
        await putCalendarEvent(process.env, eventId, target.event.body);
      }
      marked = await target.mark(false);
    } else if (step === "remove" && eventId) {
      if (!(await removeEvent(eventId))) return "failed";
      marked = await target.mark(true);
    }
    forgetCalendarCache();
    if (marked) return "synced";

    // A newer save landed while this step was at Google.
    const latest = await target.latest();
    if (
      step === "put" &&
      eventId &&
      latest?.eventId !== eventId &&
      !(await removeEvent(eventId))
    ) {
      return "failed";
    }
    if (!latest || round >= MAX_SYNC_ROUNDS) return "failed";
    return await mirror(latest, actorId, round + 1);
  } catch {
    // putCalendarEvent has logged the HTTP status, and nothing secret.
    return "failed";
  }
}

/** A phase as a mirror target. */
function phaseTarget(row: LogisticsPhaseRow): MirrorTarget {
  const mark = (removed: boolean) => {
    const args = {
      cycle: row.cycle,
      phase: row.phase,
      version: row.version,
      removed,
    };
    return usesTestStore()
      ? testStore.markLogisticsCalendarSynced(args)
      : db.markLogisticsCalendarSynced(args);
  };
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
            date: row.startDate,
            place: row.place,
          }
        : null,
    mark,
    latest: async () => {
      const rows = usesTestStore()
        ? testStore.listLogisticsPhases(row.cycle)
        : await db.listLogisticsPhases(row.cycle);
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
        ? {
            body: deadlineEventBody({ ...row, dueDate: row.dueDate }),
            date: row.dueDate,
            place: null,
          }
        : null,
    mark: (gone: boolean) => {
      const args = { id: row.id, version: row.version, removed: gone };
      return usesTestStore()
        ? logisticsTestStore.markDeadlineCalendarSynced(args)
        : deadlinesDb.markDeadlineCalendarSynced(args);
    },
    latest: async () => {
      const rows = usesTestStore()
        ? logisticsTestStore.listDeadlines(row.cycle, { withRemoved: true })
        : await deadlinesDb.listDeadlines(row.cycle, { withRemoved: true });
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
 * year that it may not match yet. A save that Google refused, a removal that
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
  if (!isLogisticsCalendarConnected()) return { tried: 0, synced: 0 };
  const [phases, deadlines] = await Promise.all([
    listLogisticsPhases(),
    usesTestStore()
      ? logisticsTestStore.listDeadlines(undefined, { withRemoved: true })
      : deadlinesDb.listDeadlines(undefined, { withRemoved: true }),
  ]);
  const targets = [
    ...phases.map((row) => ({ row, target: phaseTarget(row) })),
    ...deadlines.map((row) => ({ row, target: deadlineTarget(row) })),
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
  const args = { ...input, actorId, newEventId: newCalendarEventId() };
  const saved = usesTestStore()
    ? testStore.setLogisticsPhase(args)
    : await db.setLogisticsPhase(args);
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
  const args = { ...input, actorId };
  const cleared = usesTestStore()
    ? testStore.clearLogisticsPhase(args)
    : await db.clearLogisticsPhase(args);
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
  const read = usesTestStore()
    ? logisticsTestStore.listAttendance(viewer.cycle)
    : await db.listAttendance(viewer.cycle);
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

/** Whether a captain's "Ask everyone" is still open for this member. */
export async function isAskedForAttendance(userId: string): Promise<boolean> {
  return usesTestStore()
    ? logisticsTestStore.hasOpenAttendanceAsk(userId)
    : db.hasOpenAttendanceAsk(userId);
}

/** The signed-in member's own answer for one phase. */
export async function setMyAttendance(
  userId: string,
  input: SetAttendanceInput,
): Promise<LogisticsWriteResult<{ answer: AttendanceAnswer }>> {
  const args = { ...input, userId };
  return usesTestStore()
    ? logisticsTestStore.setMyAttendance(args)
    : db.setMyAttendance(args);
}

/** "Ask everyone", as `actorId`, if they may. */
export async function askForAttendance(
  actorId: string,
): Promise<LogisticsWriteResult<{ asked: number; notified: number }>> {
  return usesTestStore()
    ? logisticsTestStore.askForAttendance({ actorId })
    : db.askForAttendance({ actorId });
}

// --- AfrikaBurn deadlines ----------------------------------------------------

/** This year's deadlines, soonest first. Every member reads them. */
export async function listDeadlines(): Promise<DeadlineRow[]> {
  return usesTestStore()
    ? logisticsTestStore.listDeadlines()
    : deadlinesDb.listDeadlines();
}

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
  const args = { ...input, actorId, newEventId: newCalendarEventId() };
  const saved = usesTestStore()
    ? logisticsTestStore.addDeadline(args)
    : await deadlinesDb.addDeadline(args);
  return afterDeadlineWrite(saved, actorId);
}

/** Change a deadline as a captain; its event follows. */
export async function editDeadline(
  actorId: string,
  input: EditDeadlineInput,
): Promise<DeadlineSaved> {
  const args = { ...input, actorId, newEventId: newCalendarEventId() };
  const saved = usesTestStore()
    ? logisticsTestStore.editDeadline(args)
    : await deadlinesDb.editDeadline(args);
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
  const args = { ...input, actorId, newEventId: newCalendarEventId() };
  const saved = usesTestStore()
    ? logisticsTestStore.setAfrikaburnDate(args)
    : await deadlinesDb.setAfrikaburnDate(args);
  return afterDeadlineWrite(saved, actorId);
}

/** Tick a deadline done or not, as a captain. */
export async function setDeadlineDone(
  actorId: string,
  input: SetDeadlineDoneInput,
): Promise<DeadlineSaved> {
  const args = { ...input, actorId };
  const saved = usesTestStore()
    ? logisticsTestStore.setDeadlineDone(args)
    : await deadlinesDb.setDeadlineDone(args);
  return afterDeadlineWrite(saved, actorId);
}

/** Remove a deadline as a captain; its event comes off the camp calendar. */
export async function removeDeadline(
  actorId: string,
  input: RemoveDeadlineInput,
): Promise<DeadlineSaved> {
  const args = { ...input, actorId };
  const saved = usesTestStore()
    ? logisticsTestStore.removeDeadline(args)
    : await deadlinesDb.removeDeadline(args);
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
