// A team program's fixed sentences (docs/specs/2026-09-27-team-programs.md).
// A plain module: a "use server" file may export only async functions, so the
// action and the screens that show these words share them from here. Pure, so
// the client editor imports it too.

/** What anyone who may not edit a team's program is told, by the action. */
export const TEAM_PROGRAM_REFUSAL =
  "Only captains and this team's leads can change what its program says.";
export const CHECK_TEAM_PROGRAM =
  "Check the description and links and try again.";

/** The path of a team's program. */
export function teamProgramPath(team: string): string {
  return `/teams/${team}`;
}
