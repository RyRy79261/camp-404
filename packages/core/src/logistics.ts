import {
  AFRIKABURN_DATE_KINDS,
  ATTENDANCE_ANSWERS,
  ATTENDANCE_PHASES,
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_LABELS,
  ViewerRank,
  type AfrikaburnDateKind,
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
// AFRIKABURN DATES. The year page lists AfrikaBurn's standard dates
// (AFRIKABURN_DATES), each "Not announced yet" until a captain sets it, and
// "Other" ones a captain adds with a title of their own. Each with a date is
// one whole-camp event on the camp calendar, "AfrikaBurn: <name>".

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

// --- AfrikaBurn's standard dates ---------------------------------------------
// The dates AfrikaBurn sets every year, grouped as the year page and
// Logistics show them (owner, 2026-10-01, mock-up A: "The year's standard
// AfrikaBurn dates are already listed; a captain fills in each date when
// AfrikaBurn announces it"). Stored one row per (year, kind) at most, and
// only once a captain sets it.

export type AfrikaburnDateGroup = "registration" | "art" | "wap" | "tickets";

/** The groups, in the order the year runs; "Other" follows them. */
export const AFRIKABURN_DATE_GROUPS: readonly {
  key: AfrikaburnDateGroup;
  /** On a wide page. */
  label: string;
  /** On a phone. */
  shortLabel: string;
}[] = [
  {
    key: "registration",
    label: "Theme camp registration",
    shortLabel: "Registration",
  },
  { key: "art", label: "Art", shortLabel: "Art" },
  { key: "wap", label: "Work access passes (WAP)", shortLabel: "WAP" },
  { key: "tickets", label: "Tickets (DDT)", shortLabel: "Tickets" },
];

/** The heading of the captain's own dates, after the standard groups. */
export const AFRIKABURN_OTHER_GROUP_LABEL = "Other";

export interface AfrikaburnDate {
  kind: AfrikaburnDateKind;
  group: AfrikaburnDateGroup;
  /** Its name, on a wide page and on the camp calendar. */
  name: string;
  /** Its name on a phone, under its group's heading. */
  shortName: string;
  /** What it is, in a line, where it is not obvious. */
  help: string | null;
  /** Whether a year may have none ("No round this year"). */
  mayBeSkipped: boolean;
}

const date = (
  kind: AfrikaburnDateKind,
  group: AfrikaburnDateGroup,
  name: string,
  shortName: string,
  help: string | null = null,
  mayBeSkipped = false,
): AfrikaburnDate => ({ kind, group, name, shortName, help, mayBeSkipped });

/** AfrikaBurn's standard dates, in the order the year runs. */
export const AFRIKABURN_DATES: readonly AfrikaburnDate[] = [
  date(
    "form_1_opens",
    "registration",
    "Form 1 registration opens",
    "Form 1 opens",
    "The camp says what it is and what it gifts.",
  ),
  date(
    "form_2",
    "registration",
    "Form 2 registration",
    "Form 2",
    "Size, placement, sound, layout; art projects register here too.",
  ),
  date(
    "registration_closes",
    "registration",
    "Registration closes",
    "Registration closes",
  ),
  date(
    "art_grants_close",
    "art",
    "Art grant applications close",
    "Grant applications close",
  ),
  date("wap_requests_open", "wap", "WAP requests open", "Requests open"),
  date("wap_requests_close", "wap", "WAP requests close", "Requests close"),
  date("waps_sent_out", "wap", "WAPs sent out", "WAPs sent out"),
  date(
    "tickets_open",
    "tickets",
    "Ticket distribution opens",
    "Distribution opens",
  ),
  date(
    "ddt_deadline",
    "tickets",
    "DDT deadline",
    "DDT deadline",
    "Direct distribution tickets for the camp.",
  ),
  date(
    "second_ddt_round",
    "tickets",
    "Second DDT round",
    "Second DDT round",
    "Only some years.",
    true,
  ),
  date(
    "tickets_close",
    "tickets",
    "Ticket distribution closes",
    "Distribution closes",
  ),
];

const BY_KIND = new Map(AFRIKABURN_DATES.map((d) => [d.kind, d]));

/** Whether a stored key is one of AfrikaBurn's standard dates. */
export function isAfrikaburnDateKind(
  kind: unknown,
): kind is AfrikaburnDateKind {
  return (
    typeof kind === "string" &&
    (AFRIKABURN_DATE_KINDS as readonly string[]).includes(kind)
  );
}

/** A standard date by its key; undefined for an unknown key. */
export function afrikaburnDate(kind: string): AfrikaburnDate | undefined {
  return isAfrikaburnDateKind(kind) ? BY_KIND.get(kind) : undefined;
}

/** Whether a year may say "No round this year" for this date. Fails closed. */
export function afrikaburnDateMayBeSkipped(kind: string): boolean {
  return afrikaburnDate(kind)?.mayBeSkipped === true;
}

/** The plain words for a skipped date, on every page. */
export const NO_ROUND_THIS_YEAR = "No round this year";

const EVENT_PREFIX = "AfrikaBurn: ";

/**
 * A date's title on the camp calendar: "AfrikaBurn: Registration closes".
 * Plain and whole-camp, like the logistics phases. A standard date's name
 * comes from the list, so it follows a rename; an "Other" one is the
 * captain's title, not prefixed twice when they typed "AfrikaBurn" already.
 */
export function afrikaburnEventTitle(row: {
  kind: string | null;
  title: string;
}): string {
  const name = (row.kind && afrikaburnDate(row.kind)?.name) || row.title;
  return /^afrikaburn\b/i.test(name) ? name : `${EVENT_PREFIX}${name}`;
}

// --- Burn timeline (#249) ----------------------------------------------------

/** A phase with its days, as the timeline reads it. */
export interface TimelinePhase {
  phase: LogisticsPhase;
  /** YYYY-MM-DD, or null when not set yet. */
  startDate: string | null;
  endDate: string | null;
}

/** One column of the day strip: a day, or a run of days with nothing on. */
export type TimelineColumn =
  | {
      kind: "day";
      /** YYYY-MM-DD */
      date: string;
      phase: LogisticsPhase;
      /** The phase's first day: its band's label goes here. */
      first: boolean;
      /** The whole camp is asked to help (an attendance phase). */
      allHands: boolean;
      /** Going: the phase's going count; on burn days, the accepted members. Null: not asked (travel). */
      people: number | null;
      /** Maybe, on the phases asked; null elsewhere. */
      maybe: number | null;
    }
  | {
      kind: "gap";
      /** The first and last day with nothing on, YYYY-MM-DD. */
      from: string;
      to: string;
    };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The burn timeline's day strip (Option A of design/print-burn-timeline.html,
 * owner 2026-10-02): every day from the first phase's first day to the last
 * phase's last day, each under its phase; a run of days between phases with
 * nothing on is one shaded column. Where two phases share a day, the later
 * phase in the camp's order has it. Counts only, never names: the attendance
 * phases (pack, build, strike, unpack) show who said going and maybe, and
 * are all hands; burn days show the members the captains accepted; travel
 * has no answers, so no count.
 */
export function burnTimeline(input: {
  phases: readonly TimelinePhase[];
  /** Going and maybe per attendance phase. */
  answers: Partial<Record<AttendancePhase, { going: number; maybe: number }>>;
  /** Members the captains accepted this year. */
  accepted: number;
}): TimelineColumn[] {
  const order = (p: LogisticsPhase) => LOGISTICS_PHASES.indexOf(p);
  const dated = input.phases.filter(
    (p): p is TimelinePhase & { startDate: string; endDate: string } =>
      p.startDate !== null &&
      p.endDate !== null &&
      ISO.test(p.startDate) &&
      ISO.test(p.endDate) &&
      p.startDate <= p.endDate,
  );
  if (dated.length === 0) return [];
  const start = dated.map((p) => p.startDate).sort()[0]!;
  const end = dated
    .map((p) => p.endDate)
    .sort()
    .at(-1)!;

  const columns: TimelineColumn[] = [];
  let previous: LogisticsPhase | null = null;
  // A guard far past any real year: phases run 31 days at most each.
  for (let day = start, n = 0; day <= end && n < 400; day = nextDay(day), n++) {
    const on = dated
      .filter((p) => p.startDate <= day && day <= p.endDate)
      .sort((a, b) => order(b.phase) - order(a.phase))[0];
    if (!on) {
      const last = columns.at(-1);
      if (last?.kind === "gap") last.to = day;
      else columns.push({ kind: "gap", from: day, to: day });
      previous = null;
      continue;
    }
    const phase = on.phase;
    const asked = (ATTENDANCE_PHASES as readonly string[]).includes(phase);
    const answers = asked
      ? (input.answers[phase as AttendancePhase] ?? { going: 0, maybe: 0 })
      : null;
    columns.push({
      kind: "day",
      date: day,
      phase,
      first: previous !== phase,
      allHands: asked,
      people: answers
        ? answers.going
        : phase === "burn"
          ? input.accepted
          : null,
      maybe: answers ? answers.maybe : null,
    });
    previous = phase;
  }
  return columns;
}
