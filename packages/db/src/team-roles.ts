import { and, asc, desc, eq, isNull, lt, max, sql } from "drizzle-orm";
import { canManageTeamRoles, canPickTeamLead } from "@camp404/core";
import { MAX_TEAM_ROLES, type Team } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";
import { assignTeamInTx, setLeadInTx } from "./team-memberships";

// Help wanted (owner's pick A, 2026-10-09): each team's roles for this year
// and who fills them. The data layer.
//
//  - LEAD IS THE FIRST ROLE OF EVERY TEAM, and its people are the lead flag
//    on team_memberships. Giving or taking Lead goes through setLeadInTx, the
//    one writer of that flag; there is no role row for it. How many leads a
//    team wants is team_role_settings.lead_places (1 when no row).
//  - A captain or a lead OF THAT TEAM runs a team's roles
//    (canManageTeamRoles); only a captain gives or takes Lead
//    (canPickTeamLead). Every write re-reads the actor's rank and the teams
//    they lead this year INSIDE its own transaction (lockSenderReach), so a
//    demotion that committed first is seen. A caller passes only who is
//    acting, never a rank or a team list.
//  - Giving a role locks the role's row (Lead: the team-year's settings row)
//    and counts who fills it, so the last place goes to one person. A role
//    change is a compare-and-set on `version`.
//  - Every change a captain or a lead makes is audited in the same
//    transaction. A member's own "I'm keen" is not: it is theirs.
//  - Giving a role puts the person on the team first when they are not on
//    it (assignTeamInTx, audited as a team change).
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type TeamRoleWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_ROLE_KEEPER =
  "Only captains and this team's leads can change its roles.";
export const NOT_A_LEAD_PICKER = "Only a captain can pick a team's lead.";
export const ROLE_CHANGED = "Someone changed this role first. Reload the page.";
export const ROLE_GONE = "That role isn't there any more. Reload the page.";
export const ROLE_FULL = "That role is full. Take someone off it first.";
export const ROLE_HAS_PEOPLE =
  "Take everyone off this role before removing it.";
export const ROLE_PLACES_BELOW =
  "More people fill this role than that. Take someone off it first.";
export const LEAD_PLACES_BELOW =
  "More people lead this team than that. Take a lead off first.";
export const ROLE_ALREADY_HELD = "They have this role already.";
export const ROLE_NOT_HELD =
  "They don't have this role any more. Reload the page.";
export const ROLE_NOT_A_MEMBER = "Only approved camp members can have a role.";
export const TOO_MANY_ROLES = `A team has ${MAX_TEAM_ROLES} roles at most.`;
export const ROLES_ALREADY_THERE =
  "This team has roles this year already. Reload the page.";
export const NO_ROLES_LAST_YEAR = "This team had no roles in an earlier year.";
export const KEEN_FULL = "That role is full now.";
export const KEEN_HELD = "You have this role already.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const realMember = and(
  eq(schema.users.isSystem, false),
  eq(schema.users.sanitised, false),
  eq(schema.users.approvalStatus, "approved"),
);

const nameOf = (displayName: string | null) =>
  displayName?.trim() || "Unnamed burner";

// --- Rows --------------------------------------------------------------------

export interface TeamRoleRow {
  id: string;
  team: Team;
  name: string;
  places: number;
  note: string | null;
  position: number;
  version: number;
}

/** A person on a team, a role or a keen list, by id and display name. */
export interface TeamRolePerson {
  userId: string;
  name: string;
}

/** Everything the board is built from, for one year. Filtered by the caller. */
export interface HelpWantedRead {
  cycle: number;
  /** How many leads each team wants, for the teams that changed it. */
  leadPlaces: { team: Team; places: number }[];
  roles: TeamRoleRow[];
  holders: (TeamRolePerson & { roleId: string })[];
  /** Everyone on a team this year, with the lead flag. */
  members: (TeamRolePerson & { team: Team; isLead: boolean })[];
  /** Every keen flag of the year. The caller decides who may read which. */
  keen: (TeamRolePerson & { team: Team; roleId: string | null })[];
  /** Each team's roles in the newest earlier year it had any. */
  lastYear: { team: Team; cycle: number; name: string; places: number }[];
}

const ROLE_COLUMNS = {
  id: schema.teamRoles.id,
  team: schema.teamRoles.team,
  name: schema.teamRoles.name,
  places: schema.teamRoles.places,
  note: schema.teamRoles.note,
  position: schema.teamRoles.position,
  version: schema.teamRoles.version,
};

/** The roles a team had in the newest year before `cycle` that had any. */
async function lastYearsRoles(
  db: DbOrTx,
  cycle: number,
  team?: Team,
): Promise<(TeamRoleRow & { cycle: number })[]> {
  const rows = await db
    .select({ ...ROLE_COLUMNS, cycle: schema.teamRoles.cycle })
    .from(schema.teamRoles)
    .where(
      and(
        lt(schema.teamRoles.cycle, cycle),
        team ? eq(schema.teamRoles.team, team) : undefined,
      ),
    )
    .orderBy(
      desc(schema.teamRoles.cycle),
      asc(schema.teamRoles.position),
      asc(schema.teamRoles.createdAt),
    );
  const newest = new Map<Team, number>();
  for (const r of rows) if (!newest.has(r.team)) newest.set(r.team, r.cycle);
  return rows.filter((r) => newest.get(r.team) === r.cycle);
}

/** The board's data for `cycle` (the camp's current year). */
export async function readHelpWanted(cycle: number): Promise<HelpWantedRead> {
  const db = createHttpDb();
  const [leadPlaces, roles, holders, members, keen, lastYear] =
    await Promise.all([
      db
        .select({
          team: schema.teamRoleSettings.team,
          places: schema.teamRoleSettings.leadPlaces,
        })
        .from(schema.teamRoleSettings)
        .where(eq(schema.teamRoleSettings.cycle, cycle)),
      db
        .select(ROLE_COLUMNS)
        .from(schema.teamRoles)
        .where(eq(schema.teamRoles.cycle, cycle))
        .orderBy(
          asc(schema.teamRoles.team),
          asc(schema.teamRoles.position),
          asc(schema.teamRoles.createdAt),
        ),
      db
        .select({
          roleId: schema.teamRoleHolders.roleId,
          userId: schema.teamRoleHolders.userId,
          displayName: schema.users.displayName,
        })
        .from(schema.teamRoleHolders)
        .innerJoin(
          schema.teamRoles,
          eq(schema.teamRoles.id, schema.teamRoleHolders.roleId),
        )
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.teamRoleHolders.userId),
        )
        .where(
          and(
            eq(schema.teamRoles.cycle, cycle),
            eq(schema.users.isSystem, false),
            eq(schema.users.sanitised, false),
          ),
        )
        .orderBy(asc(schema.teamRoleHolders.createdAt)),
      db
        .select({
          team: schema.teamMemberships.team,
          isLead: schema.teamMemberships.isLead,
          userId: schema.teamMemberships.userId,
          displayName: schema.users.displayName,
        })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.teamMemberships.userId),
        )
        .where(
          and(
            eq(schema.teamMemberships.cycle, cycle),
            eq(schema.users.isSystem, false),
            eq(schema.users.sanitised, false),
            sql`${schema.users.approvalStatus} <> 'rejected'`,
          ),
        )
        .orderBy(asc(schema.users.displayName), asc(schema.users.id)),
      db
        .select({
          team: schema.teamRoleKeen.team,
          roleId: schema.teamRoleKeen.roleId,
          userId: schema.teamRoleKeen.userId,
          displayName: schema.users.displayName,
        })
        .from(schema.teamRoleKeen)
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.teamRoleKeen.userId),
        )
        .where(and(eq(schema.teamRoleKeen.cycle, cycle), realMember))
        .orderBy(asc(schema.teamRoleKeen.createdAt)),
      lastYearsRoles(db, cycle),
    ]);
  return {
    cycle,
    leadPlaces,
    roles,
    holders: holders.map((h) => ({
      roleId: h.roleId,
      userId: h.userId,
      name: nameOf(h.displayName),
    })),
    members: members.map((m) => ({
      team: m.team,
      isLead: m.isLead,
      userId: m.userId,
      name: nameOf(m.displayName),
    })),
    keen: keen.map((k) => ({
      team: k.team,
      roleId: k.roleId,
      userId: k.userId,
      name: nameOf(k.displayName),
    })),
    lastYear: lastYear.map((r) => ({
      team: r.team,
      cycle: r.cycle,
      name: r.name,
      places: r.places,
    })),
  };
}

/** Every approved camp member, by name: who a role may be given to. */
export async function listPickablePeople(): Promise<TeamRolePerson[]> {
  const rows = await createHttpDb()
    .select({ userId: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(realMember)
    .orderBy(asc(schema.users.displayName), asc(schema.users.id));
  return rows.map((r) => ({ userId: r.userId, name: nameOf(r.displayName) }));
}

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<TeamRoleWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/** The actor's rank and led teams, read and locked inside the write. */
async function lockActor(
  tx: Tx,
  actorId: string,
): Promise<{ rank: string; led: readonly string[] }> {
  if (!UUID.test(actorId)) return { rank: "", led: [] };
  const reach = await lockSenderReach(tx, actorId);
  return { rank: reachRank(reach), led: reach ?? [] };
}

function assertKeeper(
  actor: { rank: string; led: readonly string[] },
  team: string,
): void {
  if (!canManageTeamRoles(actor.rank, actor.led, team)) {
    refuse(NOT_A_ROLE_KEEPER);
  }
}

/**
 * The team-year's settings row, made if missing and locked: the lock every
 * write that adds roles, copies them or counts leads takes first.
 */
async function lockTeamYear(
  tx: Tx,
  cycle: number,
  team: Team,
): Promise<{ leadPlaces: number }> {
  await tx
    .insert(schema.teamRoleSettings)
    .values({ cycle, team })
    .onConflictDoNothing({
      target: [schema.teamRoleSettings.cycle, schema.teamRoleSettings.team],
    });
  const [row] = await tx
    .select({ leadPlaces: schema.teamRoleSettings.leadPlaces })
    .from(schema.teamRoleSettings)
    .where(
      and(
        eq(schema.teamRoleSettings.cycle, cycle),
        eq(schema.teamRoleSettings.team, team),
      ),
    )
    .for("update");
  return { leadPlaces: row?.leadPlaces ?? 1 };
}

/** One of this year's roles, locked. */
async function lockRole(
  tx: Tx,
  roleId: string,
  cycle: number,
): Promise<TeamRoleRow | undefined> {
  if (!UUID.test(roleId)) return undefined;
  const [row] = await tx
    .select(ROLE_COLUMNS)
    .from(schema.teamRoles)
    .where(
      and(eq(schema.teamRoles.id, roleId), eq(schema.teamRoles.cycle, cycle)),
    )
    .for("update");
  return row;
}

async function holdersOf(tx: Tx, roleId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.teamRoleHolders)
    .where(eq(schema.teamRoleHolders.roleId, roleId));
  return row?.n ?? 0;
}

async function leadsOf(tx: Tx, team: Team, cycle: number): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.team, team),
        eq(schema.teamMemberships.cycle, cycle),
        eq(schema.teamMemberships.isLead, true),
      ),
    );
  return row?.n ?? 0;
}

async function isRealMember(tx: Tx, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const [member] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), realMember))
    .for("share");
  return Boolean(member);
}

// --- Roles -------------------------------------------------------------------

/** Add a role to a team (no `id`), or change one of this year's. Audited. */
export async function saveTeamRole(input: {
  actorId: string;
  id?: string | null;
  team: Team;
  name: string;
  places: number;
  note: string | null;
  expectedVersion: number;
}): Promise<TeamRoleWriteResult<{ role: TeamRoleRow }>> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const now = new Date();
    if (!input.id) {
      assertKeeper(actor, input.team);
      await lockTeamYear(tx, cycle, input.team);
      const [counted] = await tx
        .select({
          n: sql<number>`count(*)::int`,
          last: max(schema.teamRoles.position),
        })
        .from(schema.teamRoles)
        .where(
          and(
            eq(schema.teamRoles.cycle, cycle),
            eq(schema.teamRoles.team, input.team),
          ),
        );
      if ((counted?.n ?? 0) >= MAX_TEAM_ROLES) refuse(TOO_MANY_ROLES);
      const [role] = await tx
        .insert(schema.teamRoles)
        .values({
          cycle,
          team: input.team,
          name: input.name,
          places: input.places,
          note: input.note,
          position: (counted?.last ?? -1) + 1,
        })
        .returning(ROLE_COLUMNS);
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "team.role_added",
        target: input.team,
        metadata: {
          team: input.team,
          cycle,
          name: input.name,
          places: input.places,
        },
      });
      return { role: role! };
    }
    const found = await lockRole(tx, input.id, cycle);
    if (!found) refuse(ROLE_GONE);
    assertKeeper(actor, found.team);
    if (found.team !== input.team) refuse(ROLE_GONE);
    if (found.version !== input.expectedVersion) refuse(ROLE_CHANGED);
    if (input.places < (await holdersOf(tx, found.id))) {
      refuse(ROLE_PLACES_BELOW);
    }
    const [role] = await tx
      .update(schema.teamRoles)
      .set({
        name: input.name,
        places: input.places,
        note: input.note,
        version: sql`${schema.teamRoles.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.teamRoles.id, found.id),
          eq(schema.teamRoles.version, input.expectedVersion),
        ),
      )
      .returning(ROLE_COLUMNS);
    if (!role) refuse(ROLE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.role_changed",
      target: found.team,
      metadata: {
        team: found.team,
        cycle,
        name: input.name,
        places: input.places,
        was: { name: found.name, places: found.places },
      },
    });
    return { role };
  });
}

/** Remove a role nobody fills. Audited. */
export async function removeTeamRole(input: {
  actorId: string;
  id: string;
  expectedVersion: number;
}): Promise<TeamRoleWriteResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const found = await lockRole(tx, input.id, cycle);
    if (!found) refuse(ROLE_GONE);
    assertKeeper(actor, found.team);
    if (found.version !== input.expectedVersion) refuse(ROLE_CHANGED);
    if ((await holdersOf(tx, found.id)) > 0) refuse(ROLE_HAS_PEOPLE);
    await tx.delete(schema.teamRoles).where(eq(schema.teamRoles.id, found.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.role_removed",
      target: found.team,
      metadata: { team: found.team, cycle, name: found.name },
    });
    return {};
  });
}

/** How many leads a team wants this year. Audited. */
export async function setLeadPlaces(input: {
  actorId: string;
  team: Team;
  places: number;
}): Promise<TeamRoleWriteResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    assertKeeper(actor, input.team);
    const cycle = await currentCycleNumber(tx);
    const before = await lockTeamYear(tx, cycle, input.team);
    if (input.places < (await leadsOf(tx, input.team, cycle))) {
      refuse(LEAD_PLACES_BELOW);
    }
    if (before.leadPlaces === input.places) return {};
    await tx
      .update(schema.teamRoleSettings)
      .set({ leadPlaces: input.places, updatedAt: new Date() })
      .where(
        and(
          eq(schema.teamRoleSettings.cycle, cycle),
          eq(schema.teamRoleSettings.team, input.team),
        ),
      );
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.lead_places_set",
      target: input.team,
      metadata: {
        team: input.team,
        cycle,
        places: input.places,
        was: before.leadPlaces,
      },
    });
    return {};
  });
}

/**
 * Copy a team's roles from the newest earlier year it had any, with nobody in
 * them: only while the team has no roles this year. Audited.
 */
export async function copyLastYearsRoles(input: {
  actorId: string;
  team: Team;
}): Promise<TeamRoleWriteResult<{ copied: number }>> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    assertKeeper(actor, input.team);
    const cycle = await currentCycleNumber(tx);
    await lockTeamYear(tx, cycle, input.team);
    const [already] = await tx
      .select({ id: schema.teamRoles.id })
      .from(schema.teamRoles)
      .where(
        and(
          eq(schema.teamRoles.cycle, cycle),
          eq(schema.teamRoles.team, input.team),
        ),
      )
      .limit(1);
    if (already) refuse(ROLES_ALREADY_THERE);
    const last = await lastYearsRoles(tx, cycle, input.team);
    if (last.length === 0) refuse(NO_ROLES_LAST_YEAR);
    await tx.insert(schema.teamRoles).values(
      last.slice(0, MAX_TEAM_ROLES).map((r, i) => ({
        cycle,
        team: input.team,
        name: r.name,
        places: r.places,
        note: r.note,
        position: i,
      })),
    );
    const copied = Math.min(last.length, MAX_TEAM_ROLES);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.roles_copied",
      target: input.team,
      metadata: { team: input.team, cycle, from: last[0]!.cycle, copied },
    });
    return { copied };
  });
}

// --- Keen --------------------------------------------------------------------

/**
 * The signed-in member presses "I'm keen" on a role (`roleId` null: the
 * team's Lead), or Undo. Their own flag: not audited. Pressing it on a role
 * that is full, or that they fill, is refused; Undo always works.
 */
export async function setKeen(input: {
  userId: string;
  team: Team;
  roleId: string | null;
  keen: boolean;
}): Promise<TeamRoleWriteResult> {
  return write(async (tx) => {
    if (!(await isRealMember(tx, input.userId))) refuse(ROLE_NOT_A_MEMBER);
    const cycle = await currentCycleNumber(tx);
    let roleId: string | null = null;
    let open: boolean;
    let holds: boolean;
    if (input.roleId !== null) {
      const role = await lockRole(tx, input.roleId, cycle);
      if (!role || role.team !== input.team) refuse(ROLE_GONE);
      roleId = role.id;
      open = (await holdersOf(tx, role.id)) < role.places;
      const [mine] = await tx
        .select({ userId: schema.teamRoleHolders.userId })
        .from(schema.teamRoleHolders)
        .where(
          and(
            eq(schema.teamRoleHolders.roleId, role.id),
            eq(schema.teamRoleHolders.userId, input.userId),
          ),
        );
      holds = Boolean(mine);
    } else {
      const { leadPlaces } = await lockTeamYear(tx, cycle, input.team);
      open = (await leadsOf(tx, input.team, cycle)) < leadPlaces;
      const [mine] = await tx
        .select({ isLead: schema.teamMemberships.isLead })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.userId, input.userId),
            eq(schema.teamMemberships.team, input.team),
            eq(schema.teamMemberships.cycle, cycle),
          ),
        );
      holds = mine?.isLead === true;
    }
    const mine = and(
      eq(schema.teamRoleKeen.userId, input.userId),
      eq(schema.teamRoleKeen.cycle, cycle),
      eq(schema.teamRoleKeen.team, input.team),
      roleId === null
        ? isNull(schema.teamRoleKeen.roleId)
        : eq(schema.teamRoleKeen.roleId, roleId),
    );
    if (!input.keen) {
      await tx.delete(schema.teamRoleKeen).where(mine);
      return {};
    }
    if (holds) refuse(KEEN_HELD);
    if (!open) refuse(KEEN_FULL);
    await tx
      .insert(schema.teamRoleKeen)
      .values({ cycle, team: input.team, roleId, userId: input.userId })
      .onConflictDoNothing();
    return {};
  });
}

// --- Giving and taking ---------------------------------------------------------

async function dropKeen(
  tx: Tx,
  input: { userId: string; team: Team; roleId: string | null },
  cycle: number,
): Promise<void> {
  await tx
    .delete(schema.teamRoleKeen)
    .where(
      and(
        eq(schema.teamRoleKeen.userId, input.userId),
        eq(schema.teamRoleKeen.cycle, cycle),
        eq(schema.teamRoleKeen.team, input.team),
        input.roleId === null
          ? isNull(schema.teamRoleKeen.roleId)
          : eq(schema.teamRoleKeen.roleId, input.roleId),
      ),
    );
}

/**
 * Give a role to someone (`roleId` null: make them a lead of the team, a
 * captain's alone). Puts them on the team first when they are not on it.
 * Refused when the role is full, counted under the role's lock. Audited.
 */
export async function giveTeamRole(input: {
  actorId: string;
  team: Team;
  roleId: string | null;
  userId: string;
}): Promise<TeamRoleWriteResult<{ joinedTeam: boolean }>> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    if (input.roleId === null) {
      if (!canPickTeamLead(actor.rank)) refuse(NOT_A_LEAD_PICKER);
      const { leadPlaces } = await lockTeamYear(tx, cycle, input.team);
      if (!(await isRealMember(tx, input.userId))) refuse(ROLE_NOT_A_MEMBER);
      if ((await leadsOf(tx, input.team, cycle)) >= leadPlaces) {
        refuse(ROLE_FULL);
      }
      const who = {
        userId: input.userId,
        team: input.team,
        actorId: input.actorId,
      };
      const { created } = await assignTeamInTx(tx, who, cycle);
      const set = await setLeadInTx(tx, { ...who, isLead: true }, cycle);
      if (!set.ok || !set.changed) refuse(ROLE_ALREADY_HELD);
      await dropKeen(tx, { ...input, roleId: null }, cycle);
      return { joinedTeam: created };
    }
    const role = await lockRole(tx, input.roleId, cycle);
    if (!role || role.team !== input.team) refuse(ROLE_GONE);
    assertKeeper(actor, role.team);
    if (!(await isRealMember(tx, input.userId))) refuse(ROLE_NOT_A_MEMBER);
    if ((await holdersOf(tx, role.id)) >= role.places) refuse(ROLE_FULL);
    const [added] = await tx
      .insert(schema.teamRoleHolders)
      .values({
        roleId: role.id,
        userId: input.userId,
        addedByUserId: input.actorId,
      })
      .onConflictDoNothing()
      .returning({ userId: schema.teamRoleHolders.userId });
    if (!added) refuse(ROLE_ALREADY_HELD);
    const { created } = await assignTeamInTx(
      tx,
      { userId: input.userId, team: role.team, actorId: input.actorId },
      cycle,
    );
    await dropKeen(tx, { ...input, roleId: role.id }, cycle);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.role_given",
      target: input.userId,
      metadata: { team: role.team, cycle, roleId: role.id, name: role.name },
    });
    return { joinedTeam: created };
  });
}

/**
 * Take a role back from someone (`roleId` null: they stop leading the team,
 * a captain's alone; they stay on the team). Audited.
 */
export async function takeTeamRole(input: {
  actorId: string;
  team: Team;
  roleId: string | null;
  userId: string;
}): Promise<TeamRoleWriteResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    if (!UUID.test(input.userId)) refuse(ROLE_NOT_HELD);
    if (input.roleId === null) {
      if (!canPickTeamLead(actor.rank)) refuse(NOT_A_LEAD_PICKER);
      await lockTeamYear(tx, cycle, input.team);
      const set = await setLeadInTx(
        tx,
        {
          userId: input.userId,
          team: input.team,
          actorId: input.actorId,
          isLead: false,
        },
        cycle,
      );
      if (!set.ok || !set.changed) refuse(ROLE_NOT_HELD);
      return {};
    }
    const role = await lockRole(tx, input.roleId, cycle);
    if (!role || role.team !== input.team) refuse(ROLE_GONE);
    assertKeeper(actor, role.team);
    const gone = await tx
      .delete(schema.teamRoleHolders)
      .where(
        and(
          eq(schema.teamRoleHolders.roleId, role.id),
          eq(schema.teamRoleHolders.userId, input.userId),
        ),
      )
      .returning({ userId: schema.teamRoleHolders.userId });
    if (gone.length === 0) refuse(ROLE_NOT_HELD);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.role_taken",
      target: input.userId,
      metadata: { team: role.team, cycle, roleId: role.id, name: role.name },
    });
    return {};
  });
}
