import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import {
  ALREADY_HAS_LOADS,
  ALREADY_HAS_PLAN,
  DEFAULT_POWER_PLAN,
  LOAD_CHANGED,
  NOT_A_POWER_EDITOR,
  NOTHING_TO_COPY,
  PLAN_CHANGED,
} from "@camp404/db/power";
import type { CampConfig } from "@camp404/db/camp-config";
import { POWER_TEAM } from "@camp404/core";
import { EditLoadInput, LoadInput, type Team } from "@camp404/types";
import { testStore } from "../test-store";

// The E2E power twins. Playwright drives the load list and the fuel page
// through this store, so it must keep the real rules, in the same words:
// these cases mirror packages/db/src/__tests__/power.test.ts (a lead of
// another team is refused, every edit is compare-and-set, loads belong to
// this year, and "copy last year" cannot double the list).

const FRIDGE = LoadInput.parse({
  name: "Chest freezer",
  area: "kitchen",
  category: "refrigeration",
  quantity: 1,
  wattsEach: 150,
  dutyPct: 40,
  schedule: "full_time",
  owner: "camp",
  fromDay: 2,
  toDay: 5,
});

function makeUser(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function lead(name: string, team: Team) {
  const user = makeUser(name);
  testStore.assignTeam({ userId: user.id, team });
  testStore.setLead({ userId: user.id, team, isLead: true });
  return user;
}

/** Put the store's camp in `year`, with the years before it closed. */
function campYear(year: number, earlier: number[] = []) {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [
      ...earlier.map((y) => ({
        year: y,
        startedAt: `${y}-01-01T00:00:00.000Z`,
        endedAt: `${y}-12-31T00:00:00.000Z`,
      })),
      { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
    ],
  };
  testStore.setTeamsConfig(config);
}

function add(actorId: string) {
  const made = testStore.addPowerLoad({ ...FRIDGE, actorId });
  if (!made.ok) throw new Error(made.error);
  return made.id;
}

describe("test store: power", () => {
  beforeEach(() => {
    testStore.reset();
    campYear(2026);
  });

  it("lets a captain and a Power & Lighting lead edit, on this year", () => {
    const captain = makeUser("Cap", "captain");
    const powerLead = lead("Sparky", POWER_TEAM as Team);
    const id = add(captain.id);
    expect(testStore.listPowerLoads()[0]?.cycle).toBe(2026);
    expect(
      testStore.updatePowerLoad({
        ...EditLoadInput.parse({
          ...FRIDGE,
          quantity: 2,
          loadId: id,
          expectedVersion: 1,
        }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: true });
    expect(testStore.listPowerLoads()[0]).toMatchObject({
      quantity: 2,
      version: 2,
    });
  });

  it("refuses a Kitchen lead and a plain member", () => {
    const kitchenLead = lead("Cook", "kitchen");
    const member = makeUser("Mo");
    for (const actor of [kitchenLead, member]) {
      expect(testStore.addPowerLoad({ ...FRIDGE, actorId: actor.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
      expect(
        testStore.setPowerPlan({
          actorId: actor.id,
          patch: { daysOnSite: 9 },
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    }
    expect(testStore.listPowerLoads()).toEqual([]);
    expect(testStore.getPowerPlan().version).toBe(0);
  });

  it("refuses a stale version and leaves the load as it was", () => {
    const captain = makeUser("Cap", "captain");
    const id = add(captain.id);
    const change = (quantity: number) =>
      testStore.updatePowerLoad({
        ...EditLoadInput.parse({
          ...FRIDGE,
          quantity,
          loadId: id,
          expectedVersion: 1,
        }),
        actorId: captain.id,
      });
    expect(change(2)).toEqual({ ok: true });
    expect(change(7)).toEqual({ ok: false, error: LOAD_CHANGED });
    expect(
      testStore.removePowerLoad({
        actorId: captain.id,
        loadId: id,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: LOAD_CHANGED });
    expect(testStore.listPowerLoads()[0]?.quantity).toBe(2);
  });

  it("copies last year's loads once, and has nothing to copy in year one", () => {
    const captain = makeUser("Cap", "captain");
    expect(testStore.copyLastYearLoads({ actorId: captain.id })).toEqual({
      ok: false,
      error: NOTHING_TO_COPY,
    });
    add(captain.id);
    campYear(2027, [2026]);
    expect(testStore.copyLastYearLoads({ actorId: captain.id })).toEqual({
      ok: true,
      count: 1,
    });
    expect(
      testStore.listPowerLoads().map((l) => [l.cycle, l.fromDay, l.toDay]),
    ).toEqual([[2027, 2, 5]]);
    expect(testStore.copyLastYearLoads({ actorId: captain.id })).toEqual({
      ok: false,
      error: ALREADY_HAS_LOADS,
    });
  });

  it("lets only the first of two first plan saves win", () => {
    const captain = makeUser("Cap", "captain");
    expect(testStore.getPowerPlan()).toEqual({
      ...DEFAULT_POWER_PLAN,
      cycle: 2026,
      updatedAt: null,
    });
    const save = (daysOnSite: number) =>
      testStore.setPowerPlan({
        actorId: captain.id,
        patch: { daysOnSite },
        expectedVersion: 0,
      });
    expect(save(8)).toEqual({ ok: true, version: 1 });
    expect(save(10)).toEqual({ ok: false, error: PLAN_CHANGED });
    expect(testStore.getPowerPlan().daysOnSite).toBe(8);
  });

  it("copies last year's plan once, naming the year it came from", () => {
    const captain = makeUser("Cap", "captain");
    expect(testStore.previousPlanCycle()).toBeNull();
    testStore.setPowerPlan({
      actorId: captain.id,
      patch: { daysOnSite: 8, firstPoweredDay: "2026-04-27" },
      expectedVersion: 0,
    });
    campYear(2027, [2026]);
    expect(testStore.previousPlanCycle()).toBe(2026);
    expect(testStore.copyLastYearPlan({ actorId: captain.id })).toEqual({
      ok: true,
      fromCycle: 2026,
    });
    expect(testStore.getPowerPlan()).toMatchObject({
      cycle: 2027,
      daysOnSite: 8,
      firstPoweredDay: null,
      version: 1,
    });
    expect(testStore.copyLastYearPlan({ actorId: captain.id })).toEqual({
      ok: false,
      error: ALREADY_HAS_PLAN,
    });
  });
});
