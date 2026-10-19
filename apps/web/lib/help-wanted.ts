import "server-only";

import {
  canManageTeamRoles,
  canPickTeamLead,
  helpWantedSummary,
  isRoleOpen,
  orderHelpWanted,
  roleAction,
  type HelpWantedSummary,
  type RoleAction,
  type RoleFill,
} from "@camp404/core";
import * as db from "@camp404/db/team-roles";
import type { TeamRoleWriteResult } from "@camp404/db/team-roles";
import type {
  CopyTeamRolesInput,
  RemoveTeamRoleInput,
  SaveTeamRoleInput,
  SetLeadPlacesInput,
  Team,
  TeamRoleKeenInput,
  TeamRoleMemberInput,
  ViewerRank,
} from "@camp404/types";
import { getCampSettings } from "./camp-config";
import { LEAD_NOTE } from "./help-wanted-copy";
import { helpWantedTestStore } from "./test-store-help-wanted";
import { twin } from "./twin";

// Help wanted (owner's pick A, 2026-10-09): from the database or, under E2E,
// the test store. Every approved member reads every team's roles and who
// fills them. What each viewer gets is decided HERE, on the server, never
// hidden in the UI:
//
//  - Who is keen on a role reaches only a viewer who may give that role (a
//    captain, or a lead of the team: canManageTeamRoles). Everyone else gets
//    only whether THEY are keen, and how many roles they are keen on.
//  - Member ids (to take someone out of a role) and the picker's list of
//    everyone reach only a viewer who runs at least one team's roles.
//  - Lead is the first row of every team, built from the lead flag on
//    team_memberships: there is no other record of who leads.
//
// The data functions pick the store once (twin below); the writes' checks
// live once in @camp404/core (newRoleProblem, roleChangeProblem, keenProblem,
// ...), and lib/__tests__/help-wanted-agreement.test.ts holds the rest equal.

export type { TeamRoleWriteResult };

export interface HelpWantedPersonView {
  /** Only for a viewer who runs this team's roles. */
  userId: string | null;
  name: string;
  you: boolean;
}

export interface HelpWantedRoleView {
  /** Stable for React and the e2e: the role's id, or `lead:<team>`. */
  key: string;
  /** The role row's id; null for Lead. */
  roleId: string | null;
  isLead: boolean;
  name: string;
  note: string | null;
  places: number;
  filled: number;
  open: boolean;
  /** For a change: the version the editor saw (0 for Lead). */
  version: number;
  people: HelpWantedPersonView[];
  /** Who is keen: only for a viewer who may give the role, else null. */
  keen: { userId: string; name: string }[] | null;
  action: RoleAction;
  /** The pencil: the viewer may change this role (Lead: how many leads). */
  canEdit: boolean;
  /** The viewer may take someone out of it (Lead: a captain only). */
  canTake: boolean;
}

export interface HelpWantedTeamView {
  key: Team;
  label: string;
  /** The viewer is on this team this year. */
  mine: boolean;
  /** The viewer runs this team's roles. */
  manages: boolean;
  lead: RoleFill;
  roles: RoleFill[];
  rows: HelpWantedRoleView[];
  /** Who leads it, by name ("You" for the viewer). */
  leadNames: string[];
  /** Last year's roles, while the team has none this year. */
  lastYear: { name: string; places: number }[];
  /** This team's members' ids, for the picker: only when it manages. */
  memberIds: string[] | null;
}

export interface PickablePerson {
  userId: string;
  name: string;
  /** The teams they are on this year (labels). */
  teams: string[];
  /** Their team keys, to group the picker. */
  teamKeys: Team[];
}

export interface HelpWantedView {
  cycle: number;
  /** The year's name for the eyebrow, or null before a founding year. */
  year: number | null;
  teams: HelpWantedTeamView[];
  summary: HelpWantedSummary;
  /** How many roles the viewer pressed "I'm keen" on. */
  keenCount: number;
  /** Everyone a role may be given to: only for a viewer who runs a team. */
  everyone: PickablePerson[] | null;
  /** The viewer may give the Lead role (a captain). */
  picksLead: boolean;
}

const roles = twin(db, helpWantedTestStore, [
  "readHelpWanted",
  "listPickablePeople",
  "saveTeamRole",
  "removeTeamRole",
  "setLeadPlaces",
  "copyLastYearsRoles",
  "setKeen",
  "giveTeamRole",
  "takeTeamRole",
]);

/** The board as one viewer may see it. */
export async function getHelpWantedView(viewer: {
  userId: string;
  rank: ViewerRank;
  /** The teams the viewer leads this year. */
  ledTeams: readonly string[];
}): Promise<HelpWantedView> {
  const camp = await getCampSettings();
  const data = await roles.readHelpWanted(camp.cycleNumber);
  const picksLead = canPickTeamLead(viewer.rank);
  const active = [...camp.teams.teams]
    .filter((t) => !t.archived)
    .sort((a, b) => a.order - b.order);
  const labels = new Map(camp.teams.teams.map((t) => [t.key, t.label]));
  const managesAny = active.some((t) =>
    canManageTeamRoles(viewer.rank, viewer.ledTeams, t.key),
  );

  const person = (
    p: { userId: string; name: string },
    manages: boolean,
  ): HelpWantedPersonView => ({
    userId: manages ? p.userId : null,
    name: p.userId === viewer.userId ? "You" : p.name,
    you: p.userId === viewer.userId,
  });

  let keenCount = 0;
  const teams: HelpWantedTeamView[] = active.map((t) => {
    const team = t.key as Team;
    const manages = canManageTeamRoles(viewer.rank, viewer.ledTeams, team);
    const members = data.members.filter((m) => m.team === team);
    const leads = members.filter((m) => m.isLead);
    const keenHere = data.keen.filter((k) => k.team === team);
    const mine = members.some((m) => m.userId === viewer.userId);

    const row = (input: {
      roleId: string | null;
      name: string;
      note: string | null;
      places: number;
      version: number;
      people: { userId: string; name: string }[];
    }): HelpWantedRoleView => {
      const isLead = input.roleId === null;
      const keen = keenHere.filter((k) => k.roleId === input.roleId);
      const youKeen = keen.some((k) => k.userId === viewer.userId);
      const holds = input.people.some((p) => p.userId === viewer.userId);
      const fill = { filled: input.people.length, places: input.places };
      const open = isRoleOpen(fill);
      const action = roleAction({
        open,
        isLead,
        manages,
        picksLead,
        holds,
        keen: youKeen,
      });
      if (youKeen) keenCount += 1;
      return {
        key: input.roleId ?? `lead:${team}`,
        roleId: input.roleId,
        isLead,
        name: input.name,
        note: input.note,
        places: input.places,
        filled: input.people.length,
        open,
        version: input.version,
        people: input.people.map((p) => person(p, manages)),
        keen: manages
          ? keen.map((k) => ({ userId: k.userId, name: k.name }))
          : null,
        action,
        canEdit: manages,
        canTake: manages && (!isLead || picksLead),
      };
    };

    const leadPlaces =
      data.leadPlaces.find((l) => l.team === team)?.places ?? 1;
    const leadRow = row({
      roleId: null,
      name: "Lead",
      note: LEAD_NOTE,
      places: leadPlaces,
      version: 0,
      people: leads,
    });
    const roleRows = data.roles
      .filter((r) => r.team === team)
      .map((r) =>
        row({
          roleId: r.id,
          name: r.name,
          note: r.note,
          places: r.places,
          version: r.version,
          people: data.holders.filter((h) => h.roleId === r.id),
        }),
      );
    return {
      key: team,
      label: t.label,
      mine,
      manages,
      lead: { filled: leadRow.filled, places: leadRow.places },
      roles: roleRows.map((r) => ({ filled: r.filled, places: r.places })),
      rows: [leadRow, ...roleRows],
      leadNames: leadRow.people.map((p) => p.name),
      lastYear:
        roleRows.length === 0
          ? data.lastYear
              .filter((r) => r.team === team)
              .map((r) => ({ name: r.name, places: r.places }))
          : [],
      memberIds: manages ? members.map((m) => m.userId) : null,
    };
  });

  let everyone: PickablePerson[] | null = null;
  if (managesAny) {
    const teamsOf = new Map<string, Team[]>();
    for (const m of data.members) {
      teamsOf.set(m.userId, [...(teamsOf.get(m.userId) ?? []), m.team]);
    }
    everyone = (await roles.listPickablePeople()).map((p) => {
      const keys = teamsOf.get(p.userId) ?? [];
      return {
        userId: p.userId,
        name: p.name,
        teamKeys: keys,
        teams: keys.map((k) => labels.get(k) ?? k),
      };
    });
  }

  return {
    cycle: camp.cycleNumber,
    year: camp.current?.year ?? null,
    teams: orderHelpWanted(teams),
    summary: helpWantedSummary(teams),
    keenCount,
    everyone,
    picksLead,
  };
}

// --- Writes ----------------------------------------------------------------------
// Each passes only who is acting; the rule is checked inside the write.

export async function saveTeamRole(
  actorId: string,
  input: SaveTeamRoleInput,
): Promise<TeamRoleWriteResult> {
  const saved = await roles.saveTeamRole({
    ...input,
    note: input.note ?? null,
    actorId,
  });
  return saved.ok ? { ok: true } : saved;
}

export async function removeTeamRole(
  actorId: string,
  input: RemoveTeamRoleInput,
): Promise<TeamRoleWriteResult> {
  return roles.removeTeamRole({ ...input, actorId });
}

export async function setLeadPlaces(
  actorId: string,
  input: SetLeadPlacesInput,
): Promise<TeamRoleWriteResult> {
  return roles.setLeadPlaces({ ...input, actorId });
}

export async function copyLastYearsRoles(
  actorId: string,
  input: CopyTeamRolesInput,
): Promise<TeamRoleWriteResult<{ copied: number }>> {
  return roles.copyLastYearsRoles({ ...input, actorId });
}

export async function setKeen(
  userId: string,
  input: TeamRoleKeenInput,
): Promise<TeamRoleWriteResult> {
  return roles.setKeen({ ...input, userId });
}

export async function giveTeamRole(
  actorId: string,
  input: TeamRoleMemberInput,
): Promise<TeamRoleWriteResult<{ joinedTeam: boolean }>> {
  return roles.giveTeamRole({ ...input, actorId });
}

export async function takeTeamRole(
  actorId: string,
  input: TeamRoleMemberInput,
): Promise<TeamRoleWriteResult> {
  return roles.takeTeamRole({ ...input, actorId });
}
