import { z } from "zod";
import { Team } from "./roles";

// What a team's leads and captains write on its program (owner's ruling 4,
// 2026-09-27): one short description of what the team does. Who may write for
// which team is the server's rule (canEditTeamProgram in @camp404/core), not
// this shape's.
//
// No links (owner, 2026-09-27): everything happens inside the app, so a team
// program never offers links to outside tools.

/** The longest description a team's program shows. */
export const TEAM_DESCRIPTION_MAX = 300;

export const TeamProgramInput = z.object({
  team: Team,
  description: z
    .string()
    .trim()
    .max(
      TEAM_DESCRIPTION_MAX,
      `Keep the description under ${TEAM_DESCRIPTION_MAX} characters.`,
    ),
  /** The version the editor opened; 0 when the team had nothing saved. */
  expectedVersion: z.number().int().min(0),
});
export type TeamProgramInput = z.infer<typeof TeamProgramInput>;
