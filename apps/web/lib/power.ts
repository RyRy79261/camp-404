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
import { testStore } from "./test-store";
import { twin } from "./twin";

// Power and fuel (#253 load list, #254 generators and fuel), from the database
// or, under E2E, the test store's twin. The plan's generator check, the plan's
// settings and the copy refusals live once in @camp404/core
// (planGeneratorProblem, powerPlanPatch, copyLastYearProblem);
// lib/__tests__/power-agreement.test.ts holds the rest equal. Every write re-checks the actor itself (a captain or a
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

const power = twin(db, testStore, [
  "listPowerLoads",
  "getPowerPlan",
  "listGenerators",
  "getGenerator",
  "listPowerInventory",
  "previousLoadCycle",
  "previousPlanCycle",
  "addPowerLoad",
  "updatePowerLoad",
  "removePowerLoad",
  "copyLastYearLoads",
  "setPowerPlan",
  "copyLastYearPlan",
  "addGenerator",
  "updateGenerator",
  "archiveGenerator",
]);

// --- Reads -------------------------------------------------------------------

export const listPowerLoads = power.listPowerLoads;
export const getPowerPlan = power.getPowerPlan;
export const listGenerators = power.listGenerators;
export const getGenerator = power.getGenerator;
export const listPowerInventory = power.listPowerInventory;
export const previousLoadCycle = power.previousLoadCycle;
export const previousPlanCycle = power.previousPlanCycle;

// --- Writes ------------------------------------------------------------------

export const addPowerLoad = power.addPowerLoad;
export const updatePowerLoad = power.updatePowerLoad;
export const removePowerLoad = power.removePowerLoad;
export const copyLastYearLoads = power.copyLastYearLoads;
export const setPowerPlan = power.setPowerPlan;
export const copyLastYearPlan = power.copyLastYearPlan;
export const addGenerator = power.addGenerator;
export const updateGenerator = power.updateGenerator;
export const archiveGenerator = power.archiveGenerator;
