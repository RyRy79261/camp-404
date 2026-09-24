import { beforeEach, describe, expect, it, vi } from "vitest";

// The roster facade's team writes: the captain actions call these, and they
// must reach the test store under E2E and @camp404/db otherwise, so Playwright
// drives the same code path a captain does.

vi.mock("server-only", () => ({}));
const mode = vi.hoisted(() => ({ testStore: true }));
vi.mock("../test-mode", () => ({
  isE2ETestMode: () => mode.testStore,
  usesTestStore: () => mode.testStore,
}));
vi.mock("@camp404/db/team-memberships", () => ({
  assignTeam: vi.fn(async () => ({ created: true, cycle: 2031 })),
  removeTeam: vi.fn(async () => ({ removed: true, cycle: 2031 })),
  setLead: vi.fn(async () => ({ ok: true, changed: true })),
  getTeamMemberships: vi.fn(async () => []),
  getTeamCoverage: vi.fn(async () => []),
}));

import * as db from "@camp404/db/team-memberships";
import { assignTeam, getTeamMemberships, removeTeam, setLead } from "../roster";
import { testStore } from "../test-store";

beforeEach(() => {
  testStore.reset();
  vi.clearAllMocks();
});

function makeMember() {
  return testStore.createUser({
    authUserId: "auth-driver",
    displayName: "Driver",
    inviteCode: "seeded",
    rank: "member",
  });
}

describe("under the E2E test store", () => {
  beforeEach(() => {
    mode.testStore = true;
  });

  it("puts a member on a team, makes them its lead and takes them off it", async () => {
    const member = makeMember();
    const cycle = testStore.currentCycleNumber();

    expect(
      await assignTeam({
        userId: member.id,
        team: "transport_and_logistics",
        actorId: "cap",
      }),
    ).toEqual({ created: true, cycle });
    expect(
      await setLead({
        userId: member.id,
        team: "transport_and_logistics",
        isLead: true,
        actorId: "cap",
      }),
    ).toEqual({ ok: true, changed: true });
    expect(await getTeamMemberships(member.id)).toEqual([
      { team: "transport_and_logistics", isLead: true, cycle },
    ]);

    expect(
      await removeTeam({
        userId: member.id,
        team: "transport_and_logistics",
        actorId: "cap",
      }),
    ).toEqual({ removed: true, cycle });
    expect(await getTeamMemberships(member.id)).toEqual([]);
    expect(db.assignTeam).not.toHaveBeenCalled();
    expect(db.setLead).not.toHaveBeenCalled();
    expect(db.removeTeam).not.toHaveBeenCalled();
  });

  it("refuses to make a non-member a lead, as the database does", async () => {
    const member = makeMember();

    expect(
      await setLead({
        userId: member.id,
        team: "mutant_vehicle",
        isLead: true,
      }),
    ).toEqual({ ok: false, reason: "not_a_member" });
  });
});

describe("against the database", () => {
  beforeEach(() => {
    mode.testStore = false;
  });

  it("passes each write, with the acting captain, to @camp404/db", async () => {
    const input = {
      userId: "u1",
      team: "mutant_vehicle" as const,
      actorId: "cap",
    };

    await assignTeam(input);
    await setLead({ ...input, isLead: true });
    await removeTeam(input);

    expect(db.assignTeam).toHaveBeenCalledWith(input);
    expect(db.setLead).toHaveBeenCalledWith({ ...input, isLead: true });
    expect(db.removeTeam).toHaveBeenCalledWith(input);
  });
});
