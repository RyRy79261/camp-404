import { beforeEach, describe, expect, it, vi } from "vitest";

// Help wanted's facade, over the E2E test store. What each viewer gets is
// decided on the server, never hidden in the UI:
//  - who is keen reaches a captain and the team's own leads only; a member,
//    and a lead of another team, get only their own flag;
//  - member ids and the picker's list reach only someone who runs a team;
//  - Lead is the lead flag: making someone a lead shows on the board, and
//    only a captain gets "Pick someone" on it.

vi.mock("server-only", () => ({}));
vi.mock("../test-mode", () => ({ usesTestStore: () => true }));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => true }));
vi.mock("../camp-config", async () => {
  const { testStore } = await import("../test-store");
  return {
    getCampSettings: async () => ({
      cycleNumber: testStore.currentCycleNumber(),
      current: null,
      teams: {
        teams: [
          { key: "kitchen", label: "Kitchen", order: 0, archived: false },
          { key: "structures", label: "Structures", order: 1, archived: false },
          { key: "sound", label: "Sound", order: 2, archived: true },
        ],
      },
    }),
  };
});

import {
  getHelpWantedView,
  setLeadPlaces,
  giveTeamRole,
  saveTeamRole,
  setKeen,
} from "../help-wanted";
import { testStore } from "../test-store";

function person(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

beforeEach(() => testStore.reset());

async function scene() {
  const captain = person("Cap Tain", "captain");
  const kitLead = person("Kit Lead");
  testStore.assignTeam({ userId: kitLead.id, team: "kitchen" });
  testStore.setLead({ userId: kitLead.id, team: "kitchen", isLead: true });
  const strucLead = person("Struc Lead");
  testStore.assignTeam({ userId: strucLead.id, team: "structures" });
  testStore.setLead({ userId: strucLead.id, team: "structures", isLead: true });
  const dee = person("Dee Member");
  const sam = person("Sam Other");
  const saved = await saveTeamRole(kitLead.id, {
    team: "kitchen",
    name: "Shopper",
    places: 2,
    note: null,
    expectedVersion: 0,
  });
  expect(saved.ok).toBe(true);
  const view = await getHelpWantedView({
    userId: kitLead.id,
    rank: "team_lead",
    ledTeams: ["kitchen"],
  });
  const roleId = view.teams.find((t) => t.key === "kitchen")!.rows[1]!.roleId;
  await setKeen(dee.id, { team: "kitchen", roleId, keen: true });
  await setKeen(sam.id, { team: "kitchen", roleId, keen: true });
  return { captain, kitLead, strucLead, dee, sam, roleId };
}

const shopperOf = (view: Awaited<ReturnType<typeof getHelpWantedView>>) =>
  view.teams.find((t) => t.key === "kitchen")!.rows[1]!;

describe("who is keen", () => {
  it("reaches the team's lead and a captain, with ids", async () => {
    const { captain, kitLead, dee, sam } = await scene();
    for (const viewer of [
      { userId: kitLead.id, rank: "team_lead" as const, ledTeams: ["kitchen"] },
      { userId: captain.id, rank: "captain" as const, ledTeams: [] },
    ]) {
      const view = await getHelpWantedView(viewer);
      expect(shopperOf(view).keen).toEqual([
        { userId: dee.id, name: "Dee Member" },
        { userId: sam.id, name: "Sam Other" },
      ]);
      expect(shopperOf(view).action).toBe("pick");
      expect(view.everyone).not.toBeNull();
    }
  });

  it("does not reach a member or a lead of another team, who see only their own flag", async () => {
    const { strucLead, dee } = await scene();
    const member = await getHelpWantedView({
      userId: dee.id,
      rank: "camp_member",
      ledTeams: [],
    });
    expect(shopperOf(member).keen).toBeNull();
    expect(shopperOf(member).action).toBe("unkeen");
    expect(member.keenCount).toBe(1);
    expect(member.everyone).toBeNull();
    expect(JSON.stringify(member)).not.toContain("Sam Other");

    const other = await getHelpWantedView({
      userId: strucLead.id,
      rank: "team_lead",
      ledTeams: ["structures"],
    });
    expect(shopperOf(other).keen).toBeNull();
    expect(shopperOf(other).action).toBe("keen");
    expect(JSON.stringify(shopperOf(other))).not.toContain("Dee Member");
  });
});

describe("the board", () => {
  it("lists active teams only, the ones that need a lead first", async () => {
    await scene();
    const captain = testStore.allUsers().find((u) => u.rank === "captain")!;
    testStore.setLead({
      userId: testStore.allUsers().find((u) => u.displayName === "Struc Lead")!
        .id,
      team: "structures",
      isLead: false,
    });
    const view = await getHelpWantedView({
      userId: captain.id,
      rank: "captain",
      ledTeams: [],
    });
    expect(view.teams.map((t) => t.key)).toEqual(["structures", "kitchen"]);
    expect(view.summary.teamsNeedingLead).toBe(1);
    expect(view.summary.rolesOpen).toBe(1);
  });

  it("Lead is the lead flag: a captain picks it, the team's lead gets words instead", async () => {
    const { captain, kitLead, dee } = await scene();
    await setLeadPlaces(kitLead.id, { team: "kitchen", places: 2 });
    const lead = await getHelpWantedView({
      userId: kitLead.id,
      rank: "team_lead",
      ledTeams: ["kitchen"],
    });
    // Structures has its one lead; Kitchen wants two and Kit is one of them.
    expect(
      lead.teams.find((t) => t.key === "structures")!.rows[0]!.action,
    ).toBe("full");
    expect(lead.teams.find((t) => t.key === "kitchen")!.rows[0]!.action).toBe(
      "yours",
    );
    const cap = await getHelpWantedView({
      userId: captain.id,
      rank: "captain",
      ledTeams: [],
    });
    expect(cap.teams.find((t) => t.key === "kitchen")!.rows[0]!.action).toBe(
      "pick",
    );
    expect(
      await giveTeamRole(kitLead.id, {
        team: "kitchen",
        roleId: null,
        userId: dee.id,
      }),
    ).toMatchObject({ ok: false });

    expect(
      await giveTeamRole(captain.id, {
        team: "kitchen",
        roleId: null,
        userId: dee.id,
      }),
    ).toEqual({ ok: true, joinedTeam: true });
    expect(testStore.getLeadTeams(dee.id)).toEqual(["kitchen"]);
    const view = await getHelpWantedView({
      userId: captain.id,
      rank: "captain",
      ledTeams: [],
    });
    expect(view.teams.find((t) => t.key === "kitchen")!.leadNames).toEqual([
      "Dee Member",
      "Kit Lead",
    ]);
  });
});
