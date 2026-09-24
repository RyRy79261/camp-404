import "server-only";

import * as db from "@camp404/db/power";
import type {
  GeneratorRow,
  PowerInventoryItem,
  PowerLoadRow,
  PowerPlan,
  PowerPlanSettings,
  PowerWriteResult,
} from "@camp404/db/power";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Power and fuel (#253 load list, #254 generators and fuel), from the database
// or, under E2E, the test store. The rules live in @camp404/db/power; the
// store repeats them. Every write re-checks the actor itself (a captain or a
// Power & Lighting lead), so a caller passes only who is acting, never their
// rank or their teams.

export type {
  GeneratorRow,
  PowerInventoryItem,
  PowerLoadRow,
  PowerPlan,
  PowerPlanSettings,
  PowerWriteResult,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Reads -------------------------------------------------------------------

export async function listPowerLoads(cycle?: number): Promise<PowerLoadRow[]> {
  return usesTestStore()
    ? testStore.listPowerLoads(cycle)
    : db.listPowerLoads(cycle);
}

export async function getPowerPlan(cycle?: number): Promise<PowerPlan> {
  return usesTestStore()
    ? testStore.getPowerPlan(cycle)
    : db.getPowerPlan(cycle);
}

export async function listGenerators(): Promise<GeneratorRow[]> {
  return usesTestStore() ? testStore.listGenerators() : db.listGenerators();
}

export async function getGenerator(id: string): Promise<GeneratorRow | null> {
  return usesTestStore() ? testStore.getGenerator(id) : db.getGenerator(id);
}

export async function listPowerInventory(): Promise<PowerInventoryItem[]> {
  return usesTestStore()
    ? testStore.listPowerInventory()
    : db.listPowerInventory();
}

export async function previousLoadCycle(): Promise<number | null> {
  return usesTestStore()
    ? testStore.previousLoadCycle()
    : db.previousLoadCycle();
}

// --- Writes ------------------------------------------------------------------

export async function addPowerLoad(
  input: In<typeof db.addPowerLoad>,
): Promise<PowerWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.addPowerLoad(input)
    : db.addPowerLoad(input);
}

export async function updatePowerLoad(
  input: In<typeof db.updatePowerLoad>,
): Promise<PowerWriteResult> {
  return usesTestStore()
    ? testStore.updatePowerLoad(input)
    : db.updatePowerLoad(input);
}

export async function removePowerLoad(
  input: In<typeof db.removePowerLoad>,
): Promise<PowerWriteResult> {
  return usesTestStore()
    ? testStore.removePowerLoad(input)
    : db.removePowerLoad(input);
}

export async function copyLastYearLoads(
  input: In<typeof db.copyLastYearLoads>,
): Promise<PowerWriteResult<{ count: number }>> {
  return usesTestStore()
    ? testStore.copyLastYearLoads(input)
    : db.copyLastYearLoads(input);
}

export async function setPowerPlan(
  input: In<typeof db.setPowerPlan>,
): Promise<PowerWriteResult<{ version: number }>> {
  return usesTestStore()
    ? testStore.setPowerPlan(input)
    : db.setPowerPlan(input);
}

export async function copyLastYearPlan(
  input: In<typeof db.copyLastYearPlan>,
): Promise<PowerWriteResult<{ fromCycle: number }>> {
  return usesTestStore()
    ? testStore.copyLastYearPlan(input)
    : db.copyLastYearPlan(input);
}

export async function addGenerator(
  input: In<typeof db.addGenerator>,
): Promise<PowerWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.addGenerator(input)
    : db.addGenerator(input);
}

export async function updateGenerator(
  input: In<typeof db.updateGenerator>,
): Promise<PowerWriteResult> {
  return usesTestStore()
    ? testStore.updateGenerator(input)
    : db.updateGenerator(input);
}

export async function archiveGenerator(
  input: In<typeof db.archiveGenerator>,
): Promise<PowerWriteResult> {
  return usesTestStore()
    ? testStore.archiveGenerator(input)
    : db.archiveGenerator(input);
}
