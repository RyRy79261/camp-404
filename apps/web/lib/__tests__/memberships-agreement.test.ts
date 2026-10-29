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
  getTeamMembershipsEveryYear,
  getTeamMembershipsForCycle,
  setLead,
} from "@camp404/db/team-memberships";
import { deriveViewerRank } from "@camp404/core";
import { Rank, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, outcome } from "./_agreement";
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
import {
  assignTeam as rosterAssignTeam,
  getCampManagementRoster,
  getCampMemberDetail,
  getTeamCoverage,
  getTeamMemberships as rosterGetTeamMemberships,
  listMemberNotes,
  listDisplayNames,
  listMemberQuestionnaireGates,
  listNameableMembers,
  listTeamPeople,
  removeTeam as rosterRemoveTeam,
  setLead as rosterSetLead,
} from "../roster";
import { seedBurnerProfileAction } from "../users";
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

// The captain roster and the member panel's team writes, through lib/roster.ts:
// the same writes give the same answers, refusals and rosters on both sides
// (the bothWays pattern of _agreement.ts, with its personas).
describe("the captain roster and team writes: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    store.on = false;
    testStore.reset();
  });

  it("puts a member on teams, makes and unmakes a lead, refuses a lead who is not on the team, and takes them off", async () => {
    const { db, store: fromStore } = await bothWays(store, h, async (p) => {
      const write = { userId: p.member, actorId: p.captain };
      const first = await rosterAssignTeam({ ...write, team: FINANCE });
      const again = await rosterAssignTeam({ ...write, team: FINANCE });
      await rosterAssignTeam({ ...write, team: KITCHEN });
      const notOnTeam = await rosterSetLead({
        ...write,
        team: SOUND,
        isLead: true,
      });
      const made = await rosterSetLead({
        ...write,
        team: FINANCE,
        isLead: true,
      });
      const same = await rosterSetLead({
        ...write,
        team: FINANCE,
        isLead: true,
      });
      const before = {
        mine: await rosterGetTeamMemberships(p.member),
        coverage: await getTeamCoverage(),
        finance: await listTeamPeople(FINANCE),
      };
      const removed = await rosterRemoveTeam({ ...write, team: FINANCE });
      const removedAgain = await rosterRemoveTeam({ ...write, team: FINANCE });
      const nobody = await outcome(() =>
        rosterAssignTeam({
          userId: "00000000-0000-4000-8000-000000000000",
          team: KITCHEN,
          actorId: p.captain,
        }),
      );
      return {
        first,
        again,
        notOnTeam,
        made,
        same,
        before,
        removed,
        removedAgain,
        nobodyRefused: "threw" in nobody,
        after: {
          mine: await rosterGetTeamMemberships(p.member),
          coverage: await getTeamCoverage(),
          finance: await listTeamPeople(FINANCE),
        },
      };
    });
    expect(db).toMatchObject({
      first: { created: true, cycle: YEAR },
      again: { created: false },
      notOnTeam: { ok: false, reason: "not_a_member" },
      made: { ok: true, changed: true },
      same: { ok: true, changed: false },
      before: {
        mine: [
          { team: KITCHEN, isLead: false },
          { team: FINANCE, isLead: true },
        ],
        coverage: [
          { team: KITCHEN, members: 2, leads: 1 },
          { team: FINANCE, members: 2, leads: 2 },
        ],
      },
      removed: { removed: true },
      removedAgain: { removed: false },
      nobodyRefused: true,
      after: { mine: [{ team: KITCHEN, isLead: false }] },
    });
    expect(fromStore).toEqual(db);
  });

  it("lists the captain roster and one member's panel the same way", async () => {
    const { db, store: fromStore } = await bothWays(
      store,
      h,
      async (p, seed) => {
        await seed.join(p.member, FINANCE);
        await seed.lead(p.member, KITCHEN);
        await seed.participation(p.member, "applied");
        await seed.user("Late", { approval: "pending" });
        await seedBurnerProfileAction(p.member);
        const pick = (
          m: Awaited<ReturnType<typeof getCampManagementRoster>>[number],
        ) => ({
          displayName: m.displayName,
          rank: m.rank,
          approvalStatus: m.approvalStatus,
          isLead: m.isLead,
          teams: m.teams,
          leadTeams: m.leadTeams,
          duesPaid: m.duesPaid,
          onboardingComplete: m.onboardingComplete,
          pendingRequiredActions: m.pendingRequiredActions,
          pendingRequiredActionItems: m.pendingRequiredActionItems,
          participation: m.participation,
          participationIntent: m.participationIntent,
          email: m.email,
        });
        const detail = await getCampMemberDetail(p.member, {
          includeEmail: true,
        });
        return {
          roster: (await getCampManagementRoster({ includeEmail: true })).map(
            pick,
          ),
          detail: detail && {
            displayName: detail.displayName,
            rank: detail.rank,
            approvalStatus: detail.approvalStatus,
            onboardingComplete: detail.onboardingComplete,
            responses: detail.responses,
            email: detail.email,
            isFounder: detail.isFounder,
          },
          noDetail: await getCampMemberDetail(
            "00000000-0000-4000-8000-000000000000",
          ),
          notes: await listMemberNotes(p.member),
          gates: (await listMemberQuestionnaireGates(p.member)).map((g) => ({
            actionKey: g.actionKey,
            status: g.status,
            blocking: g.blocking,
          })),
        };
      },
    );
    expect(db).toMatchObject({
      roster: [
        { displayName: "Cap", rank: "captain", teams: [] },
        { displayName: "Cook", isLead: true, teams: [KITCHEN] },
        { displayName: "Fin", isLead: true, teams: [FINANCE] },
        { displayName: "Late", approvalStatus: "pending" },
        {
          displayName: "Nova",
          isLead: true,
          teams: [KITCHEN, FINANCE],
          leadTeams: [KITCHEN],
          pendingRequiredActions: 1,
          participation: "applied",
          participationIntent: "yes",
        },
        { displayName: "Zed" },
      ],
      detail: { displayName: "Nova", onboardingComplete: false },
      noDetail: null,
      notes: [],
      gates: [
        { actionKey: "burner_profile", status: "pending", blocking: true },
      ],
    });
    expect(fromStore).toEqual(db);
  });

  it("names the members a captain may name, and display names by id, the same way", async () => {
    const { db, store: fromStore } = await bothWays(
      store,
      h,
      async (p, seed) => {
        const late = await seed.user("Late", { approval: "pending" });
        const byName = (a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name);
        return {
          nameable: (await listNameableMembers()).sort(byName),
          names: (
            await listDisplayNames([
              p.member,
              late,
              "00000000-0000-4000-8000-000000000000",
            ])
          ).sort(byName),
          none: await listDisplayNames([]),
        };
      },
    );
    expect(db).toEqual({
      nameable: [
        { id: "@captain", name: "Cap" },
        { id: "@kitchenLead", name: "Cook" },
        { id: "@financeLead", name: "Fin" },
        { id: "#6", name: "Late" },
        { id: "@member", name: "Nova" },
        { id: "@other", name: "Zed" },
      ],
      names: [
        { id: "#6", name: "Late" },
        { id: "@member", name: "Nova" },
      ],
      none: [],
    });
    expect(fromStore).toEqual(db);
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
    // by the header, the page and the captain gate (React cache()), sent
    // together: every year's memberships, kept to the current one. The
    // manifest also reads the member's lift (does My lift show?), with the
    // year passed in; Home used to make that read on its own, and now shares
    // it. The lift's three reads (driving, riding, riders) go out at once.
    // What a page waits for is the number of those waits, not the reads.
    const settingsAndTeams = await count(async () => {
      const [config, rows] = await Promise.all([
        getCampConfig(),
        getTeamMembershipsEveryYear(lead.id),
      ]);
      const year =
        config.cycles?.find((c) => c.endedAt === null)?.year ?? UNSET_CYCLE;
      expect(rows.filter((r) => r.cycle === year)).toEqual(
        await getTeamMembershipsForCycle(lead.id, year),
      );
    });
    const lift = await count(() => dbGetMyLift(lead.id, YEAR));
    const waits = 1 + 1;

    console.info(
      `header reads: before ${before} one after another; after ${settingsAndTeams - 1} + lift ${lift}, in ${waits} waits`,
    );
    expect(before).toBe(5);
    // Two reads plus the check's own read of the year's rows.
    expect(settingsAndTeams).toBe(3);
    expect(lift).toBe(3);
    expect(waits).toBeLessThan(before);
    query.mockRestore();
  });
});
