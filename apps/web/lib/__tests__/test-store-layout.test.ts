import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALREADY_HAS_LAYOUT,
  LAYOUT_CHANGED,
  NOT_A_LAYOUT_EDITOR,
  NOT_A_LAYOUT_SHARER,
  NOTHING_TO_SHARE,
} from "@camp404/db/camp-layout";
import type { CampConfig } from "@camp404/db/camp-config";
import { LAYOUT_TEAM, emptyLayout, newPiece } from "@camp404/core";
import type { Team } from "@camp404/types";
import { testStore } from "../test-store";
import { testLayoutStore } from "../test-store-layout";

// The E2E layout twin. Playwright drives the layout page and the neighbour
// page through it, so it must keep the real rules, in the same words: these
// cases mirror packages/db/src/__tests__/camp-layout.test.ts.

function user(authId: string, displayName: string, rank?: "captain") {
  return testStore.createUser({
    authUserId: `auth-${authId}`,
    displayName,
    inviteCode: "seeded",
    rank: rank ?? "member",
  });
}

function plan() {
  const layout = emptyLayout();
  return {
    ...layout,
    pieces: [
      { ...newPiece("tent", "p-1", layout.plot), label: "Thandi's tent" },
    ],
  };
}

beforeEach(() => {
  testStore.reset();
  testLayoutStore.reset();
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [
      {
        year: 2026,
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-12-31T00:00:00.000Z",
      },
      { year: 2027, startedAt: "2027-01-01T00:00:00.000Z", endedAt: null },
    ],
  };
  testStore.setTeamsConfig(config);
});

function people() {
  const captain = user("cap", "Cap", "captain");
  const lead = user("lead", "Sipho Lead");
  testStore.assignTeam({ userId: lead.id, team: LAYOUT_TEAM as Team });
  testStore.setLead({
    userId: lead.id,
    team: LAYOUT_TEAM as Team,
    isLead: true,
  });
  const kitchen = user("kit", "Kit Lead");
  testStore.assignTeam({ userId: kitchen.id, team: "kitchen" });
  testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: true });
  const member = user("mem", "Thandi Member");
  return { captain, lead, kitchen, member };
}

describe("the layout twin", () => {
  it("lets a Structures lead save and refuses a Kitchen lead and a member", () => {
    const { lead, kitchen, member } = people();
    for (const actor of [kitchen, member]) {
      expect(
        testLayoutStore.saveCampLayout({
          actorId: actor.id,
          layout: plan(),
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_LAYOUT_EDITOR });
    }
    expect(
      testLayoutStore.saveCampLayout({
        actorId: lead.id,
        layout: plan(),
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(
      testLayoutStore.saveCampLayout({
        actorId: lead.id,
        layout: emptyLayout(),
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: LAYOUT_CHANGED });
    expect(testLayoutStore.getCampLayout()).toMatchObject({
      cycle: 2027,
      version: 1,
      savedByName: "Sipho Lead",
    });
  });

  it("copies last year's plan only into an empty year", () => {
    const { captain } = people();
    testLayoutStore.seedLayout(2026, plan());
    expect(testLayoutStore.copyLastYearLayout({ actorId: captain.id })).toEqual(
      { ok: true, version: 1, fromCycle: 2026 },
    );
    expect(testLayoutStore.copyLastYearLayout({ actorId: captain.id })).toEqual(
      { ok: false, error: ALREADY_HAS_LAYOUT },
    );
  });

  it("shares for a captain only, without labels or names, and a revoked link reads as nothing", () => {
    const { captain, lead, member } = people();
    expect(testLayoutStore.shareCampLayout({ actorId: captain.id })).toEqual({
      ok: false,
      error: NOTHING_TO_SHARE,
    });
    testLayoutStore.saveCampLayout({
      actorId: lead.id,
      layout: plan(),
      expectedVersion: 0,
    });
    expect(testLayoutStore.shareCampLayout({ actorId: lead.id })).toEqual({
      ok: false,
      error: NOT_A_LAYOUT_SHARER,
    });
    testStore.seedDriverProfile({
      userId: member.id,
      arrivalAt: new Date("2027-04-26T00:00:00.000Z"),
    });
    const shared = testLayoutStore.shareCampLayout({ actorId: captain.id });
    if (!shared.ok) throw new Error(shared.error);
    const page = testLayoutStore.getSharedLayout(shared.token);
    expect(page?.layout?.pieces).toEqual([
      expect.objectContaining({ kind: "tent" }),
    ]);
    expect(page?.arrivals).toEqual([{ day: "2027-04-26", count: 1 }]);
    expect(JSON.stringify(page)).not.toMatch(/Thandi|Sipho/);

    expect(testLayoutStore.unshareCampLayout({ actorId: captain.id })).toEqual({
      ok: true,
      changed: true,
    });
    expect(testLayoutStore.getSharedLayout(shared.token)).toBeNull();
  });
});
