import { z } from "zod";
import { Team } from "./roles";

// What a team's leads and captains write on its program (owner's ruling 4,
// 2026-09-27): one short description of what the team does, and a few links.
// Who may write for which team is the server's rule (canEditTeamProgram in
// @camp404/core), not this shape's.

/** The longest description a team's program shows. */
export const TEAM_DESCRIPTION_MAX = 300;
/** How many links a team keeps. */
export const TEAM_LINKS_MAX = 8;
/** The longest name a link may have. */
export const TEAM_LINK_LABEL_MAX = 60;
/** The longest address a link may have. */
export const TEAM_LINK_URL_MAX = 500;

/**
 * A web address: http:// or https://, a host, then optionally a path, query
 * or fragment, with no spaces. A pattern, not the URL class, so it reads the
 * same in every runtime this package is built for.
 */
const WEB_ADDRESS = /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;

/** Whether text is a full web address that starts with http:// or https://. */
export function isWebAddress(value: string): boolean {
  return WEB_ADDRESS.test(value);
}

export const TeamLink = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give each link a name.")
    .max(
      TEAM_LINK_LABEL_MAX,
      `Keep each link's name under ${TEAM_LINK_LABEL_MAX} characters.`,
    ),
  url: z
    .string()
    .trim()
    .min(1, "Give each link its web address.")
    .max(
      TEAM_LINK_URL_MAX,
      `Keep each web address under ${TEAM_LINK_URL_MAX} characters.`,
    )
    .refine(
      isWebAddress,
      "A link must be a web address that starts with https:// or http://.",
    ),
});
export type TeamLink = z.infer<typeof TeamLink>;

export const TeamProgramInput = z.object({
  team: Team,
  description: z
    .string()
    .trim()
    .max(
      TEAM_DESCRIPTION_MAX,
      `Keep the description under ${TEAM_DESCRIPTION_MAX} characters.`,
    ),
  links: z
    .array(TeamLink)
    .max(TEAM_LINKS_MAX, `A team can keep up to ${TEAM_LINKS_MAX} links.`),
  /** The version the editor opened; 0 when the team had nothing saved. */
  expectedVersion: z.number().int().min(0),
});
export type TeamProgramInput = z.infer<typeof TeamProgramInput>;
