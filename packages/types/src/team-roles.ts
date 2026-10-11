import { z } from "zod";
import { Team } from "./roles";

// Help wanted (owner's pick A, 2026-10-09): each team's roles for this year
// and who fills them. "Lead" is the first role of every team, always, and its
// people are the lead flag on team_memberships: it is never a row of its own.
// Who may change roles and give them out is the server's rule
// (canManageTeamRoles / canPickTeamLead in @camp404/core), never this shape's.

export const TEAM_ROLE_NAME_MAX = 60;
export const TEAM_ROLE_NOTE_MAX = 120;
/** The most people one role takes, and the most leads a team may want. */
export const TEAM_ROLE_MAX_PLACES = 20;
/** A guard against a runaway list: roles per team per year, Lead aside. */
export const MAX_TEAM_ROLES = 30;

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const uuid = z.guid();
/** A member's id. The database checks it is a uuid; the E2E store's are not. */
const memberId = z.string().min(1).max(100);

const places = (what: string) =>
  z
    .number({ message: `Say how many ${what}.` })
    .int(`Say how many ${what}.`)
    .min(1, "At least 1.")
    .max(TEAM_ROLE_MAX_PLACES, `${TEAM_ROLE_MAX_PLACES} at most.`);

/** Adding a role to a team (no `id`) or changing one of this year's. */
export const SaveTeamRoleInput = z.object({
  id: uuid.nullable().optional(),
  team: Team,
  name: z
    .string()
    .trim()
    .min(1, "Give the role a name.")
    .max(
      TEAM_ROLE_NAME_MAX,
      `Keep the name under ${TEAM_ROLE_NAME_MAX} characters.`,
    )
    .refine((v) => v.toLowerCase() !== "lead", "Every team has Lead already."),
  places: places("people it needs"),
  note: z
    .string()
    .trim()
    .max(
      TEAM_ROLE_NOTE_MAX,
      `Keep the note under ${TEAM_ROLE_NOTE_MAX} characters.`,
    )
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  /** The version the editor saw; 0 for a new role. */
  expectedVersion: z.number().int().min(0),
});
export type SaveTeamRoleInput = z.infer<typeof SaveTeamRoleInput>;

/** Removing a role (only while nobody fills it). */
export const RemoveTeamRoleInput = z.object({
  id: uuid,
  expectedVersion: z.number().int().min(1),
});
export type RemoveTeamRoleInput = z.infer<typeof RemoveTeamRoleInput>;

/** How many leads a team wants this year. */
export const SetLeadPlacesInput = z.object({
  team: Team,
  places: places("leads the team wants"),
});
export type SetLeadPlacesInput = z.infer<typeof SetLeadPlacesInput>;

/** Copying a team's roles from the last year it had any. */
export const CopyTeamRolesInput = z.object({ team: Team });
export type CopyTeamRolesInput = z.infer<typeof CopyTeamRolesInput>;

/**
 * Which role: one of this year's role rows by id, or the team's Lead
 * (`roleId: null`).
 */
const roleRef = { team: Team, roleId: uuid.nullable() };

/** The signed-in member pressing "I'm keen", or Undo. */
export const TeamRoleKeenInput = z.object({ ...roleRef, keen: z.boolean() });
export type TeamRoleKeenInput = z.infer<typeof TeamRoleKeenInput>;

/** A captain or a lead of the team giving a role to someone, or taking it back. */
export const TeamRoleMemberInput = z.object({ ...roleRef, userId: memberId });
export type TeamRoleMemberInput = z.infer<typeof TeamRoleMemberInput>;
