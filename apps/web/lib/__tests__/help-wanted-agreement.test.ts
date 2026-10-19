// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEEN_FULL,
  KEEN_HELD,
  LEAD_PLACES_BELOW,
  NOT_A_LEAD_PICKER,
  NOT_A_ROLE_KEEPER,
  NO_ROLES_LAST_YEAR,
  ROLES_ALREADY_THERE,
  ROLE_ALREADY_HELD,
  ROLE_CHANGED,
  ROLE_FULL,
  ROLE_GONE,
  ROLE_HAS_PEOPLE,
  ROLE_NOT_A_MEMBER,
  ROLE_NOT_HELD,
  ROLE_PLACES_BELOW,
} from "@camp404/db/team-roles";
import * as schema from "@camp404/db/schema";
import { Team, ViewerRank } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays, type DB, type People, type Seed } from "./_agreement";

// Help wanted (team roles, owner's pick A), through lib/help-wanted.ts, on
// the database and on the E2E store: the same people, the same writes, the
// same board for each viewer and the same refusal sentences. Who may act is
// one rule each (roleKeeper, LEAD_PICKER), and the writes' checks live once
// in @camp404/core (newRoleProblem, roleChangeProblem, roleRemoveProblem,
// leadPlacesProblem, roleFullProblem, keenProblem); this holds the rest
// equal. The roles are the Kitchen's, so the Kitchen lead is a lead of THAT
// team and runs them; the Finance lead is a lead of ANOTHER team, refused;
// only a captain picks a lead. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { helpWantedTestStore } from "../test-store-help-wanted";
import {
  copyLastYearsRoles,
  getHelpWantedView,
  giveTeamRole,
  removeTeamRole,
  saveTeamRole,
  setKeen,
  setLeadPlaces,
  takeTeamRole,
} from "../help-wanted";

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;

type Viewer = Parameters<typeof getHelpWantedView>[0];

/** Each persona as the board's viewer, with the teams they lead. */
const viewers = (p: People) => ({
  captain: {
    userId: p.captain,
    rank: ViewerRank.enum.captain,
    ledTeams: [],
  } as Viewer,
  kitchenLead: {
    userId: p.kitchenLead,
    rank: ViewerRank.enum.team_lead,
    ledTeams: [KITCHEN],
  } as Viewer,
  financeLead: {
    userId: p.financeLead,
    rank: ViewerRank.enum.team_lead,
    ledTeams: [FINANCE],
  } as Viewer,
  member: {
    userId: p.member,
    rank: ViewerRank.enum.camp_member,
    ledTeams: [],
  } as Viewer,
});

/**
 * The Kitchen's part of the board as one viewer sees it, and the counts. A
 * row's `key` (the role's raw id) is left out: `roleId` names it.
 */
async function board(viewer: Viewer) {
  const view = await getHelpWantedView(viewer);
  const kitchen = view.teams.find((t) => t.key === KITCHEN)!;
  return {
    kitchen: {
      ...kitchen,
      rows: kitchen.rows.map((row) => {
        const { key, ...rest } = row;
        void key;
        return rest;
      }),
    },
    summary: view.summary,
    keenCount: view.keenCount,
    everyone: view.everyone,
    picksLead: view.picksLead,
  };
}

/** A Kitchen role's id, by its name, read off a captain's board. */
async function roleIdOf(p: People, name: string): Promise<string> {
  const view = await getHelpWantedView(viewers(p).captain);
  const row = view.teams
    .find((t) => t.key === KITCHEN)!
    .rows.find((r) => r.name === name);
  if (!row?.roleId) throw new Error(`No role ${name}`);
  return row.roleId;
}

const role = (name: string, places: number, expectedVersion = 0) => ({
  team: KITCHEN,
  name,
  places,
  note: null,
  expectedVersion,
});

/** An earlier year's role, nobody in it. */
async function roleIn(
  seed: Seed,
  db: DB,
  cycle: number,
  name: string,
  places: number,
) {
  if (seed.side === "store") {
    helpWantedTestStore.seedTeamRole({ cycle, team: KITCHEN, name, places });
    return;
  }
  const position = (await db.select().from(schema.teamRoles)).filter(
    (r) => r.cycle === cycle && r.team === KITCHEN,
  ).length;
  await db
    .insert(schema.teamRoles)
    .values({ cycle, team: KITCHEN, name, places, position });
}

describe("Help wanted: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("runs a team's roles for a captain or a lead of that team only, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      // The team's members by name, a second lead among them.
      const ann = await seed.user("Ann");
      await seed.join(ann, KITCHEN);
      const yan = await seed.user("Yan");
      await seed.lead(yan, KITCHEN);
      const otherLead = await saveTeamRole(p.financeLead, role("Shopper", 2));
      const member = await saveTeamRole(p.member, role("Shopper", 2));
      const added = await saveTeamRole(p.kitchenLead, role("Shopper", 2));
      const byCaptain = await saveTeamRole(p.captain, role("Dishes", 1));
      const shopper = await roleIdOf(p, "Shopper");
      const edit = (actorId: string, input: object) =>
        saveTeamRole(actorId, {
          ...role("Head shopper", 3, 1),
          id: shopper,
          ...input,
        });
      const editOther = await edit(p.financeLead, {});
      const otherTeam = await edit(p.kitchenLead, { team: FINANCE });
      const edited = await edit(p.kitchenLead, {});
      const stale = await edit(p.captain, {});
      const dishes = await roleIdOf(p, "Dishes");
      const removeOther = await removeTeamRole(p.financeLead, {
        id: dishes,
        expectedVersion: 1,
      });
      const removeStale = await removeTeamRole(p.kitchenLead, {
        id: dishes,
        expectedVersion: 2,
      });
      const removed = await removeTeamRole(p.kitchenLead, {
        id: dishes,
        expectedVersion: 1,
      });
      const removedAgain = await removeTeamRole(p.kitchenLead, {
        id: dishes,
        expectedVersion: 1,
      });
      return {
        otherLead,
        member,
        added,
        byCaptain,
        editOther,
        otherTeam,
        edited,
        stale,
        removeOther,
        removeStale,
        removed,
        removedAgain,
        asLead: await board(viewers(p).kitchenLead),
        asMember: await board(viewers(p).member),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_A_ROLE_KEEPER },
      member: { ok: false, error: NOT_A_ROLE_KEEPER },
      added: { ok: true },
      byCaptain: { ok: true },
      editOther: { ok: false, error: NOT_A_ROLE_KEEPER },
      otherTeam: { ok: false, error: ROLE_GONE },
      edited: { ok: true },
      stale: { ok: false, error: ROLE_CHANGED },
      removeOther: { ok: false, error: NOT_A_ROLE_KEEPER },
      removeStale: { ok: false, error: ROLE_CHANGED },
      removed: { ok: true },
      removedAgain: { ok: false, error: ROLE_GONE },
      asLead: {
        kitchen: {
          manages: true,
          memberIds: [
            expect.stringMatching(/^#/),
            "@kitchenLead",
            expect.stringMatching(/^#/),
          ],
          leadNames: ["You", "Yan"],
          rows: [
            {
              isLead: true,
              name: "Lead",
              people: [{ name: "You" }, { name: "Yan" }],
            },
            { name: "Head shopper", places: 3, version: 2, canEdit: true },
          ],
        },
      },
      asMember: {
        kitchen: {
          manages: false,
          memberIds: null,
          rows: [
            {
              isLead: true,
              people: [
                { userId: null, name: "Cook" },
                { userId: null, name: "Yan" },
              ],
              canEdit: false,
            },
            { name: "Head shopper", action: "keen", keen: null },
          ],
        },
        everyone: null,
      },
    });
    expect(store).toEqual(db);
  });

  it("gives a role to an approved member, puts them on the team, and refuses a full role", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const pending = await seed.user("Late", { approval: "pending" });
      const onKitchen = await seed.user("Pot");
      await seed.join(onKitchen, KITCHEN);
      await saveTeamRole(p.kitchenLead, role("Dishes", 1));
      await saveTeamRole(p.kitchenLead, role("Shopper", 2));
      const dishes = await roleIdOf(p, "Dishes");
      const shopper = await roleIdOf(p, "Shopper");
      const give = (actorId: string, roleId: string, userId: string) =>
        giveTeamRole(actorId, { team: KITCHEN, roleId, userId });
      const byOtherLead = await give(p.financeLead, dishes, p.member);
      const notApproved = await give(p.kitchenLead, dishes, pending);
      const joined = await give(p.kitchenLead, dishes, p.member);
      const full = await give(p.kitchenLead, dishes, p.other);
      const fullForHolder = await give(p.kitchenLead, dishes, p.member);
      const onTeam = await give(p.kitchenLead, shopper, onKitchen);
      const held = await give(p.kitchenLead, shopper, onKitchen);
      const second = await give(p.captain, shopper, p.other);
      const placesBelow = await saveTeamRole(p.kitchenLead, {
        ...role("Shopper", 1, 1),
        id: shopper,
      });
      const hasPeople = await removeTeamRole(p.kitchenLead, {
        id: dishes,
        expectedVersion: 1,
      });
      const takeOther = await takeTeamRole(p.financeLead, {
        team: KITCHEN,
        roleId: shopper,
        userId: p.other,
      });
      const taken = await takeTeamRole(p.kitchenLead, {
        team: KITCHEN,
        roleId: shopper,
        userId: p.other,
      });
      const takenAgain = await takeTeamRole(p.kitchenLead, {
        team: KITCHEN,
        roleId: shopper,
        userId: p.other,
      });
      return {
        byOtherLead,
        notApproved,
        joined,
        full,
        fullForHolder,
        onTeam,
        held,
        second,
        placesBelow,
        hasPeople,
        takeOther,
        taken,
        takenAgain,
        asLead: await board(viewers(p).kitchenLead),
        asMember: await board(viewers(p).member),
      };
    });
    expect(db).toMatchObject({
      byOtherLead: { ok: false, error: NOT_A_ROLE_KEEPER },
      notApproved: { ok: false, error: ROLE_NOT_A_MEMBER },
      joined: { ok: true, joinedTeam: true },
      full: { ok: false, error: ROLE_FULL },
      fullForHolder: { ok: false, error: ROLE_FULL },
      onTeam: { ok: true, joinedTeam: false },
      held: { ok: false, error: ROLE_ALREADY_HELD },
      second: { ok: true, joinedTeam: true },
      placesBelow: { ok: false, error: ROLE_PLACES_BELOW },
      hasPeople: { ok: false, error: ROLE_HAS_PEOPLE },
      takeOther: { ok: false, error: NOT_A_ROLE_KEEPER },
      taken: { ok: true },
      takenAgain: { ok: false, error: ROLE_NOT_HELD },
      asLead: {
        kitchen: {
          memberIds: [
            "@kitchenLead",
            "@member",
            expect.stringMatching(/^#/),
            "@other",
          ],
          rows: [
            { isLead: true },
            { name: "Dishes", filled: 1, open: false, action: "full" },
            { name: "Shopper", filled: 1, open: true, action: "pick" },
          ],
        },
      },
      asMember: {
        kitchen: {
          mine: true,
          rows: [
            { isLead: true },
            { name: "Dishes", action: "yours", people: [{ name: "You" }] },
            { name: "Shopper", people: [{ name: "Pot", userId: null }] },
          ],
        },
      },
    });
    expect(store).toEqual(db);
  });

  it("lets only a captain pick a lead, up to the team's lead places, and keeps who is keen to the team's runners", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await saveTeamRole(p.kitchenLead, role("Shopper", 2));
      const shopper = await roleIdOf(p, "Shopper");
      const leadKeen = (userId: string, keen = true) =>
        setKeen(userId, { team: KITCHEN, roleId: null, keen });
      const keenWhileFull = await leadKeen(p.member);
      const placesByOther = await setLeadPlaces(p.financeLead, {
        team: KITCHEN,
        places: 2,
      });
      const placesBelow = await setLeadPlaces(p.kitchenLead, {
        team: KITCHEN,
        places: 0,
      });
      const places = await setLeadPlaces(p.kitchenLead, {
        team: KITCHEN,
        places: 2,
      });
      const keenHeld = await leadKeen(p.kitchenLead);
      const keen = await leadKeen(p.member);
      const keenAgain = await leadKeen(p.member);
      const roleKeen = await setKeen(p.other, {
        team: KITCHEN,
        roleId: shopper,
        keen: true,
      });
      const keenBoard = {
        asCaptain: await board(viewers(p).captain),
        asKitchenLead: await board(viewers(p).kitchenLead),
        asFinanceLead: await board(viewers(p).financeLead),
        asMember: await board(viewers(p).member),
      };
      const giveLead = (actorId: string, userId: string) =>
        giveTeamRole(actorId, { team: KITCHEN, roleId: null, userId });
      const byLead = await giveLead(p.kitchenLead, p.member);
      const picked = await giveLead(p.captain, p.member);
      const leadsFull = await giveLead(p.captain, p.other);
      const already = await giveLead(p.captain, p.member);
      // A lead made outside Help wanted (the roster's plain setLead) is not
      // held to the places: the team now shows 3 of 2.
      await seed.lead(p.other, KITCHEN);
      const takeByLead = await takeTeamRole(p.kitchenLead, {
        team: KITCHEN,
        roleId: null,
        userId: p.member,
      });
      const undo = await setKeen(p.other, {
        team: KITCHEN,
        roleId: shopper,
        keen: false,
      });
      const after = await board(viewers(p).captain);
      const took = await takeTeamRole(p.captain, {
        team: KITCHEN,
        roleId: null,
        userId: p.member,
      });
      const tookAgain = await takeTeamRole(p.captain, {
        team: KITCHEN,
        roleId: null,
        userId: p.member,
      });
      return {
        keenWhileFull,
        placesByOther,
        placesBelow,
        places,
        keenHeld,
        keen,
        keenAgain,
        roleKeen,
        keenBoard,
        byLead,
        picked,
        leadsFull,
        already,
        takeByLead,
        undo,
        after,
        took,
        tookAgain,
      };
    });
    expect(db).toMatchObject({
      keenWhileFull: { ok: false, error: KEEN_FULL },
      placesByOther: { ok: false, error: NOT_A_ROLE_KEEPER },
      placesBelow: { ok: false, error: LEAD_PLACES_BELOW },
      places: { ok: true },
      keenHeld: { ok: false, error: KEEN_HELD },
      keen: { ok: true },
      keenAgain: { ok: true },
      roleKeen: { ok: true },
      keenBoard: {
        asCaptain: {
          kitchen: {
            rows: [
              { isLead: true, keen: [{ userId: "@member" }], action: "pick" },
              { name: "Shopper", keen: [{ userId: "@other", name: "Zed" }] },
            ],
          },
          picksLead: true,
        },
        asKitchenLead: {
          kitchen: {
            rows: [
              { isLead: true, keen: [{ name: "Nova" }], action: "yours" },
              { keen: [{ name: "Zed" }] },
            ],
          },
          picksLead: false,
        },
        asFinanceLead: {
          kitchen: { rows: [{ keen: null }, { keen: null }] },
          everyone: [{}, {}, {}, {}, {}],
        },
        asMember: {
          kitchen: { rows: [{ keen: null, action: "unkeen" }, { keen: null }] },
          keenCount: 1,
          everyone: null,
        },
      },
      byLead: { ok: false, error: NOT_A_LEAD_PICKER },
      picked: { ok: true, joinedTeam: true },
      leadsFull: { ok: false, error: ROLE_FULL },
      already: { ok: false, error: ROLE_FULL },
      takeByLead: { ok: false, error: NOT_A_LEAD_PICKER },
      undo: { ok: true },
      after: {
        kitchen: {
          lead: { filled: 3, places: 2 },
          rows: [{ isLead: true, keen: [] }, { keen: [] }],
        },
      },
      took: { ok: true },
      tookAgain: { ok: false, error: ROLE_NOT_HELD },
    });
    expect(store).toEqual(db);
  });

  it("copies last year's roles, with nobody in them, only while the team has none this year", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const none = await copyLastYearsRoles(p.kitchenLead, { team: KITCHEN });
      await roleIn(seed, h.db(), YEAR - 2, "Old role", 1);
      await roleIn(seed, h.db(), YEAR - 1, "Shopper", 2);
      await roleIn(seed, h.db(), YEAR - 1, "Dishes", 3);
      const before = await board(viewers(p).member);
      const byOther = await copyLastYearsRoles(p.financeLead, {
        team: KITCHEN,
      });
      const byMember = await copyLastYearsRoles(p.member, { team: KITCHEN });
      const copied = await copyLastYearsRoles(p.kitchenLead, { team: KITCHEN });
      const again = await copyLastYearsRoles(p.captain, { team: KITCHEN });
      return {
        none,
        before: before.kitchen.lastYear,
        byOther,
        byMember,
        copied,
        again,
        after: await board(viewers(p).member),
      };
    });
    expect(db).toMatchObject({
      none: { ok: false, error: NO_ROLES_LAST_YEAR },
      before: [
        { name: "Shopper", places: 2 },
        { name: "Dishes", places: 3 },
      ],
      byOther: { ok: false, error: NOT_A_ROLE_KEEPER },
      byMember: { ok: false, error: NOT_A_ROLE_KEEPER },
      copied: { ok: true, copied: 2 },
      again: { ok: false, error: ROLES_ALREADY_THERE },
      after: {
        kitchen: {
          lastYear: [],
          rows: [
            { isLead: true },
            { name: "Shopper", places: 2, filled: 0, version: 1 },
            { name: "Dishes", places: 3, filled: 0 },
          ],
        },
      },
    });
    expect(store).toEqual(db);
  });
});
