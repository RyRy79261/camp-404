import {
  LOGISTICS_PHASE_LABELS,
  ViewerRank,
  type LogisticsPhase,
} from "@camp404/types";
import { teamEventTitle } from "./calendar-titles";

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
// event, titled in the camp's convention ("Transport and Logistics Team -
// Build") and carrying the team's key, so the team's page and Home's "Coming
// up" read it like any other team event.

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
 * A phase's title on the camp's Google Calendar: "Transport and Logistics
 * Team - Build". `teamLabel` is the team's name as the camp calls it.
 */
export function logisticsEventTitle(
  teamLabel: string,
  phase: LogisticsPhase,
): string {
  return teamEventTitle(teamLabel, LOGISTICS_PHASE_LABELS[phase]);
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
