import { canEditTeamProgram } from "./team-programs";

// Help wanted (owner's pick A, 2026-10-09): every team's roles for this year
// and who fills them, so the camp sees which teams still need a lead and
// which roles are open. Pure: no DB, no session, no next/*.
//
// LEAD IS THE FIRST ROLE OF EVERY TEAM, ALWAYS, and its people are the lead
// flag on team_memberships (setLead). There is no second record of who leads.
// How many leads a team wants (1 unless changed) is the Lead role's places.
//
// WHO MAY DO WHAT. Every approved member reads every team's roles and who
// fills them, and presses "I'm keen" for themselves. A captain, or a lead OF
// THAT TEAM this year, adds, changes and removes the team's roles, copies last
// year's, gives a role to someone and takes it back (canManageTeamRoles, the
// team-program rule). Giving or taking the Lead role is a captain's alone
// (canPickTeamLead): it changes who stands on the team_lead rung, which
// setLead keeps for captains. Who is keen is read by the same people as may
// give the role; a member reads only their own keen flags. Clearance stays
// global (AGENTS.md); team identity decides only which team's roles a lead
// may run. Both rules fail closed. The writes re-read the actor's rank and
// led teams inside their own transaction and pass those here.

/**
 * Whether someone may run `team`'s roles this year: add, change, remove, copy
 * last year's, give one to someone or take it back (Lead aside), and read who
 * is keen. A captain, or a lead of that team.
 */
export function canManageTeamRoles(
  rank: string,
  ledTeams: readonly string[],
  team: string,
): boolean {
  return canEditTeamProgram(rank, ledTeams, team);
}

/**
 * Whether someone may give the Lead role or take it back: a captain. It is
 * the lead flag itself, and with it the team_lead rung everywhere.
 */
export function canPickTeamLead(rank: string): boolean {
  return rank === "captain";
}

/** How full one role is. */
export interface RoleFill {
  filled: number;
  places: number;
}

/** A role still has a place nobody fills. */
export function isRoleOpen(role: RoleFill): boolean {
  return role.filled < role.places;
}

/** One team as the board counts it: its Lead, its other roles, and whether it is the viewer's. */
export interface HelpWantedTeamShape {
  lead: RoleFill;
  roles: readonly RoleFill[];
  /** The viewer is on this team this year. */
  mine: boolean;
}

/** A team with nobody leading it this year. */
export function teamNeedsLead(team: HelpWantedTeamShape): boolean {
  return team.lead.filled === 0;
}

/** A team with a role (Lead aside) that still has a place open. */
export function teamHasOpenRoles(team: HelpWantedTeamShape): boolean {
  return team.roles.some(isRoleOpen);
}

/**
 * Places filled across a team's roles, Lead aside, and how many there are. A
 * role over-filled (its places lowered by hand) counts as full, never more.
 */
export function teamPlacesFilled(team: HelpWantedTeamShape): RoleFill {
  let filled = 0;
  let places = 0;
  for (const r of team.roles) {
    filled += Math.min(r.filled, r.places);
    places += r.places;
  }
  return { filled, places };
}

export const HELP_WANTED_FILTERS = ["all", "lead", "open", "mine"] as const;
export type HelpWantedFilter = (typeof HELP_WANTED_FILTERS)[number];

export const HELP_WANTED_FILTER_LABELS: Readonly<
  Record<HelpWantedFilter, string>
> = {
  all: "All",
  lead: "Needs a lead",
  open: "Open roles",
  mine: "My teams",
};

/** Whether a team shows under a filter chip. */
export function matchesHelpWantedFilter(
  team: HelpWantedTeamShape,
  filter: HelpWantedFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "lead":
      return teamNeedsLead(team);
    case "open":
      return teamHasOpenRoles(team);
    case "mine":
      return team.mine;
  }
}

/** The page's summary line and the count on each chip. */
export interface HelpWantedSummary {
  teamsNeedingLead: number;
  /** Roles, Lead aside, with a place open. */
  rolesOpen: number;
  counts: Record<HelpWantedFilter, number>;
}

export function helpWantedSummary(
  teams: readonly HelpWantedTeamShape[],
): HelpWantedSummary {
  const counts = Object.fromEntries(
    HELP_WANTED_FILTERS.map((f) => [
      f,
      teams.filter((t) => matchesHelpWantedFilter(t, f)).length,
    ]),
  ) as Record<HelpWantedFilter, number>;
  return {
    teamsNeedingLead: counts.lead,
    rolesOpen: teams.reduce((n, t) => n + t.roles.filter(isRoleOpen).length, 0),
    counts,
  };
}

/** Teams that need a lead first, each group in the order it came. */
export function orderHelpWanted<T extends HelpWantedTeamShape>(
  teams: readonly T[],
): T[] {
  return [
    ...teams.filter((t) => teamNeedsLead(t)),
    ...teams.filter((t) => !teamNeedsLead(t)),
  ];
}

/** "4 teams need a lead" / "1 team needs a lead". */
export function teamsNeedLeadText(n: number): string {
  return `${n} ${n === 1 ? "team needs" : "teams need"} a lead`;
}

/** "9 roles open" / "1 role open". */
export function rolesOpenText(n: number): string {
  return `${n} ${n === 1 ? "role" : "roles"} open`;
}

/**
 * What the right-hand slot of a role's row holds for one viewer:
 *
 *  - `pick`: "Pick someone" (an open role the viewer may give);
 *  - `captain_picks`: a lead of the team on its open Lead role, which only a
 *    captain gives: a quiet line, never a disabled button;
 *  - `full`: quiet "Full" text;
 *  - `yours`: quiet "Yours" (the viewer fills it);
 *  - `keen` / `unkeen`: "I'm keen", or "You're keen ✓ · Undo".
 */
export type RoleAction =
  | "pick"
  | "captain_picks"
  | "full"
  | "yours"
  | "keen"
  | "unkeen";

export function roleAction(input: {
  open: boolean;
  isLead: boolean;
  /** The viewer may run this team's roles. */
  manages: boolean;
  /** The viewer may give the Lead role. */
  picksLead: boolean;
  /** The viewer fills this role. */
  holds: boolean;
  /** The viewer pressed "I'm keen" on it. */
  keen: boolean;
}): RoleAction {
  if (input.manages) {
    if (!input.open) return "full";
    if (input.isLead && !input.picksLead) {
      return input.holds ? "yours" : "captain_picks";
    }
    return "pick";
  }
  if (input.holds) return "yours";
  if (!input.open) return "full";
  return input.keen ? "unkeen" : "keen";
}

/**
 * The picker's three groups for one role: people who pressed "I'm keen"
 * first, then the team's members, then everyone else, each without the
 * people who fill the role already. Ids, in the order given.
 */
export function pickerGroups(input: {
  keen: readonly string[];
  team: readonly string[];
  everyone: readonly string[];
  taken: readonly string[];
}): { keen: string[]; team: string[]; rest: string[] } {
  const taken = new Set(input.taken);
  const everyone = new Set(input.everyone);
  const keen = input.keen.filter((id) => !taken.has(id) && everyone.has(id));
  const seen = new Set([...taken, ...keen]);
  const team = input.team.filter((id) => !seen.has(id) && everyone.has(id));
  for (const id of team) seen.add(id);
  const rest = input.everyone.filter((id) => !seen.has(id));
  return { keen, team, rest };
}
