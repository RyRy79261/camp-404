import { Team, ViewerRank } from "@camp404/types";

// Team programs (docs/specs/2026-09-27-team-programs.md): each team's own
// window on the 404 OS desktop. Pure: no DB, no session, no next/*.
//
// WHO MAY CHANGE THINGS IN A TEAM'S PROGRAM (owner's ruling 1, 2026-09-27):
// a captain, or a lead OF THAT TEAM this year. Clearance stays global
// (AGENTS.md): a lead of any team stands on the `team_lead` rung everywhere,
// and team identity decides only which team a lead may act for, as
// canApproveRecipe does for the Kitchen and canEditPower for Power. Every
// approved member reads every team's program.
//
// It fails closed: a rank this module does not know, or a team key that is
// not a team, answers false, a captain's included. The write re-reads the
// actor's rank and led teams inside its own transaction and passes those
// here; it never takes a team list from the caller.

/**
 * Whether someone may change a team's program (its description and links
 * today). `ledTeams` are the team keys they lead this year.
 */
export function canEditTeamProgram(
  rank: string,
  ledTeams: readonly string[],
  teamKey: string,
): boolean {
  if (!ViewerRank.safeParse(rank).success) return false;
  if (!Team.safeParse(teamKey).success) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(teamKey);
  return false;
}
