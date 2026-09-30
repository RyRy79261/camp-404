import {
  ATTENDANCE_ANSWERS,
  ATTENDANCE_PHASES,
  LOGISTICS_PHASE_LABELS,
  ViewerRank,
  type AttendanceAnswer,
  type AttendancePhase,
  type LogisticsPhase,
  type NotificationPayload,
  type ParticipationStatus,
} from "@camp404/types";
import { isComingThisYear } from "./participation";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days. Pure: no DB, no session, no next/*.
//
// WHO MAY SET THE DAYS. Clearance stays global (AGENTS.md): a lead of ANY team
// stands on the `team_lead` rung everywhere. Team identity decides only who
// may act HERE: a captain, or a lead of Transport and Logistics. Every member
// reads the days. It fails closed on a rank this module does not know. The
// write re-reads the actor's rank and led teams inside its own transaction and
// passes those here; it never takes a team list from the caller.
//
// THE CAMP CALENDAR. The camp calendar stays on Google (owner, 2026-09-28:
// "We still need the calendar"). Each phase with days is one all-day Google
// event with a PLAIN title ("Build"), and no team: every phase is a whole-camp
// event (owner, 2026-09-30: "Build and Strike is a whole camp activity", then
// "All phases plain"). So the Calendar, Home's "Coming up" and the camp view
// read it as the camp's, not as the Transport and Logistics team's.
//
// ATTENDANCE. Every member who is coming is asked going / maybe / can't for
// the phases that need hands (ATTENDANCE_PHASES). Anyone may answer for
// themselves until the phase starts. A captain's "Ask everyone" is a nudge,
// never a block.
//
// AFRIKABURN DEADLINES. Captains keep the year's AfrikaBurn dates, one at a
// time; each with a date is one plain-titled event on the camp calendar.

/** The team whose leads keep the logistics calendar. */
export const LOGISTICS_TEAM = "transport_and_logistics";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may set or clear the year's logistics days: a captain, or a
 * lead of Transport and Logistics. `ledTeams` are the team keys they lead
 * this year.
 */
export function canEditLogistics(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(LOGISTICS_TEAM);
  return false;
}

/**
 * A phase's title on the camp's Google Calendar: plain, "Build". Every phase
 * is a whole-camp event (owner, 2026-09-30), so no team prefix.
 */
export function logisticsEventTitle(phase: LogisticsPhase): string {
  return LOGISTICS_PHASE_LABELS[phase];
}

/** A phase as the calendar step needs it. */
export interface LogisticsCalendarState {
  startDate: string | null;
  endDate: string | null;
  /** The Google event this phase owns, once one has been claimed. */
  calendarEventId: string | null;
}

/**
 * What the camp calendar must do so it matches the phase: `put` the event
 * (create it, or update the one already there) when the phase has days;
 * `remove` it when the days were cleared but an event may still be on the
 * calendar; `none` when there is nothing there and nothing to show.
 */
export function logisticsCalendarStep(
  phase: LogisticsCalendarState,
): "put" | "remove" | "none" {
  const hasDays = phase.startDate !== null && phase.endDate !== null;
  if (hasDays) return phase.calendarEventId ? "put" : "none";
  return phase.calendarEventId ? "remove" : "none";
}

// --- Attendance --------------------------------------------------------------

/**
 * Whether someone may press "Ask everyone" for attendance: a captain. It
 * sends a notice to every member who is coming, and a team lead's reach is
 * one team (canSendToAudience), so a lead is refused until the owner says
 * otherwise. Fails closed on a rank this module does not know.
 */
export function canAskForAttendance(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * Whether members may still answer for a phase on `today` (a camp day,
 * YYYY-MM-DD): until the phase starts. A phase with no days yet is open.
 */
export function attendanceIsOpen(
  startDate: string | null | undefined,
  today: string,
): boolean {
  return !startDate || today < startDate;
}

/** The nudge's key in `required_actions`. */
export const ATTENDANCE_ACTION_KEY = "logistics_attendance";
/** What the member is asked to do, in their words. */
export const ATTENDANCE_ACTION_TITLE =
  "Say which logistics days you can help with";
/** The `ref_type` of the notice, which opens Logistics. */
export const ATTENDANCE_REF_TYPE = "logistics_attendance";

/**
 * Who is asked about attendance: a member who is coming this year, the same
 * people the gear rental asks (said Yes, or a captain accepted them).
 */
export function isAskedForAttendance(
  status: ParticipationStatus | null,
): boolean {
  return isComingThisYear(status);
}

/**
 * Whether a member has answered everything they can still answer: every
 * attendance phase that is open has an answer. Their nudge is then done.
 */
export function attendanceAnswered(
  answered: ReadonlySet<AttendancePhase>,
  open: ReadonlySet<AttendancePhase>,
): boolean {
  return ATTENDANCE_PHASES.every((p) => !open.has(p) || answered.has(p));
}

/** The notice "Ask everyone" sends. It opens Logistics. */
export function attendanceAskNotification(input: {
  requiredActionId: string | null;
}): NotificationPayload {
  return {
    kind: "questionnaire_reminder",
    title: ATTENDANCE_ACTION_TITLE,
    body: "Pack, Build, Strike and Unpack need the whole camp. Open Logistics and say Going, Maybe or Can't for each.",
    refType: ATTENDANCE_REF_TYPE,
    refId: input.requiredActionId,
  };
}

/** A member and their answer, as the board reads them. */
export interface AttendanceEntry {
  phase: AttendancePhase;
  userId: string;
  name: string;
  answer: AttendanceAnswer;
}

/** One phase's answers: names per answer, and who has not answered. */
export interface AttendancePhaseBoard {
  phase: AttendancePhase;
  names: Record<AttendanceAnswer, string[]>;
  /** Members who are coming and have not answered, by name. */
  notAnswered: string[];
}

/**
 * The attendance board: per phase, who said what, and which members who are
 * coming have not answered. Names are sorted. `coming` are the members asked.
 */
export function attendanceBoard(
  entries: readonly AttendanceEntry[],
  coming: readonly { userId: string; name: string }[],
): AttendancePhaseBoard[] {
  const byName = (a: string, b: string) => a.localeCompare(b);
  return ATTENDANCE_PHASES.map((phase) => {
    const mine = entries.filter((e) => e.phase === phase);
    const answered = new Set(mine.map((e) => e.userId));
    const names = Object.fromEntries(
      ATTENDANCE_ANSWERS.map((answer) => [
        answer,
        mine
          .filter((e) => e.answer === answer)
          .map((e) => e.name)
          .sort(byName),
      ]),
    ) as Record<AttendanceAnswer, string[]>;
    return {
      phase,
      names,
      notAnswered: coming
        .filter((m) => !answered.has(m.userId))
        .map((m) => m.name)
        .sort(byName),
    };
  });
}

// --- AfrikaBurn deadlines ----------------------------------------------------

/**
 * Whether someone may add, change, tick or remove the year's AfrikaBurn
 * deadlines: a captain (owner, 2026-09-30: "Captains add"). They are camp
 * config and go onto the camp calendar. Every member reads them.
 */
export function canManageDeadlines(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * What the camp calendar must do so it matches a deadline: `put` the event
 * when it has a date and is not removed, `remove` it when it may still be
 * there, `none` otherwise.
 */
export function deadlineCalendarStep(deadline: {
  dueDate: string | null;
  removed: boolean;
  calendarEventId: string | null;
}): "put" | "remove" | "none" {
  const date = deadline.removed ? null : deadline.dueDate;
  return logisticsCalendarStep({
    startDate: date,
    endDate: date,
    calendarEventId: deadline.calendarEventId,
  });
}
