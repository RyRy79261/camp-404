import "server-only";

import * as grid from "@camp404/db/power-grid";
import * as readiness from "@camp404/db/power-readiness";
import * as site from "@camp404/db/power-site";
import type { GridNodeRow } from "@camp404/db/power-grid";
import type {
  ReadinessItemRow,
  SharingAgreement,
  WorkPlanTaskRow,
} from "@camp404/db/power-readiness";
import type { FuelCanRow } from "@camp404/db/power-site";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Power on site and before it (#255 the fuel can register, #256 the
// grid plan, #257 readiness, the work plan and sharing), from the database or,
// under E2E, the test store, picked once per module (twin). The rules live in
// @camp404/db; the store repeats them, and
// lib/__tests__/power-site-agreement.test.ts holds the two sides equal. Every write re-checks the actor itself (a captain or a Power &
// Lighting lead), so a caller passes only who is acting.

export type {
  FuelCanRow,
  GridNodeRow,
  ReadinessItemRow,
  SharingAgreement,
  WorkPlanTaskRow,
};

const siteTwin = twin(site, testStore, [
  "listFuelCans",
  "addFuelCan",
  "updateFuelCan",
  "removeFuelCan",
]);
const gridTwin = twin(grid, testStore, [
  "listGridNodes",
  "listLoadGridPoints",
  "previousGridCycle",
  "addGridNode",
  "updateGridNode",
  "removeGridNode",
  "assignLoadToGridNode",
  "copyLastYearGrid",
]);
const readinessTwin = twin(readiness, testStore, [
  "listReadinessItems",
  "startReadinessChecklist",
  "addReadinessItem",
  "updateReadinessItem",
  "tickReadinessItem",
  "removeReadinessItem",
  "listWorkPlanTasks",
  "previousWorkPlanCycle",
  "addWorkPlanToBoard",
  "getSharingAgreement",
  "saveSharingAgreement",
  "removeSharingAgreement",
]);

// --- The fuel can register (#255) -----------------------------------------

export const listFuelCans = siteTwin.listFuelCans;

export const addFuelCan = siteTwin.addFuelCan;

export const updateFuelCan = siteTwin.updateFuelCan;

export const removeFuelCan = siteTwin.removeFuelCan;

// --- The grid plan (#256) --------------------------------------------------

export const listGridNodes = gridTwin.listGridNodes;

export const listLoadGridPoints = gridTwin.listLoadGridPoints;

export const previousGridCycle = gridTwin.previousGridCycle;

export const addGridNode = gridTwin.addGridNode;

export const updateGridNode = gridTwin.updateGridNode;

export const removeGridNode = gridTwin.removeGridNode;

export const assignLoadToGridNode = gridTwin.assignLoadToGridNode;

export const copyLastYearGrid = gridTwin.copyLastYearGrid;

// --- Readiness, the work plan and sharing (#257) ---------------------------

export const listReadinessItems = readinessTwin.listReadinessItems;

export const startReadinessChecklist = readinessTwin.startReadinessChecklist;

export const addReadinessItem = readinessTwin.addReadinessItem;

export const updateReadinessItem = readinessTwin.updateReadinessItem;

export const tickReadinessItem = readinessTwin.tickReadinessItem;

export const removeReadinessItem = readinessTwin.removeReadinessItem;

export const listWorkPlanTasks = readinessTwin.listWorkPlanTasks;

export const previousWorkPlanCycle = readinessTwin.previousWorkPlanCycle;

export const addWorkPlanToBoard = readinessTwin.addWorkPlanToBoard;

export const getSharingAgreement = readinessTwin.getSharingAgreement;

export const saveSharingAgreement = readinessTwin.saveSharingAgreement;

export const removeSharingAgreement = readinessTwin.removeSharingAgreement;
