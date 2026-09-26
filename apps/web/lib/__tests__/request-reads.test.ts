// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactModule from "react";
import type * as MemberGate from "@/lib/member-gate";

// PR B's claim is that one console request reads `camp_settings` (the team
// config and the year) ONCE and the member's memberships ONCE, however many
// of the header, the page, the captain gate and the program manifest ask. That
// rests on React `cache()`. Outside a React Server Components render (vitest)
// `cache()` is a pass-through, so no other test can see the dedupe: take every
// `cache(` wrapper away and they all stay green.
//
// So this file stands a real per-request memoiser in for `cache()`, emptied by
// `newRequest()`, runs the app's own read functions against real Postgres
// (PGlite) and counts the SQL statements by table. Remove a `cache(` wrapper,
// or have a membership read look the year up again, and a count goes up.

const scope = vi.hoisted(() => ({ memos: [] as Map<string, unknown>[] }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      scope.memos.push(memo as Map<string, unknown>);
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});
/** A new server request: React throws every cached read away between them. */
const newRequest = () => scope.memos.forEach((memo) => memo.clear());

vi.mock("@/lib/member-gate", async (importActual) => ({
  ...(await importActual<typeof MemberGate>()),
  resolveMemberState: vi.fn(),
}));
// The timed database probe behind /captains/system. The manifest's health
// flag must never run it: it waits up to 5 s, and every member's page asks.
vi.mock("@/lib/system-probe", () => ({ getSystemStatus: vi.fn() }));

import { eq } from "drizzle-orm";
import { Rank, Team } from "@camp404/types";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../packages/db/src/__tests__/_factories";
import { isCampBootstrapped } from "../bootstrap";
import {
  getCampSettings,
  getCurrentCycle,
  getCycles,
  getTeamsConfig,
} from "../camp-config";
import { getMyLift } from "../lifts";
import { resolveMemberState } from "../member-gate";
import { getProgramManifest } from "../program-manifest";
import { deriveSystemStatus } from "../system-status";
import { getSystemStatus } from "../system-probe";
import {
  getLeadTeams,
  getMyMemberships,
  getMyTeams,
  isTeamLead,
  type CampUser,
} from "../users";

const KITCHEN = Team.enum.kitchen;
const YEAR = 2027;

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

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

function campUserOf(row: typeof schema.users.$inferSelect): CampUser {
  return {
    id: row.id,
    authUserId: row.authUserId,
    displayName: row.displayName,
    profileImageUrl: null,
    inviteCode: "seed",
    rank: row.rank,
    approvalStatus: "approved",
    approvalDecisionReason: null,
  };
}

function signedInAs(user: CampUser) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: {
      id: user.authUserId,
      primaryEmail: "cook@example.com",
      displayName: user.displayName,
      emailVerified: true,
    },
    campUser: user,
    block: null,
  });
}

/** An environment with every core check set, so health reads "ok". */
function cleanEnv() {
  vi.stubEnv("E2E_TEST_MODE", "");
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(48));
  vi.stubEnv("BETTER_AUTH_URL", "https://camp404.test");
  vi.stubEnv("PGCRYPTO_KEY", "k".repeat(64));
  const status = deriveSystemStatus(process.env, {
    kind: "ok",
    latencyMs: 0,
    captainCount: 1,
    bootstrapped: true,
  });
  // The precondition: otherwise an "ok" below would say nothing.
  expect(
    [...status.core, ...status.optional].filter((c) => c.tone === "attention"),
  ).toEqual([]);
}

describe("one console request's reads, counted against real Postgres", () => {
  const h = useTestDb();

  beforeEach(() => {
    newRequest();
    cleanEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  /** Run `work` as one request; the SQL it sent, by what it read. */
  async function oneRequest(work: () => Promise<unknown>) {
    newRequest();
    const query = vi.spyOn(h.client(), "query");
    try {
      await work();
      const sql = query.mock.calls.map((call) => String(call[0]));
      const reads = (pattern: RegExp) =>
        sql.filter((s) => pattern.test(s)).length;
      return {
        settings: reads(/select "config" from "camp_settings"/),
        latch: reads(/select "bootstrapped_at" from "camp_settings"/),
        memberships: reads(/from "team_memberships"/),
      };
    } finally {
      query.mockRestore();
    }
  }

  it("reads the settings and the memberships once, however many ask", async () => {
    const db = h.db();
    const lead = await makeUser(db, { rank: Rank.enum.member });
    await foundedAt(db, YEAR);
    await assignTeam({ userId: lead.id, team: KITCHEN });
    await setLead({ userId: lead.id, team: KITCHEN, isLead: true });

    const counts = await oneRequest(async () => {
      // What the header, the page and the captain gate each ask, in turn.
      await getCampSettings();
      await getTeamsConfig();
      await getCurrentCycle();
      await getCycles();
      await getMyMemberships(lead.id);
      expect(await isTeamLead(lead.id)).toBe(true);
      expect(await getLeadTeams(lead.id)).toEqual([KITCHEN]);
      expect(await getMyTeams(lead.id)).toEqual([
        { team: KITCHEN, isLead: true },
      ]);
      expect(await getMyLift(lead.id)).toBeNull();
    });
    expect(counts).toEqual({ settings: 1, latch: 0, memberships: 1 });

    // And a cached read never outlives its request.
    expect(await oneRequest(() => getMyMemberships(lead.id))).toMatchObject({
      settings: 1,
      memberships: 1,
    });
  });

  it("builds the manifest on the same reads the layout and the page share", async () => {
    const db = h.db();
    const lead = await makeUser(db, { rank: Rank.enum.member });
    await makeUser(db, { rank: Rank.enum.captain });
    await foundedAt(db, YEAR);
    await assignTeam({ userId: lead.id, team: KITCHEN });
    await setLead({ userId: lead.id, team: KITCHEN, isLead: true });
    signedInAs(campUserOf(lead));

    const counts = await oneRequest(async () => {
      // The layout asks whether the camp is set up, then draws the manifest;
      // the page asks for the lead flag and the lift again.
      expect(await isCampBootstrapped()).toBe(true);
      const manifest = await getProgramManifest();
      expect(manifest?.teamFolders.map((f) => f.team)).toEqual([KITCHEN]);
      await isTeamLead(lead.id);
      await getMyLift(lead.id);
    });
    expect(counts).toEqual({ settings: 1, latch: 1, memberships: 1 });
  });

  it("works the health flag out without the timed probe: coarse for a member, detailed for a captain", async () => {
    const db = h.db();
    const member = await makeUser(db, { rank: Rank.enum.member });
    await foundedAt(db, YEAR);
    signedInAs(campUserOf(member));

    // No captain yet: setup needs attention, read from the setup state.
    newRequest();
    expect((await getProgramManifest())?.tray.health).toEqual({
      status: "warning",
    });

    const captain = await makeUser(db, { rank: Rank.enum.captain });
    newRequest();
    expect((await getProgramManifest())?.tray.health).toEqual({
      status: "ok",
    });

    signedInAs(campUserOf(captain));
    newRequest();
    expect((await getProgramManifest())?.tray.health).toEqual({
      status: "ok",
      warnings: 0,
      href: "/captains/system",
    });

    expect(getSystemStatus).not.toHaveBeenCalled();
  });

  it("reads a camp with no founding year on the sentinel year", async () => {
    const db = h.db();
    const member = await makeUser(db, { rank: Rank.enum.member });
    await assignTeam({ userId: member.id, team: KITCHEN });
    newRequest();
    expect((await getCampSettings()).cycleNumber).toBe(UNSET_CYCLE);
    expect(await getMyTeams(member.id)).toEqual([
      { team: KITCHEN, isLead: false },
    ]);
  });
});
