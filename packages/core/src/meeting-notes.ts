import { ViewerRank } from "@camp404/types";
import { CAMP_TIME_ZONE } from "./time-zone";

// Meeting notes (#268): what a team's meeting (or the whole camp's) planned,
// decided and handed out. Pure: no DB, no session, no next/*.
//
// WHO MAY WRITE. The team dashboards' write rule (#267, owner 2026-09-24:
// "anyone can look, only team members can work in it"). Clearance stays
// global (AGENTS.md): this is not a read tier, every approved member reads
// every note. Team identity decides only who may write a team's notes: a
// member of that team this year (its leads are members too), or a captain,
// who runs the camp and works in every team without joining it (the epic's
// proposal for its open question 1). A whole-camp note (no team) is a
// captain's. It fails closed on a rank this module does not know. The write
// re-reads the actor's rank and teams inside its own transaction and passes
// them here; it never takes a team list from the caller.
//
// Turning an action item into a task is NOT this rule: it is the task board's
// own (a captain, or a lead of the task's team), checked by the board's add
// path inside the same transaction.

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may work in a team's tools, here its meeting notes: a
 * captain for any team or the whole camp (`team` null); anyone else only for
 * a team in `memberTeams`, the teams they are on this year.
 */
export function canWorkInTeam(
  rank: string,
  memberTeams: readonly string[],
  team: string | null,
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (team === null) return false;
  return memberTeams.includes(team);
}

/** The reminder the editor shows above the note (#268's rule). */
export const MEETING_NOTE_PRIVACY_REMINDER =
  "Notes are for the camp only. Don't write bank details, ID numbers or anyone's medical details here.";

/**
 * The instant a meeting starts: a camp day (YYYY-MM-DD) and a time (HH:MM) in
 * camp time. Johannesburg is UTC+2 all year, so the offset is fixed (the same
 * rule as campDayStart).
 */
export function meetingInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00+02:00`);
}

const TIME_KEY = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: CAMP_TIME_ZONE,
});

/** A meeting's time of day in camp time, HH:MM, for the editor. */
export function meetingTimeKey(instant: Date): string {
  return TIME_KEY.format(instant);
}
