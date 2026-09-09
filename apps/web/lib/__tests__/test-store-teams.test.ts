import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { canSendToAudience, deriveViewerRank } from "@camp404/core";
import { computeAudience, type AudienceData } from "@camp404/db/audience";
import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import { testStore } from "../test-store";

// The E2E backend routes `isTeamLead`, the lead-teams read and the camp roster
// to this store, so a Playwright `team_lead` persona only stands on something
// real if the mirror behaves the way `team_memberships` does. A store that
// merely *has* memberships is not enough — one that DISAGREES with the real
// backend is worse than one that refuses, because it makes e2e green while
// production is broken.
//
// So this suite does two things:
//
//   1. mirrors packages/db/src/__tests__/team-memberships.test.ts case for
//      case — the same scenarios, the same expectations, against the store;
//   2. feeds the store's rows to the SAME pure production functions the real
//      backend's rows are fed to (`computeAudience`, `canSendToAudience`,
//      `deriveViewerRank`), so the agreement is asserted rather than asserted
//      *about*. (A live side-by-side against the PGlite harness would need
//      @electric-sql/pglite as an apps/web devDependency — see the note in the
//      handover; these are the same functions either way.)

/** Tell the camp what year it is — the mirror of the PGlite suite's `foundedAt`. */
function foundedAt(year: number): void {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [
      { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
    ],
  };
  testStore.setTeamsConfig(config satisfies TeamsConfig);
}

function makeUser(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

beforeEach(() => testStore.reset());

describe("testStore.assignTeam — the db writer, mirrored", () => {
  it("stamps the camp's CURRENT year, so a current-year read sees it", () => {
    const member = makeUser("cook");
    foundedAt(2027);

    expect(testStore.assignTeam({ userId: member.id, team: "kitchen" })).toEqual(
      { created: true, cycle: 2027 },
    );
    expect(testStore.getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: false, cycle: 2027 },
    ]);
  });

  it("is a no-op the second time, not a duplicate row", () => {
    const member = makeUser("cook");
    foundedAt(2027);

    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    expect(
      testStore.assignTeam({ userId: member.id, team: "kitchen" }).created,
    ).toBe(false);
    expect(testStore.getTeamMemberships(member.id)).toHaveLength(1);
  });

  it("never touches an existing row's lead flag", () => {
    // A re-assignment must not silently demote a lead — the reason `assignTeam`
    // is not an upsert of the whole row.
    const lead = makeUser("lead");
    foundedAt(2027);
    testStore.assignTeam({ userId: lead.id, team: "kitchen" });
    testStore.setLead({ userId: lead.id, team: "kitchen", isLead: true });

    testStore.assignTeam({ userId: lead.id, team: "kitchen" });

    expect(testStore.getTeamMemberships(lead.id)).toEqual([
      { team: "kitchen", isLead: true, cycle: 2027 },
    ]);
  });

  it("refuses a member who does not exist (the row's foreign key)", () => {
    foundedAt(2027);
    expect(() =>
      testStore.assignTeam({ userId: "test-user-nobody", team: "kitchen" }),
    ).toThrow(/No test user/);
  });
});

describe("testStore.removeTeam — the db writer, mirrored", () => {
  it("removes THIS year's row and leaves last year's untouched", () => {
    const member = makeUser("cook");
    // Last year they were on the kitchen team, and led it.
    testStore.seedTeamMembership({
      userId: member.id,
      team: "kitchen",
      isLead: true,
      cycle: 2026,
    });
    foundedAt(2027);
    testStore.assignTeam({ userId: member.id, team: "kitchen" });

    expect(testStore.removeTeam({ userId: member.id, team: "kitchen" })).toEqual(
      { removed: true, cycle: 2027 },
    );
    expect(testStore.getTeamMemberships(member.id)).toEqual([]);

    // The year namespace destroys nothing: rewind the camp to 2026 and last
    // year's membership — lead flag intact — is still on file.
    foundedAt(2026);
    expect(testStore.getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: true, cycle: 2026 },
    ]);
  });

  it("allows removing the team's last lead — a leaderless team is legal", () => {
    const lead = makeUser("lead");
    foundedAt(2027);
    testStore.assignTeam({ userId: lead.id, team: "kitchen" });
    testStore.setLead({ userId: lead.id, team: "kitchen", isLead: true });

    expect(testStore.removeTeam({ userId: lead.id, team: "kitchen" })).toEqual({
      removed: true,
      cycle: 2027,
    });
    expect(testStore.isTeamLead(lead.id)).toBe(false);
  });

  it("is a no-op when they were not on the team", () => {
    const member = makeUser("cook");
    foundedAt(2027);
    expect(testStore.removeTeam({ userId: member.id, team: "kitchen" })).toEqual(
      { removed: false, cycle: 2027 },
    );
  });
});

describe("testStore.setLead — the db writer, mirrored", () => {
  it("flips the flag, and isTeamLead sees it", () => {
    const member = makeUser("cook");
    foundedAt(2027);
    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    expect(testStore.isTeamLead(member.id)).toBe(false);

    expect(
      testStore.setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: true, changed: true });

    expect(testStore.isTeamLead(member.id)).toBe(true);
    expect(testStore.getLeadTeams(member.id)).toEqual(["kitchen"]);
  });

  it("clears the flag again without removing the membership", () => {
    const member = makeUser("cook");
    foundedAt(2027);
    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    testStore.setLead({ userId: member.id, team: "kitchen", isLead: true });

    expect(
      testStore.setLead({ userId: member.id, team: "kitchen", isLead: false }),
    ).toEqual({ ok: true, changed: true });

    expect(testStore.isTeamLead(member.id)).toBe(false);
    expect(testStore.getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: false, cycle: 2027 },
    ]);
  });

  it("refuses a non-member and creates nothing", () => {
    // The lead control must never mint a membership — and with it `team_lead`
    // clearance — for a wrong id.
    const stranger = makeUser("stranger");
    foundedAt(2027);

    expect(
      testStore.setLead({ userId: stranger.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: false, reason: "not_a_member" });
    expect(testStore.getTeamMemberships(stranger.id)).toEqual([]);
    expect(testStore.isTeamLead(stranger.id)).toBe(false);
  });

  it("refuses when the only membership is in a PRIOR year", () => {
    const member = makeUser("cook");
    testStore.seedTeamMembership({
      userId: member.id,
      team: "kitchen",
      cycle: 2026,
    });
    foundedAt(2027);

    expect(
      testStore.setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: false, reason: "not_a_member" });
  });

  it("is idempotent for a no-change call", () => {
    const member = makeUser("cook");
    foundedAt(2027);
    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    testStore.setLead({ userId: member.id, team: "kitchen", isLead: true });

    expect(
      testStore.setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: true, changed: false });
  });
});

describe("the camp-management roster reads the memberships", () => {
  it("carries this year's teams and lead flag, and only this year's", () => {
    const lead = makeUser("Ada");
    const member = makeUser("Grace");
    testStore.seedTeamMembership({
      userId: member.id,
      team: "structures",
      isLead: true,
      cycle: 2026,
    });
    foundedAt(2027);
    testStore.assignTeam({ userId: lead.id, team: "kitchen" });
    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    testStore.setLead({ userId: lead.id, team: "kitchen", isLead: true });

    const roster = testStore.getCampManagementRoster();
    expect(roster.find((r) => r.id === lead.id)).toMatchObject({
      isLead: true,
      teams: ["kitchen"],
    });
    // Last year's structures membership (and its lead flag) is not this year's.
    expect(roster.find((r) => r.id === member.id)).toMatchObject({
      isLead: false,
      teams: ["kitchen"],
    });
  });
});

// --- Agreement with the real backend ----------------------------------------
// The same rows, through the same production functions. If the store's shape or
// year-scoping drifted from `team_memberships`, these would answer differently
// from the PGlite suite's identical scenarios.

/** The AudienceData a send builds out of the roster — the action's own mapping. */
function audienceData(): AudienceData {
  const roster = testStore.getCampManagementRoster();
  return {
    members: roster.map((m) => ({
      id: m.id,
      isSystem: false,
      sanitised: false,
    })),
    memberships: roster.flatMap((m) =>
      m.teams.map((team) => ({ userId: m.id, team, isLead: m.isLead })),
    ),
    driverUserIds: [],
    targetUserIds: [],
  };
}

describe("a team send reaches the members a captain just assigned", () => {
  it("resolves scope:'team' to a NON-EMPTY recipient list", () => {
    // The keystone the PGlite suite asserts against `resolveAudience`: before
    // this store had memberships, every team-scoped send in E2E resolved to
    // nobody and still reported success.
    const cook = makeUser("cook");
    const builder = makeUser("builder");
    foundedAt(2027);
    testStore.assignTeam({ userId: cook.id, team: "kitchen" });
    testStore.assignTeam({ userId: builder.id, team: "structures" });

    expect(
      computeAudience({ scope: "team", team: "kitchen" }, audienceData(), null),
    ).toEqual([cook.id]);
  });

  it("resolves scope:'team_leads' to nobody until a lead is set", () => {
    const cook = makeUser("cook");
    foundedAt(2027);
    testStore.assignTeam({ userId: cook.id, team: "kitchen" });

    expect(
      computeAudience({ scope: "team_leads", team: null }, audienceData(), null),
    ).toEqual([]);

    testStore.setLead({ userId: cook.id, team: "kitchen", isLead: true });
    expect(
      computeAudience({ scope: "team_leads", team: null }, audienceData(), null),
    ).toEqual([cook.id]);
  });

  it("does NOT reach last year's team", () => {
    const cook = makeUser("cook");
    testStore.seedTeamMembership({
      userId: cook.id,
      team: "kitchen",
      cycle: 2026,
    });
    foundedAt(2027);

    expect(
      computeAudience({ scope: "team", team: "kitchen" }, audienceData(), null),
    ).toEqual([]);

    // Re-established for 2027 through the store's writer, and it lands.
    testStore.assignTeam({ userId: cook.id, team: "kitchen" });
    expect(
      computeAudience({ scope: "team", team: "kitchen" }, audienceData(), null),
    ).toEqual([cook.id]);
  });
});

describe("the lead the store produces is the lead the send gate sees", () => {
  /** Exactly what the send gate builds: derived rank + this year's lead teams. */
  function actorFor(userId: string, rank: "captain" | "member") {
    return {
      rank: deriveViewerRank(rank, testStore.isTeamLead(userId)),
      leadTeams: testStore.getLeadTeams(userId),
    };
  }

  it("may send to the team they lead, and to nothing wider", () => {
    const lead = makeUser("Ada");
    foundedAt(2027);
    testStore.assignTeam({ userId: lead.id, team: "kitchen" });
    testStore.assignTeam({ userId: lead.id, team: "structures" });
    testStore.setLead({ userId: lead.id, team: "kitchen", isLead: true });

    const actor = actorFor(lead.id, "member");
    expect(actor.rank).toBe("team_lead");
    expect(canSendToAudience(actor, { scope: "team", team: "kitchen" })).toBe(
      true,
    );
    // On structures they are a MEMBER, not a lead — membership is not the
    // permission, the lead flag is.
    expect(canSendToAudience(actor, { scope: "team", team: "structures" })).toBe(
      false,
    );
    for (const scope of ["everyone", "team_leads", "drivers", "individual", "opt_in"] as const) {
      expect(canSendToAudience(actor, { scope, team: "kitchen" })).toBe(false);
    }
  });

  it("stops being a lead at a rollover, and so may send nothing", () => {
    const lead = makeUser("Ada");
    foundedAt(2027);
    testStore.assignTeam({ userId: lead.id, team: "kitchen" });
    testStore.setLead({ userId: lead.id, team: "kitchen", isLead: true });

    // The camp starts a new year: teams and lead roles go fresh.
    foundedAt(2028);

    const actor = actorFor(lead.id, "member");
    expect(actor).toEqual({ rank: "camp_member", leadTeams: [] });
    expect(canSendToAudience(actor, { scope: "team", team: "kitchen" })).toBe(
      false,
    );
  });

  it("leaves a captain unrestricted whether or not they lead anything", () => {
    const captain = makeUser("Captain", "captain");
    foundedAt(2027);

    const actor = actorFor(captain.id, "captain");
    expect(actor).toEqual({ rank: "captain", leadTeams: [] });
    expect(canSendToAudience(actor, { scope: "everyone" })).toBe(true);
    expect(canSendToAudience(actor, { scope: "team", team: "kitchen" })).toBe(
      true,
    );
  });

  it("gives a plain member nothing to send to", () => {
    const member = makeUser("Grace");
    foundedAt(2027);
    testStore.assignTeam({ userId: member.id, team: "kitchen" });

    const actor = actorFor(member.id, "member");
    expect(actor).toEqual({ rank: "camp_member", leadTeams: [] });
    expect(canSendToAudience(actor, { scope: "team", team: "kitchen" })).toBe(
      false,
    );
    expect(canSendToAudience(actor, { scope: "everyone" })).toBe(false);
  });
});
