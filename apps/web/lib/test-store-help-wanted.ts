import "server-only";

import { randomUUID } from "node:crypto";
import {
  canManageTeamRoles,
  canPickTeamLead,
  keenProblem,
  leadPlacesProblem,
  newRoleProblem,
  roleChangeProblem,
  roleFullProblem,
  roleRemoveProblem,
} from "@camp404/core";
import {
  NOT_A_LEAD_PICKER,
  NOT_A_ROLE_KEEPER,
  NO_ROLES_LAST_YEAR,
  ROLES_ALREADY_THERE,
  ROLE_ALREADY_HELD,
  ROLE_GONE,
  ROLE_NOT_A_MEMBER,
  ROLE_NOT_HELD,
  type HelpWantedRead,
  type TeamRolePerson,
  type TeamRoleRow,
  type TeamRoleWriteResult,
} from "@camp404/db/team-roles";
import { MAX_TEAM_ROLES, Team as TeamKeys, type Team } from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of Help wanted (@camp404/db/team-roles), for
// E2E_TEST_MODE. The same rules, sentences and results over the store's own
// rows: a captain or a lead of the team runs its roles; only a captain gives
// or takes Lead, which is the store's own lead flag (testStore.setLead), never
// a row here; a full role is refused; giving a role puts the person on the
// team. The store keeps no audit log and is one synchronous process, so there
// is nothing to lock. Kept apart from test-store.ts, which calls in here only
// to reset.

interface StoredRole extends TeamRoleRow {
  cycle: number;
  at: number;
}

interface HelpWantedState {
  roles: StoredRole[];
  holders: { roleId: string; userId: string; at: number }[];
  keen: {
    cycle: number;
    team: Team;
    roleId: string | null;
    userId: string;
    at: number;
  }[];
  leadPlaces: { cycle: number; team: Team; places: number }[];
  serial: number;
}

const KEY = "__camp404HelpWantedTestStore__";

function state(): HelpWantedState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    roles: [],
    holders: [],
    keen: [],
    leadPlaces: [],
    serial: 0,
  } satisfies HelpWantedState;
  return g[KEY] as HelpWantedState;
}

/**
 * removeTeam's twin: someone taken off a team this year loses its roles and
 * their keen flags on it (testStore.removeTeam calls this).
 */
export function dropTeamRolesOf(
  userId: string,
  team: Team,
  cycle: number,
): void {
  const s = state();
  const ids = new Set(
    s.roles
      .filter((r) => r.team === team && r.cycle === cycle)
      .map((r) => r.id),
  );
  s.holders = s.holders.filter(
    (h) => !(h.userId === userId && ids.has(h.roleId)),
  );
  s.keen = s.keen.filter(
    (k) => !(k.userId === userId && k.team === team && k.cycle === cycle),
  );
}

/** Clear Help wanted (testStore.reset calls this). */
export function resetHelpWantedStore(): void {
  const s = state();
  s.roles.length = 0;
  s.holders.length = 0;
  s.keen.length = 0;
  s.leadPlaces.length = 0;
  s.serial = 0;
}

/** Account erasure's part: the roles the member holds and is keen on. */
export function eraseTeamRolesOf(userId: string): void {
  const s = state();
  s.holders = s.holders.filter((h) => h.userId !== userId);
  s.keen = s.keen.filter((k) => k.userId !== userId);
}

const tick = () => ++state().serial;

const nameOf = (userId: string) =>
  testStore.findUserById(userId)?.displayName?.trim() || "Unnamed burner";

/** Two people by their stored name, a missing one last (Postgres's order). */
const byName = (a: string, b: string) => {
  const x = testStore.findUserById(a)?.displayName ?? null;
  const y = testStore.findUserById(b)?.displayName ?? null;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x.localeCompare(y);
};

const isMember = (userId: string) =>
  testStore.findUserById(userId)?.approvalStatus === "approved";

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

function run<T extends object>(fn: () => T): TeamRoleWriteResult<T> {
  try {
    return { ok: true, ...fn() };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

function actorOf(actorId: string): { rank: string; led: readonly string[] } {
  const actor = testStore.actorInStore(actorId);
  if (!actor) return { rank: "", led: [] };
  return { rank: actor.rank, led: actor.ledTeams };
}

function assertKeeper(actorId: string, team: string): void {
  const actor = actorOf(actorId);
  if (!canManageTeamRoles(actor.rank, actor.led, team)) {
    refuse(NOT_A_ROLE_KEEPER);
  }
}

const cycleNow = () => testStore.currentCycleNumber();

const roleRow = (r: StoredRole): TeamRoleRow => ({
  id: r.id,
  team: r.team,
  name: r.name,
  places: r.places,
  note: r.note,
  position: r.position,
  version: r.version,
});

const roleOf = (id: string, cycle: number) =>
  state().roles.find((r) => r.id === id && r.cycle === cycle);

// Who the board lists, and so who counts toward a role's places: not a
// declined sign-up (the db's listedPerson).
const listed = (userId: string) => {
  const user = testStore.findUserById(userId);
  return Boolean(user) && user!.approvalStatus !== "rejected";
};

const holdersOf = (roleId: string) =>
  state().holders.filter((h) => h.roleId === roleId && listed(h.userId)).length;

const leadPlacesOf = (team: Team, cycle: number) =>
  state().leadPlaces.find((l) => l.team === team && l.cycle === cycle)
    ?.places ?? 1;

const leadsOf = (team: Team) =>
  testStore.listTeamPeople(team).filter((p) => p.isLead).length;

function teamRoles(team: Team, cycle: number): StoredRole[] {
  return state()
    .roles.filter((r) => r.team === team && r.cycle === cycle)
    .sort((a, b) => a.position - b.position || a.at - b.at);
}

function lastYear(team: Team, cycle: number): StoredRole[] {
  const earlier = state().roles.filter(
    (r) => r.team === team && r.cycle < cycle,
  );
  const newest = Math.max(...earlier.map((r) => r.cycle));
  return teamRoles(team, newest);
}

function dropKeen(userId: string, team: Team, roleId: string | null) {
  const s = state();
  const cycle = cycleNow();
  s.keen = s.keen.filter(
    (k) =>
      !(
        k.userId === userId &&
        k.team === team &&
        k.cycle === cycle &&
        k.roleId === roleId
      ),
  );
}

export const helpWantedTestStore = {
  /** Seed a role in a year directly (a spec's "last year"), nobody in it. */
  seedTeamRole(input: {
    cycle: number;
    team: Team;
    name: string;
    places?: number;
    note?: string | null;
  }): TeamRoleRow {
    const position = teamRoles(input.team, input.cycle).length;
    const row: StoredRole = {
      id: randomUUID(),
      cycle: input.cycle,
      team: input.team,
      name: input.name,
      places: input.places ?? 1,
      note: input.note ?? null,
      position,
      version: 1,
      at: tick(),
    };
    state().roles.push(row);
    return roleRow(row);
  },

  readHelpWanted(cycle: number): HelpWantedRead {
    const s = state();
    const roles = s.roles
      .filter((r) => r.cycle === cycle)
      .sort(
        (a, b) =>
          TeamKeys.options.indexOf(a.team) - TeamKeys.options.indexOf(b.team) ||
          a.position - b.position ||
          a.at - b.at,
      );
    const ids = new Set(roles.map((r) => r.id));
    return {
      cycle,
      leadPlaces: s.leadPlaces
        .filter((l) => l.cycle === cycle)
        .map((l) => ({ team: l.team, places: l.places })),
      roles: roles.map(roleRow),
      holders: s.holders
        .filter((h) => ids.has(h.roleId) && listed(h.userId))
        .sort((a, b) => a.at - b.at)
        .map((h) => ({
          roleId: h.roleId,
          userId: h.userId,
          name: nameOf(h.userId),
        })),
      // By name, then id, as the db orders them: listTeamPeople puts leads
      // first, which would put a lead ahead of the team's other members.
      members: TeamKeys.options
        .flatMap((team) =>
          testStore.listTeamPeople(team).map((p) => ({
            team,
            isLead: p.isLead,
            userId: p.id,
            name: p.displayName,
          })),
        )
        .sort(
          (a, b) =>
            byName(a.userId, b.userId) || a.userId.localeCompare(b.userId),
        ),
      keen: s.keen
        .filter((k) => k.cycle === cycle && isMember(k.userId))
        .sort((a, b) => a.at - b.at)
        .map((k) => ({
          team: k.team,
          roleId: k.roleId,
          userId: k.userId,
          name: nameOf(k.userId),
        })),
      lastYear: TeamKeys.options.flatMap((team) =>
        lastYear(team, cycle).map((r) => ({
          team,
          cycle: r.cycle,
          name: r.name,
          places: r.places,
        })),
      ),
    };
  },

  listPickablePeople(): TeamRolePerson[] {
    return testStore
      .allUsers()
      .filter((u) => u.approvalStatus === "approved")
      .map((u) => ({ userId: u.id, name: nameOf(u.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  saveTeamRole(input: {
    actorId: string;
    id?: string | null;
    team: Team;
    name: string;
    places: number;
    note: string | null;
    expectedVersion: number;
  }): TeamRoleWriteResult<{ role: TeamRoleRow }> {
    return run(() => {
      const cycle = cycleNow();
      if (!input.id) {
        assertKeeper(input.actorId, input.team);
        const mine = teamRoles(input.team, cycle);
        const tooMany = newRoleProblem(mine.length);
        if (tooMany) refuse(tooMany);
        const row: StoredRole = {
          id: randomUUID(),
          cycle,
          team: input.team,
          name: input.name,
          places: input.places,
          note: input.note,
          position: Math.max(-1, ...mine.map((r) => r.position)) + 1,
          version: 1,
          at: tick(),
        };
        state().roles.push(row);
        return { role: roleRow(row) };
      }
      const found = roleOf(input.id, cycle);
      if (!found) refuse(ROLE_GONE);
      assertKeeper(input.actorId, found.team);
      const problem = roleChangeProblem({
        team: found.team,
        askedTeam: input.team,
        version: found.version,
        expectedVersion: input.expectedVersion,
        places: input.places,
        filled: holdersOf(found.id),
      });
      if (problem) refuse(problem);
      found.name = input.name;
      found.places = input.places;
      found.note = input.note;
      found.version += 1;
      return { role: roleRow(found) };
    });
  },

  removeTeamRole(input: {
    actorId: string;
    id: string;
    expectedVersion: number;
  }): TeamRoleWriteResult {
    return run(() => {
      const s = state();
      const found = roleOf(input.id, cycleNow());
      if (!found) refuse(ROLE_GONE);
      assertKeeper(input.actorId, found.team);
      const problem = roleRemoveProblem({
        version: found.version,
        expectedVersion: input.expectedVersion,
        filled: holdersOf(found.id),
      });
      if (problem) refuse(problem);
      s.roles = s.roles.filter((r) => r.id !== found.id);
      s.keen = s.keen.filter((k) => k.roleId !== found.id);
      return {};
    });
  },

  setLeadPlaces(input: {
    actorId: string;
    team: Team;
    places: number;
  }): TeamRoleWriteResult {
    return run(() => {
      assertKeeper(input.actorId, input.team);
      const cycle = cycleNow();
      const below = leadPlacesProblem(input.places, leadsOf(input.team));
      if (below) refuse(below);
      const s = state();
      const row = s.leadPlaces.find(
        (l) => l.team === input.team && l.cycle === cycle,
      );
      if (row) row.places = input.places;
      else s.leadPlaces.push({ cycle, team: input.team, places: input.places });
      return {};
    });
  },

  copyLastYearsRoles(input: {
    actorId: string;
    team: Team;
  }): TeamRoleWriteResult<{ copied: number }> {
    return run(() => {
      assertKeeper(input.actorId, input.team);
      const cycle = cycleNow();
      if (teamRoles(input.team, cycle).length > 0) refuse(ROLES_ALREADY_THERE);
      const last = lastYear(input.team, cycle).slice(0, MAX_TEAM_ROLES);
      if (last.length === 0) refuse(NO_ROLES_LAST_YEAR);
      last.forEach((r, i) =>
        state().roles.push({
          ...r,
          id: randomUUID(),
          cycle,
          position: i,
          version: 1,
          at: tick(),
        }),
      );
      return { copied: last.length };
    });
  },

  setKeen(input: {
    userId: string;
    team: Team;
    roleId: string | null;
    keen: boolean;
  }): TeamRoleWriteResult {
    return run(() => {
      if (!isMember(input.userId)) refuse(ROLE_NOT_A_MEMBER);
      const cycle = cycleNow();
      let fill: { filled: number; places: number };
      let holds: boolean;
      if (input.roleId !== null) {
        const role = roleOf(input.roleId, cycle);
        if (!role || role.team !== input.team) refuse(ROLE_GONE);
        fill = { filled: holdersOf(role.id), places: role.places };
        holds = state().holders.some(
          (h) => h.roleId === role.id && h.userId === input.userId,
        );
      } else {
        fill = {
          filled: leadsOf(input.team),
          places: leadPlacesOf(input.team, cycle),
        };
        holds = testStore.getLeadTeams(input.userId).includes(input.team);
      }
      if (!input.keen) {
        dropKeen(input.userId, input.team, input.roleId);
        return {};
      }
      const problem = keenProblem({ ...fill, holds });
      if (problem) refuse(problem);
      const already = state().keen.some(
        (k) =>
          k.userId === input.userId &&
          k.team === input.team &&
          k.cycle === cycle &&
          k.roleId === input.roleId,
      );
      if (!already) {
        state().keen.push({
          cycle,
          team: input.team,
          roleId: input.roleId,
          userId: input.userId,
          at: tick(),
        });
      }
      return {};
    });
  },

  giveTeamRole(input: {
    actorId: string;
    team: Team;
    roleId: string | null;
    userId: string;
  }): TeamRoleWriteResult<{ joinedTeam: boolean }> {
    return run(() => {
      const cycle = cycleNow();
      if (input.roleId === null) {
        if (!canPickTeamLead(actorOf(input.actorId).rank)) {
          refuse(NOT_A_LEAD_PICKER);
        }
        if (!isMember(input.userId)) refuse(ROLE_NOT_A_MEMBER);
        const full = roleFullProblem({
          filled: leadsOf(input.team),
          places: leadPlacesOf(input.team, cycle),
        });
        if (full) refuse(full);
        const { created } = testStore.assignTeam({
          userId: input.userId,
          team: input.team,
        });
        const set = testStore.setLead({
          userId: input.userId,
          team: input.team,
          isLead: true,
        });
        if (!set.ok || !set.changed) refuse(ROLE_ALREADY_HELD);
        dropKeen(input.userId, input.team, null);
        return { joinedTeam: created };
      }
      const role = roleOf(input.roleId, cycle);
      if (!role || role.team !== input.team) refuse(ROLE_GONE);
      assertKeeper(input.actorId, role.team);
      if (!isMember(input.userId)) refuse(ROLE_NOT_A_MEMBER);
      const full = roleFullProblem({
        filled: holdersOf(role.id),
        places: role.places,
      });
      if (full) refuse(full);
      if (
        state().holders.some(
          (h) => h.roleId === role.id && h.userId === input.userId,
        )
      ) {
        refuse(ROLE_ALREADY_HELD);
      }
      state().holders.push({
        roleId: role.id,
        userId: input.userId,
        at: tick(),
      });
      const { created } = testStore.assignTeam({
        userId: input.userId,
        team: role.team,
      });
      dropKeen(input.userId, role.team, role.id);
      return { joinedTeam: created };
    });
  },

  takeTeamRole(input: {
    actorId: string;
    team: Team;
    roleId: string | null;
    userId: string;
  }): TeamRoleWriteResult {
    return run(() => {
      if (input.roleId === null) {
        if (!canPickTeamLead(actorOf(input.actorId).rank)) {
          refuse(NOT_A_LEAD_PICKER);
        }
        const set = testStore.setLead({
          userId: input.userId,
          team: input.team,
          isLead: false,
        });
        if (!set.ok || !set.changed) refuse(ROLE_NOT_HELD);
        return {};
      }
      const role = roleOf(input.roleId, cycleNow());
      if (!role || role.team !== input.team) refuse(ROLE_GONE);
      assertKeeper(input.actorId, role.team);
      const s = state();
      const before = s.holders.length;
      s.holders = s.holders.filter(
        (h) => !(h.roleId === role.id && h.userId === input.userId),
      );
      if (s.holders.length === before) refuse(ROLE_NOT_HELD);
      return {};
    });
  },
};
