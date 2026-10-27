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

/** Who an event is for (owner, 2026-10-27). */
export type CampEventAudience = "camp" | "team" | "team_leads" | "people";

export const PICK_A_TEAM = "Pick a team.";
export const PICK_SOMEONE = "Pick at least one person.";

/**
 * Who an event is for, as stored, or the refusal: a form that names no
 * audience is its team's, or the camp's with no team; only a `team` event
 * keeps a team. `keptPeople` are the picked members the write found still
 * approved and here (each side reads its own members); a `people` event with
 * none is refused, and any other audience keeps nobody.
 */
export function storedCampEventAudience<T extends string>(
  fields: { audience?: CampEventAudience; team: T | null },
  keptPeople: readonly string[],
):
  | {
      ok: true;
      audience: CampEventAudience;
      team: T | null;
      peopleUserIds: string[];
    }
  | { ok: false; error: string } {
  const audience = fields.audience ?? (fields.team ? "team" : "camp");
  if (audience === "team") {
    return fields.team
      ? { ok: true, audience, team: fields.team, peopleUserIds: [] }
      : { ok: false, error: PICK_A_TEAM };
  }
  if (audience !== "people") {
    return { ok: true, audience, team: null, peopleUserIds: [] };
  }
  return keptPeople.length > 0
    ? { ok: true, audience, team: null, peopleUserIds: [...keptPeople] }
    : { ok: false, error: PICK_SOMEONE };
}

export const CAMP_EVENT_KINDS: readonly CampEventKind[] = ["event", "meeting"];

/**
 * What a new event is (owner, 2026-10-11): one added with an agenda is a
 * meeting, with its meeting note made from the same agenda; one with no
 * agenda is what it was asked to be (a plain event, unless the Calendar's
 * caller says meeting).
 */
export function campEventKindFor(
  asked: CampEventKind,
  agenda: string,
): CampEventKind {
  return agenda.trim() ? "meeting" : asked;
}

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
// An event for the team leads or for people picked by name has no team, so
// it is a captain's like a whole-camp one (owner, 2026-10-27).
export const WHOLE_CAMP_EVENTS_ARE_CAPTAINS =
  "Events for the whole camp, the team leads or picked people are for captains. Pick a team you lead.";
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

/**
 * The refusal for a change that moves an event from team `from` to team `to`
 * (null: the whole camp), or null: the actor must be allowed for the event's
 * team as it was, and, when the change moves it, for the team it goes to, so
 * a lead cannot move another team's event to theirs.
 */
export function campEventChangeRefusal(
  reach: readonly string[] | undefined,
  from: string | null,
  to: string | null,
): string | null {
  return (
    campEventRefusal(reach, from) ??
    (to !== from ? campEventRefusal(reach, to) : null)
  );
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
 * An event's days and times as they are stored: an all-day event keeps its
 * days and no times; a timed one is on its first day only, ending that day.
 */
export function storedCampEventWhen(when: CampEventWhen): CampEventWhen {
  return {
    allDay: when.allDay,
    startDate: when.startDate,
    endDate: when.allDay ? when.endDate : when.startDate,
    startTime: when.allDay ? null : when.startTime,
    endTime: when.allDay ? null : when.endTime,
  };
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
