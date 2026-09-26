// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import {
  getCampConfig,
  getTeamsConfig as dbGetTeamsConfig,
  UNSET_CYCLE,
} from "@camp404/db/camp-config";
import { isTeamLead as dbIsTeamLead } from "@camp404/db/roster";
import { getMyLift as dbGetMyLift } from "@camp404/db/cars";
import {
  assignTeam,
  getTeamMemberships as dbGetTeamMemberships,
  getTeamMembershipsForCycle,
  setLead,
} from "@camp404/db/team-memberships";
import { deriveViewerRank } from "@camp404/core";
import { Rank, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../packages/db/src/__tests__/_factories";

// The console reads one member's memberships ONCE per request
// (`getMyMemberships`) and derives the lead flag, the led teams, their teams
// and the program manifest from it. Playwright runs that read against the
// in-memory test store, so a lead persona only means something if the store
// and the database give the same answer for the same member. This seeds one
// lead persona both ways, against real Postgres (PGlite, the packages/db
// harness) and the store, and compares every answer the console derives.

const store = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => store.on,
  usesTestStore: () => store.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  getLeadTeams,
  getMyMemberships,
  getMyTeams,
  isTeamLead,
} from "../users";
import { getCampSettings } from "../camp-config";
import { buildProgramManifest } from "../programs";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const SOUND = Team.enum.sound;
const YEAR = 2027;

/** Tell the camp what year it is, the way setFoundingYear would. */
async function foundedAt(db: DB, year: number): Promise<void> {
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
    .set({
      config: {
        ...row!.config,
        cycles: [
          { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
        ],
      },
    })
    .where(eq(schema.campSettings.id, true));
}

/** The console's derived answers for one member, from whichever backend is on. */
async function answers(userId: string) {
  const memberships = await getMyMemberships(userId);
  const settings = await getCampSettings();
  const manifest = buildProgramManifest({
    mode: "full",
    approved: true,
    rank: deriveViewerRank(
      Rank.enum.member,
      memberships.some((m) => m.isLead),
    ),
    memberships,
    teams: settings.teams.teams,
    hasLift: false,
    inbox: 0,
    healthWarnings: null,
  });
  return {
    memberships,
    cycle: settings.cycleNumber,
    isLead: await isTeamLead(userId),
    leadTeams: await getLeadTeams(userId),
    myTeams: await getMyTeams(userId),
    manifest,
  };
}

describe("the memberships read: the database and the test store agree", () => {
  const h = useTestDb();

  beforeEach(() => {
    store.on = false;
    testStore.reset();
  });
  afterEach(() => {
    store.on = false;
  });

  it("keeps Team.options in the database enum's order, the order both sort by", () => {
    expect(Team.options).toEqual([...schema.teamEnum.enumValues]);
  });

  it("for a lead of Kitchen who is also on Finance, with last year's lead row on file", async () => {
    // The database, through the production writers.
    const db = h.db();
    const real = await makeUser(db, { displayName: "Cook" });
    await makeMembership(db, {
      userId: real.id,
      team: SOUND,
      isLead: true,
      cycle: YEAR - 1,
    });
    await foundedAt(db, YEAR);
    await assignTeam({ userId: real.id, team: FINANCE });
    await assignTeam({ userId: real.id, team: KITCHEN });
    await setLead({ userId: real.id, team: KITCHEN, isLead: true });
    const fromDb = await answers(real.id);

    // The test store, the way /api/test/seed-team and a spec would.
    store.on = true;
    testStore.setTeamsConfig({
      ...testStore.getTeamsConfig(),
      cycles: [
        { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
      ],
    } as ReturnType<typeof testStore.getTeamsConfig>);
    const fake = testStore.createUser({
      authUserId: "auth-cook",
      displayName: "Cook",
      inviteCode: "seed",
    });
    testStore.seedTeamMembership({
      userId: fake.id,
      team: SOUND,
      isLead: true,
      cycle: YEAR - 1,
    });
    testStore.assignTeam({ userId: fake.id, team: FINANCE });
    testStore.assignTeam({ userId: fake.id, team: KITCHEN });
    testStore.setLead({ userId: fake.id, team: KITCHEN, isLead: true });
    const fromStore = await answers(fake.id);

    // The persona really is a lead of Kitchen this year, and only this year.
    expect(fromDb.cycle).toBe(YEAR);
    expect(fromDb.memberships).toEqual([
      { team: KITCHEN, isLead: true },
      { team: FINANCE, isLead: false },
    ]);
    expect(fromDb.isLead).toBe(true);
    expect(fromDb.manifest.teamFolders.map((f) => f.team)).toEqual([
      KITCHEN,
      FINANCE,
    ]);

    // And the store says the same thing, answer for answer.
    expect(fromStore).toEqual(fromDb);
  });

  it("for a member on a camp with no founding year, read on the sentinel year", async () => {
    // Before a captain names the founding year, the database reads every
    // year-scoped row on UNSET_CYCLE, and the store must fall back the same way.
    const db = h.db();
    const real = await makeUser(db, { displayName: "Early" });
    await makeMembership(db, {
      userId: real.id,
      team: FINANCE,
      isLead: true,
      cycle: UNSET_CYCLE + 1,
    });
    await assignTeam({ userId: real.id, team: KITCHEN });
    const fromDb = await answers(real.id);

    store.on = true;
    const fake = testStore.createUser({
      authUserId: "auth-early",
      displayName: "Early",
      inviteCode: "seed",
    });
    testStore.seedTeamMembership({
      userId: fake.id,
      team: FINANCE,
      isLead: true,
      cycle: UNSET_CYCLE + 1,
    });
    testStore.assignTeam({ userId: fake.id, team: KITCHEN });
    const fromStore = await answers(fake.id);

    expect(fromDb.cycle).toBe(UNSET_CYCLE);
    expect(fromDb.memberships).toEqual([{ team: KITCHEN, isLead: false }]);
    expect(fromDb.isLead).toBe(false);
    expect(fromStore).toEqual(fromDb);
  });
});

// A MEASUREMENT of the database layer's shape, for the plan's table: it calls
// @camp404/db directly, not the app's functions, so it cannot catch the app
// going back to the old reads. The guard on the app's own path, with a real
// per-request memoiser standing in for React cache(), is
// lib/__tests__/request-reads.test.ts.
describe("the database layer's reads for the header, measured on real Postgres", () => {
  const h = useTestDb();

  it("documents the db-layer shape: one settings read and one memberships read, lift included", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await foundedAt(db, YEAR);
    await assignTeam({ userId: lead.id, team: KITCHEN });
    await setLead({ userId: lead.id, team: KITCHEN, isLead: true });

    const client = h.client();
    const query = vi.spyOn(client, "query");
    const count = async (work: () => Promise<unknown>) => {
      query.mockClear();
      await work();
      return query.mock.calls.length;
    };

    // Before: the header asked isTeamLead, getTeamsConfig and getMyTeams, and
    // each membership read looked the year up again.
    const before = await count(async () => {
      await dbIsTeamLead(lead.id);
      await dbGetTeamsConfig();
      await dbGetTeamMemberships(lead.id);
    });
    // After: one settings read and one memberships read per request, shared
    // by the header, the page and the captain gate (React cache()). The
    // manifest also reads the member's lift (does My lift show?), with the
    // year passed in; Home used to make that read on its own, and now shares
    // it.
    const settingsAndTeams = await count(async () => {
      const config = await getCampConfig();
      const year =
        config.cycles?.find((c) => c.endedAt === null)?.year ?? UNSET_CYCLE;
      await getTeamMembershipsForCycle(lead.id, year);
    });
    const lift = await count(() => dbGetMyLift(lead.id, YEAR));
    const after = settingsAndTeams + lift;

    console.info(
      `header round trips: before ${before}; after ${settingsAndTeams} + lift ${lift} = ${after}`,
    );
    expect(before).toBe(5);
    expect(settingsAndTeams).toBe(2);
    expect(after).toBeLessThan(before);
    query.mockRestore();
  });
});
