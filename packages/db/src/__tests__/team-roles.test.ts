import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  KEEN_FULL,
  LEAD_PLACES_BELOW,
  NOT_A_LEAD_PICKER,
  NOT_A_ROLE_KEEPER,
  ROLE_CHANGED,
  ROLE_FULL,
  ROLE_HAS_PEOPLE,
  ROLE_NOT_A_MEMBER,
  ROLE_PLACES_BELOW,
  ROLES_ALREADY_THERE,
  copyLastYearsRoles,
  giveTeamRole,
  readHelpWanted,
  removeTeamRole,
  saveTeamRole,
  setKeen,
  setLeadPlaces,
  takeTeamRole,
} from "../team-roles";
import { sanitiseAccount } from "../account";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Help wanted on a real Postgres (PGlite). What matters: a captain or a lead
// OF THAT TEAM runs its roles, checked inside the write; Lead is the lead flag
// itself, given and taken through setLead by a captain only; a full role is
// refused; a role given to someone outside the team puts them on it; every
// change is audited in the same transaction; and it is all year-scoped.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
type Harness = ReturnType<typeof useTestDb>;

const YEAR = 2027;

async function campYear(db: DB, year: number, earlier?: number) {
  const cycles: CampConfig["cycles"] = [
    ...(earlier
      ? [
          {
            year: earlier,
            startedAt: `${earlier}-01-01T00:00:00.000Z`,
            endedAt: `${year}-01-01T00:00:00.000Z`,
          },
        ]
      : []),
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

function helpers(h: Harness) {
  async function leadOf(team: Team, displayName: string) {
    const user = await makeUser(h.db(), { displayName });
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function people() {
    await campYear(h.db(), YEAR);
    const captain = await makeUser(h.db(), {
      rank: "captain",
      displayName: "Cap Tain",
    });
    const kitchenLead = await leadOf("kitchen", "Kit Lead");
    const structuresLead = await leadOf("structures", "Struc Lead");
    const dee = await makeUser(h.db(), { displayName: "Dee Member" });
    const sam = await makeUser(h.db(), { displayName: "Sam Other" });
    return { captain, kitchenLead, structuresLead, dee, sam };
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  async function role(actorId: string, name = "Shopper", places = 2) {
    const saved = await saveTeamRole({
      actorId,
      team: "kitchen",
      name,
      places,
      note: null,
      expectedVersion: 0,
    });
    if (!saved.ok) throw new Error(saved.error);
    return saved.role;
  }

  async function membership(userId: string, team: Team) {
    const [row] = await h
      .db()
      .select()
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.userId, userId),
          eq(schema.teamMemberships.team, team),
          eq(schema.teamMemberships.cycle, YEAR),
        ),
      );
    return row;
  }

  return { people, audits, role, membership };
}

describe("team roles", () => {
  const h = useTestDb();
  const { people, audits, role, membership } = helpers(h);

  it("a team's lead adds, changes and removes its roles, audited; a lead of another team and a member cannot", async () => {
    const { kitchenLead, structuresLead, dee } = await people();
    const shopper = await role(kitchenLead.id);
    expect(shopper).toMatchObject({ name: "Shopper", places: 2, version: 1 });
    expect(await audits("team.role_added")).toHaveLength(1);

    for (const actor of [structuresLead, dee]) {
      expect(
        await saveTeamRole({
          actorId: actor.id,
          team: "kitchen",
          name: "Nope",
          places: 1,
          note: null,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_ROLE_KEEPER });
    }

    const changed = await saveTeamRole({
      actorId: kitchenLead.id,
      id: shopper.id,
      team: "kitchen",
      name: "Shopper",
      places: 3,
      note: "Cape Town, the week before",
      expectedVersion: 1,
    });
    expect(changed.ok && changed.role.version).toBe(2);
    // A stale editor loses, in a sentence.
    expect(
      await saveTeamRole({
        actorId: kitchenLead.id,
        id: shopper.id,
        team: "kitchen",
        name: "Old",
        places: 1,
        note: null,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: ROLE_CHANGED });

    expect(
      await removeTeamRole({
        actorId: kitchenLead.id,
        id: shopper.id,
        expectedVersion: 2,
      }),
    ).toEqual({ ok: true });
    expect(await audits("team.role_removed")).toHaveLength(1);
  });

  it("gives a role, putting the person on the team, and refuses when it is full", async () => {
    const { kitchenLead, dee, sam, captain } = await people();
    const dish = await role(kitchenLead.id, "Dishwasher captain", 1);
    expect(await membership(dee.id, "kitchen")).toBeUndefined();

    const given = await giveTeamRole({
      actorId: kitchenLead.id,
      team: "kitchen",
      roleId: dish.id,
      userId: dee.id,
    });
    expect(given).toEqual({ ok: true, joinedTeam: true });
    expect(await membership(dee.id, "kitchen")).toMatchObject({
      isLead: false,
    });
    expect(await audits("team.role_given")).toHaveLength(1);
    expect(await audits("member.team_assigned")).toHaveLength(3);

    // The last place went to Dee: Sam is refused, even by a captain.
    expect(
      await giveTeamRole({
        actorId: captain.id,
        team: "kitchen",
        roleId: dish.id,
        userId: sam.id,
      }),
    ).toEqual({ ok: false, error: ROLE_FULL });

    // Places cannot drop below who fills it; a filled role cannot go.
    expect(
      await removeTeamRole({
        actorId: kitchenLead.id,
        id: dish.id,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: ROLE_HAS_PEOPLE });

    expect(
      await takeTeamRole({
        actorId: kitchenLead.id,
        team: "kitchen",
        roleId: dish.id,
        userId: dee.id,
      }),
    ).toEqual({ ok: true });
    expect(await audits("team.role_taken")).toHaveLength(1);
    // They stay on the team.
    expect(await membership(dee.id, "kitchen")).toBeDefined();
  });

  it("refuses lowering places below who fills a role", async () => {
    const { kitchenLead, dee, sam } = await people();
    const shopper = await role(kitchenLead.id, "Shopper", 2);
    for (const who of [dee, sam]) {
      await giveTeamRole({
        actorId: kitchenLead.id,
        team: "kitchen",
        roleId: shopper.id,
        userId: who.id,
      });
    }
    expect(
      await saveTeamRole({
        actorId: kitchenLead.id,
        id: shopper.id,
        team: "kitchen",
        name: "Shopper",
        places: 1,
        note: null,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: ROLE_PLACES_BELOW });
  });

  it("refuses a role for someone who is not an approved member", async () => {
    const { kitchenLead } = await people();
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    const shopper = await role(kitchenLead.id);
    expect(
      await giveTeamRole({
        actorId: kitchenLead.id,
        team: "kitchen",
        roleId: shopper.id,
        userId: pending.id,
      }),
    ).toEqual({ ok: false, error: ROLE_NOT_A_MEMBER });
  });
});

describe("the Lead role is the lead flag", () => {
  const h = useTestDb();
  const { people, audits, membership } = helpers(h);

  it("a captain makes someone a lead through setLead, joining the team; a team's lead cannot", async () => {
    const { captain, structuresLead, dee } = await people();
    expect(
      await giveTeamRole({
        actorId: structuresLead.id,
        team: "structures",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_LEAD_PICKER });

    // Structures wants one lead and has one: full.
    expect(
      await giveTeamRole({
        actorId: captain.id,
        team: "structures",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: false, error: ROLE_FULL });

    expect(
      await setLeadPlaces({
        actorId: structuresLead.id,
        team: "structures",
        places: 2,
      }),
    ).toEqual({ ok: true });
    expect(await audits("team.lead_places_set")).toHaveLength(1);

    expect(
      await giveTeamRole({
        actorId: captain.id,
        team: "structures",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: true, joinedTeam: true });
    expect(await membership(dee.id, "structures")).toMatchObject({
      isLead: true,
    });
    // The lead flag's own audit row, from setLead's writer.
    const leadSets = await audits("member.team_lead_set");
    expect(leadSets.filter((a) => a.target === dee.id)).toHaveLength(1);

    // Two leads now: the places cannot drop to one.
    expect(
      await setLeadPlaces({
        actorId: captain.id,
        team: "structures",
        places: 1,
      }),
    ).toEqual({ ok: false, error: LEAD_PLACES_BELOW });

    const view = await readHelpWanted(YEAR);
    expect(
      view.members.filter((m) => m.team === "structures" && m.isLead),
    ).toHaveLength(2);
    expect(view.leadPlaces).toEqual([{ team: "structures", places: 2 }]);

    // Taking Lead back is a captain's too, and keeps them on the team.
    expect(
      await takeTeamRole({
        actorId: structuresLead.id,
        team: "structures",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_LEAD_PICKER });
    expect(
      await takeTeamRole({
        actorId: captain.id,
        team: "structures",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: true });
    expect(await membership(dee.id, "structures")).toMatchObject({
      isLead: false,
    });
  });
});

describe("I'm keen", () => {
  const h = useTestDb();
  const { people, role } = helpers(h);

  it("is a member's own flag, on a role or on Lead, and goes when they are given the role", async () => {
    const { kitchenLead, dee } = await people();
    const shopper = await role(kitchenLead.id);
    expect(
      await setKeen({
        userId: dee.id,
        team: "kitchen",
        roleId: shopper.id,
        keen: true,
      }),
    ).toEqual({ ok: true });
    // Pressed twice: still one flag.
    await setKeen({
      userId: dee.id,
      team: "kitchen",
      roleId: shopper.id,
      keen: true,
    });
    await setKeen({
      userId: dee.id,
      team: "water",
      roleId: null,
      keen: true,
    });
    await setKeen({
      userId: dee.id,
      team: "water",
      roleId: null,
      keen: true,
    });
    let view = await readHelpWanted(YEAR);
    expect(view.keen.map((k) => [k.team, k.roleId])).toEqual([
      ["kitchen", shopper.id],
      ["water", null],
    ]);

    // Structures' one lead place is filled: no new keen there.
    const sam = await makeUser(h.db());
    expect(
      await setKeen({
        userId: sam.id,
        team: "structures",
        roleId: null,
        keen: true,
      }),
    ).toEqual({ ok: false, error: KEEN_FULL });

    await giveTeamRole({
      actorId: kitchenLead.id,
      team: "kitchen",
      roleId: shopper.id,
      userId: dee.id,
    });
    view = await readHelpWanted(YEAR);
    expect(view.keen.map((k) => k.team)).toEqual(["water"]);

    await setKeen({
      userId: dee.id,
      team: "water",
      roleId: null,
      keen: false,
    });
    expect((await readHelpWanted(YEAR)).keen).toEqual([]);
  });
});

describe("year scoping", () => {
  const h = useTestDb();
  const { audits } = helpers(h);

  it("reads only this year's roles, and copies last year's names, empty, once", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const dee = await makeUser(h.db(), { displayName: "Dee Member" });
    await campYear(h.db(), 2026);
    const old = await saveTeamRole({
      actorId: captain.id,
      team: "kitchen",
      name: "Head chef",
      places: 1,
      note: "Plans the menu",
      expectedVersion: 0,
    });
    if (!old.ok) throw new Error(old.error);
    await giveTeamRole({
      actorId: captain.id,
      team: "kitchen",
      roleId: old.role.id,
      userId: dee.id,
    });
    await saveTeamRole({
      actorId: captain.id,
      team: "kitchen",
      name: "Grey water",
      places: 2,
      note: null,
      expectedVersion: 0,
    });
    // A lead last year leads nothing this year.
    await makeMembership(h.db(), {
      userId: dee.id,
      team: "structures",
      isLead: true,
      cycle: 2026,
    });

    await campYear(h.db(), YEAR, 2026);
    let view = await readHelpWanted(YEAR);
    expect(view.roles).toEqual([]);
    expect(view.holders).toEqual([]);
    expect(view.members).toEqual([]);
    expect(view.lastYear.map((r) => r.name)).toEqual([
      "Head chef",
      "Grey water",
    ]);

    // Last year's holder cannot be taken off from this year.
    const copied = await copyLastYearsRoles({
      actorId: captain.id,
      team: "kitchen",
    });
    expect(copied).toEqual({ ok: true, copied: 2 });
    expect(await audits("team.roles_copied")).toHaveLength(1);
    view = await readHelpWanted(YEAR);
    expect(view.roles.map((r) => [r.name, r.places, r.note])).toEqual([
      ["Head chef", 1, "Plans the menu"],
      ["Grey water", 2, null],
    ]);
    expect(view.holders).toEqual([]);
    expect(
      await copyLastYearsRoles({ actorId: captain.id, team: "kitchen" }),
    ).toEqual({ ok: false, error: ROLES_ALREADY_THERE });

    // Last year's rows are untouched.
    const all = await h.db().select().from(schema.teamRoleHolders);
    expect(all).toHaveLength(1);
  });

  it("erasure takes a member out of every role and drops their keen flags", async () => {
    await campYear(h.db(), YEAR);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const dee = await makeUser(h.db());
    const saved = await saveTeamRole({
      actorId: captain.id,
      team: "kitchen",
      name: "Shopper",
      places: 2,
      note: null,
      expectedVersion: 0,
    });
    if (!saved.ok) throw new Error(saved.error);
    await giveTeamRole({
      actorId: captain.id,
      team: "kitchen",
      roleId: saved.role.id,
      userId: dee.id,
    });
    await setKeen({
      userId: dee.id,
      team: "structures",
      roleId: null,
      keen: true,
    });
    await sanitiseAccount(dee.id);
    expect(await h.db().select().from(schema.teamRoleHolders)).toEqual([]);
    expect(await h.db().select().from(schema.teamRoleKeen)).toEqual([]);
  });
});
