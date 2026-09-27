import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { NOT_A_POWER_EDITOR } from "@camp404/db/power";
import { GRID_LOOP, GRID_PARENT_END_POINT } from "@camp404/db/power-grid";
import {
  READINESS_TICKED_FIRST,
  WORK_PLAN_ALREADY_ON_BOARD,
} from "@camp404/db/power-readiness";
import {
  ENTRY_ALREADY_CORRECTED,
  NOT_A_CAMP_MEMBER,
  canHoldsOnly,
} from "@camp404/db/power-site";
import type { CampConfig } from "@camp404/db/camp-config";
import { POWER_TEAM, burnRate, effectiveRefuels } from "@camp404/core";
import {
  CorrectRefuelInput,
  EditGridNodeInput,
  GeneratorInput,
  GridNodeInput,
  POWER_WORK_PLAN_TEMPLATE,
  RefuelInput,
  type Team,
} from "@camp404/types";
import { testStore } from "../test-store";

// The E2E twins of power on site (#255–#257). Playwright drives the
// refuelling, grid and readiness pages through this store, so it keeps the
// real rules in the same words: these cases mirror the PGlite suites
// (packages/db/src/__tests__/power-site, power-grid, power-readiness).

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

function campYear(year: number) {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [{ year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null }],
  };
  testStore.setTeamsConfig(config);
}

const NOW = new Date("2026-12-01T00:00:00Z");

describe("test store: power on site", () => {
  let powerLead: { id: string };
  let kitchenLead: { id: string };
  let watcher: { id: string };
  let generatorId: string;

  beforeEach(() => {
    testStore.reset();
    campYear(2026);
    powerLead = lead("Pat", POWER_TEAM as Team);
    kitchenLead = lead("Kit", "kitchen");
    watcher = makeUser("Sam");
    testStore.setUserApprovalStatus(watcher.id, "approved");
    const gen = testStore.addGenerator({
      ...GeneratorInput.parse({
        model: "Test 5.5",
        ratedKva: 5.5,
        maxKva: 6,
        tankLitres: 13.5,
        runtime50Hours: 9.8,
        runtime100Hours: 5.5,
        fuelType: "petrol",
        owner: "camp",
      }),
      actorId: powerLead.id,
    });
    if (!gen.ok) throw new Error(gen.error);
    generatorId = gen.id;
  });

  const refuel = (at: string, litres: number, fromCanId: string | null) =>
    RefuelInput.parse({
      generatorId,
      refuelledAt: at,
      litres,
      fromCanId,
      doneByUserId: watcher.id,
    });

  it("refuses a Kitchen lead, and takes a refuelling out of its can", () => {
    expect(
      testStore.addFuelCans({
        count: 2,
        capacityLitres: 20,
        litres: 20,
        location: "storage",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    testStore.addFuelCans({
      count: 2,
      capacityLitres: 20,
      litres: 20,
      location: "storage",
      actorId: powerLead.id,
    });
    const [can] = testStore.listFuelCans();
    expect(
      testStore.logRefuel({
        ...refuel("2026-04-25T06:00", 25, can!.id),
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: canHoldsOnly(20) });
    for (const at of ["2026-04-25T06:00", "2026-04-25T12:00"]) {
      const r = testStore.logRefuel({
        ...refuel(at, 10, can!.id),
        actorId: powerLead.id,
        now: NOW,
      });
      expect(r.ok).toBe(true);
    }
    expect(testStore.listFuelCans().map((c) => c.litres)).toEqual([0, 20]);
    expect(burnRate(testStore.listRefuelEntries())?.litresPerDay).toBe(40);
  });

  it("refuses a doer who is not an approved member", () => {
    expect(
      testStore.logRefuel({
        ...refuel("2026-04-25T06:00", 5, null),
        doneByUserId: "nobody",
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: NOT_A_CAMP_MEMBER });
  });

  it("replaces an entry once, putting its litres back first", () => {
    testStore.addFuelCans({
      count: 1,
      capacityLitres: 20,
      litres: 20,
      location: "on_site",
      actorId: powerLead.id,
    });
    const [can] = testStore.listFuelCans();
    const first = testStore.logRefuel({
      ...refuel("2026-04-25T06:00", 20, can!.id),
      actorId: powerLead.id,
      now: NOW,
    });
    if (!first.ok) throw new Error(first.error);
    const fix = CorrectRefuelInput.parse({
      ...refuel("2026-04-25T06:00", 15, can!.id),
      correctsEntryId: first.id,
    });
    expect(
      testStore.correctRefuel({ ...fix, actorId: powerLead.id, now: NOW }).ok,
    ).toBe(true);
    expect(testStore.listFuelCans()[0]!.litres).toBe(5);
    expect(
      testStore.correctRefuel({ ...fix, actorId: powerLead.id, now: NOW }),
    ).toEqual({ ok: false, error: ENTRY_ALREADY_CORRECTED });
    expect(
      effectiveRefuels(testStore.listRefuelEntries()).map((e) => e.litres),
    ).toEqual([15]);
  });

  it("keeps the grid a tree", () => {
    const add = (fields: Record<string, unknown>) => {
      const made = testStore.addGridNode({
        ...GridNodeInput.parse(fields),
        actorId: powerLead.id,
      });
      if (!made.ok) throw new Error(made.error);
      return made.id;
    };
    const gen = add({ name: "Genny", kind: "generator" });
    const main = add({ name: "Main", kind: "junction", parentId: gen });
    const kitchen = add({ name: "Kitchen", kind: "end_point", parentId: main });
    expect(
      testStore.updateGridNode({
        ...EditGridNodeInput.parse({
          nodeId: main,
          expectedVersion: 1,
          name: "Main",
          kind: "junction",
          parentId: kitchen,
        }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: GRID_PARENT_END_POINT });
    const right = add({ name: "Right", kind: "junction", parentId: main });
    expect(
      testStore.updateGridNode({
        ...EditGridNodeInput.parse({
          nodeId: main,
          expectedVersion: 1,
          name: "Main",
          kind: "junction",
          parentId: right,
        }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: GRID_LOOP });
  });

  it("ticks against the state seen, and puts the work plan on the board once", () => {
    testStore.startReadinessChecklist({ actorId: powerLead.id, generatorId });
    const [item] = testStore.listReadinessItems();
    expect(
      testStore.tickReadinessItem({
        actorId: powerLead.id,
        itemId: item!.id,
        done: true,
      }),
    ).toEqual({ ok: true });
    expect(
      testStore.tickReadinessItem({
        actorId: powerLead.id,
        itemId: item!.id,
        done: true,
      }),
    ).toEqual({ ok: false, error: READINESS_TICKED_FIRST });

    expect(testStore.addWorkPlanToBoard({ actorId: powerLead.id })).toEqual({
      ok: true,
      count: POWER_WORK_PLAN_TEMPLATE.length,
      fromCycle: null,
    });
    expect(testStore.addWorkPlanToBoard({ actorId: powerLead.id })).toEqual({
      ok: false,
      error: WORK_PLAN_ALREADY_ON_BOARD,
    });
    expect(
      testStore.listBoardTasks(new Date()).filter((t) => t.team === POWER_TEAM),
    ).toHaveLength(POWER_WORK_PLAN_TEMPLATE.length);
  });
});
