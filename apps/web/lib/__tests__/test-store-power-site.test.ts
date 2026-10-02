import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { NOT_A_POWER_EDITOR } from "@camp404/db/power";
import { GRID_LOOP, GRID_PARENT_END_POINT } from "@camp404/db/power-grid";
import {
  READINESS_TICKED_FIRST,
  WORK_PLAN_ALREADY_ON_BOARD,
} from "@camp404/db/power-readiness";
import { CAN_CAR_GONE, CAN_CHANGED } from "@camp404/db/power-site";
import type { CampConfig } from "@camp404/db/camp-config";
import { POWER_TEAM, fillingCar } from "@camp404/core";
import {
  EditGridNodeInput,
  FuelCanInput,
  GeneratorInput,
  GridNodeInput,
  POWER_WORK_PLAN_TEMPLATE,
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

  /** A driver this year, as the driver form leaves them. */
  function driver(name: string) {
    const user = makeUser(name);
    testStore.setUserApprovalStatus(user.id, "approved");
    testStore.seedDriverProfile({ userId: user.id, vehicleMake: "Toyota" });
    return user;
  }

  const can = (over: Partial<FuelCanInput> = {}) =>
    FuelCanInput.parse({
      ownerUserId: null,
      sizeLitres: 20,
      material: "plastic",
      travelsWithUserId: null,
      ...over,
    });

  it("lets a Power lead add a can on a car and refuses a Kitchen lead", () => {
    const dana = driver("Dana");
    expect(testStore.addFuelCan({ ...can(), actorId: kitchenLead.id })).toEqual(
      { ok: false, error: NOT_A_POWER_EDITOR },
    );
    expect(
      testStore.addFuelCan({
        ...can({ ownerUserId: watcher.id, travelsWithUserId: dana.id }),
        actorId: powerLead.id,
      }),
    ).toMatchObject({ ok: true, number: 1 });
    const [row] = testStore.listFuelCans();
    expect(row).toMatchObject({
      ownerName: "Sam",
      travelsWithUserId: dana.id,
      sizeLitres: 20,
    });
    // The car's driver fills it: derived, never stored.
    const { cars } = testStore.getTransportBoard();
    expect(fillingCar(row!, cars)?.driverName).toBe("Dana");
  });

  it("refuses a car not driving this year and a stale version, like the db", () => {
    const notDriving = makeUser("Nod");
    expect(
      testStore.addFuelCan({
        ...can({ travelsWithUserId: notDriving.id }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: CAN_CAR_GONE });
    const made = testStore.addFuelCan({ ...can(), actorId: powerLead.id });
    if (!made.ok) throw new Error(made.error);
    const edit = {
      ...can({ material: "metal" }),
      canId: made.id,
      expectedVersion: 1,
      actorId: powerLead.id,
    };
    expect(testStore.updateFuelCan(edit)).toEqual({ ok: true });
    expect(testStore.updateFuelCan(edit)).toEqual({
      ok: false,
      error: CAN_CHANGED,
    });
    expect(
      testStore.removeFuelCan({
        canId: made.id,
        expectedVersion: 2,
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: true });
    expect(testStore.listFuelCans()).toEqual([]);
  });

  it("drops a car from a can when its driver stops driving", () => {
    const dana = driver("Dana");
    testStore.addFuelCan({
      ...can({ travelsWithUserId: dana.id }),
      actorId: powerLead.id,
    });
    testStore.seedDriverProfile({ userId: dana.id, intendsToDrive: false });
    expect(testStore.listFuelCans()[0]!.travelsWithUserId).toBeNull();
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
