import { ViewerRank } from "@camp404/types";

// The camp's own events and meetings, made in the Calendar (owner,
// 2026-10-10: "Meetings is a type of calendar item, it shouldn't be a
// separate app, you make events in the calendar app"). Pure: no DB, no
// session, no next/*.
//
// WHO MAKES THEM (owner's 1A): captains and team leads create, change and
// remove events and meetings. A team lead does it only for a team they lead
// this year; a whole-camp event (no team) is a captain's. It fails closed on a
// rank this module does not know. The write reads the actor's rank and the
// teams they lead again inside its own transaction and passes them here; it
// never takes a team list from the caller.
//
// WHO WRITES A MEETING'S AGENDA AND MINUTES is not this rule: it is the meeting
// notes' (canWorkInTeam in ./meeting-notes: the team's members this year, and
// captains).

export type CampEventKind = "event" | "meeting";

export const CAMP_EVENT_KINDS: readonly CampEventKind[] = ["event", "meeting"];

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may make, change or remove an event for `team` (null: the
 * whole camp): a captain for any; a team lead for a team in `ledTeams`, the
 * teams they lead this year; nobody else.
 */
export function canManageCampEvent(
  rank: string,
  ledTeams: readonly string[],
  team: string | null,
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank !== "team_lead" || team === null) return false;
  return ledTeams.includes(team);
}

/** Whether someone may make any event at all: a captain, or a lead of a team. */
export function canCreateCampEvents(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  return rank === "captain" || (rank === "team_lead" && ledTeams.length > 0);
}

export const NOT_AN_EVENT_MAKER =
  "Only captains and team leads can add events to the calendar.";
export const WHOLE_CAMP_EVENTS_ARE_CAPTAINS =
  "Whole camp events are for captains. Pick a team you lead.";
export const NOT_YOUR_EVENT_TEAM =
  "You can add and change events only for a team you lead.";

/**
 * The refusal for someone who may not manage an event for `team`, or null.
 * `reach` is what the write read inside its transaction: undefined for a
 * captain, otherwise the teams the actor leads this year (none for a member).
 */
export function campEventRefusal(
  reach: readonly string[] | undefined,
  team: string | null,
): string | null {
  if (reach === undefined) return null;
  if (reach.length === 0) return NOT_AN_EVENT_MAKER;
  if (team === null) return WHOLE_CAMP_EVENTS_ARE_CAPTAINS;
  if (!reach.includes(team)) return NOT_YOUR_EVENT_TEAM;
  return null;
}

/** An event's days and times, as stored. */
export interface CampEventWhen {
  allDay: boolean;
  /** Camp days, YYYY-MM-DD; the end is the last day, counted. */
  startDate: string;
  endDate: string;
  /** HH:MM camp time; null for an all-day event. */
  startTime: string | null;
  endTime: string | null;
}

/**
 * Whether a meeting note holds minutes: anything written after the meeting
 * (the notes, a decision, an action item or who came). The agenda alone is not
 * minutes: it is written before.
 */
export function hasMinutes(note: {
  notes: string;
  decisions: number;
  actionItems: number;
  attendees: number;
}): boolean {
  return (
    note.notes.trim().length > 0 ||
    note.decisions > 0 ||
    note.actionItems > 0 ||
    note.attendees > 0
  );
}

export const MEETING_HAS_MINUTES =
  "This meeting has minutes, so it stays on the calendar. Change its details instead.";

/**
 * What the camp calendar must do for an event row as saved: put it there, take
 * it off (a removed row), or nothing (it already matches, or there is no id).
 */
export function campEventCalendarStep(row: {
  removed: boolean;
  calendarEventId: string | null;
}): "put" | "remove" | "none" {
  if (!row.calendarEventId) return "none";
  return row.removed ? "remove" : "put";
}

/** One hour after HH:MM, kept on the same day (23:59 at the latest). */
export function anHourAfter(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const minutes = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
