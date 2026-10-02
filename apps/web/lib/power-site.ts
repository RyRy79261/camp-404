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
import type { PowerWriteResult } from "@camp404/db/power";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Power on site and before it (#255 the fuel can register, #256 the
// grid plan, #257 readiness, the work plan and sharing), from the database or,
// under E2E, the test store. The rules live in @camp404/db; the store repeats
// them. Every write re-checks the actor itself (a captain or a Power &
// Lighting lead), so a caller passes only who is acting.

export type {
  FuelCanRow,
  GridNodeRow,
  ReadinessItemRow,
  SharingAgreement,
  WorkPlanTaskRow,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];
type Out<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

const store = () => usesTestStore();

// --- The fuel can register (#255) -----------------------------------------

export async function listFuelCans(cycle?: number): Promise<FuelCanRow[]> {
  return store() ? testStore.listFuelCans(cycle) : site.listFuelCans(cycle);
}

export async function addFuelCan(
  input: In<typeof site.addFuelCan>,
): Promise<Out<typeof site.addFuelCan>> {
  return store() ? testStore.addFuelCan(input) : site.addFuelCan(input);
}

export async function updateFuelCan(
  input: In<typeof site.updateFuelCan>,
): Promise<PowerWriteResult> {
  return store() ? testStore.updateFuelCan(input) : site.updateFuelCan(input);
}

export async function removeFuelCan(
  input: In<typeof site.removeFuelCan>,
): Promise<PowerWriteResult> {
  return store() ? testStore.removeFuelCan(input) : site.removeFuelCan(input);
}

// --- The grid plan (#256) --------------------------------------------------

export async function listGridNodes(cycle?: number): Promise<GridNodeRow[]> {
  return store() ? testStore.listGridNodes(cycle) : grid.listGridNodes(cycle);
}

export async function listLoadGridPoints(
  cycle?: number,
): Promise<Record<string, string>> {
  return store()
    ? testStore.listLoadGridPoints(cycle)
    : grid.listLoadGridPoints(cycle);
}

export async function previousGridCycle(): Promise<number | null> {
  return store() ? testStore.previousGridCycle() : grid.previousGridCycle();
}

export async function addGridNode(
  input: In<typeof grid.addGridNode>,
): Promise<Out<typeof grid.addGridNode>> {
  return store() ? testStore.addGridNode(input) : grid.addGridNode(input);
}

export async function updateGridNode(
  input: In<typeof grid.updateGridNode>,
): Promise<PowerWriteResult> {
  return store() ? testStore.updateGridNode(input) : grid.updateGridNode(input);
}

export async function removeGridNode(
  input: In<typeof grid.removeGridNode>,
): Promise<PowerWriteResult> {
  return store() ? testStore.removeGridNode(input) : grid.removeGridNode(input);
}

export async function assignLoadToGridNode(
  input: In<typeof grid.assignLoadToGridNode>,
): Promise<PowerWriteResult> {
  return store()
    ? testStore.assignLoadToGridNode(input)
    : grid.assignLoadToGridNode(input);
}

export async function copyLastYearGrid(
  input: In<typeof grid.copyLastYearGrid>,
): Promise<Out<typeof grid.copyLastYearGrid>> {
  return store()
    ? testStore.copyLastYearGrid(input)
    : grid.copyLastYearGrid(input);
}

// --- Readiness, the work plan and sharing (#257) ---------------------------

export async function listReadinessItems(
  cycle?: number,
): Promise<ReadinessItemRow[]> {
  return store()
    ? testStore.listReadinessItems(cycle)
    : readiness.listReadinessItems(cycle);
}

export async function startReadinessChecklist(
  input: In<typeof readiness.startReadinessChecklist>,
): Promise<Out<typeof readiness.startReadinessChecklist>> {
  return store()
    ? testStore.startReadinessChecklist(input)
    : readiness.startReadinessChecklist(input);
}

export async function addReadinessItem(
  input: In<typeof readiness.addReadinessItem>,
): Promise<Out<typeof readiness.addReadinessItem>> {
  return store()
    ? testStore.addReadinessItem(input)
    : readiness.addReadinessItem(input);
}

export async function updateReadinessItem(
  input: In<typeof readiness.updateReadinessItem>,
): Promise<PowerWriteResult> {
  return store()
    ? testStore.updateReadinessItem(input)
    : readiness.updateReadinessItem(input);
}

export async function tickReadinessItem(
  input: In<typeof readiness.tickReadinessItem>,
): Promise<PowerWriteResult> {
  return store()
    ? testStore.tickReadinessItem(input)
    : readiness.tickReadinessItem(input);
}

export async function removeReadinessItem(
  input: In<typeof readiness.removeReadinessItem>,
): Promise<PowerWriteResult> {
  return store()
    ? testStore.removeReadinessItem(input)
    : readiness.removeReadinessItem(input);
}

export async function listWorkPlanTasks(
  cycle?: number,
): Promise<WorkPlanTaskRow[]> {
  return store()
    ? testStore.listWorkPlanTasks(cycle)
    : readiness.listWorkPlanTasks(cycle);
}

export async function previousWorkPlanCycle(): Promise<number | null> {
  return store()
    ? testStore.previousWorkPlanCycle()
    : readiness.previousWorkPlanCycle();
}

export async function addWorkPlanToBoard(
  input: In<typeof readiness.addWorkPlanToBoard>,
): Promise<Out<typeof readiness.addWorkPlanToBoard>> {
  return store()
    ? testStore.addWorkPlanToBoard(input)
    : readiness.addWorkPlanToBoard(input);
}

export async function getSharingAgreement(
  cycle?: number,
): Promise<SharingAgreement | null> {
  return store()
    ? testStore.getSharingAgreement(cycle)
    : readiness.getSharingAgreement(cycle);
}

export async function saveSharingAgreement(
  input: In<typeof readiness.saveSharingAgreement>,
): Promise<Out<typeof readiness.saveSharingAgreement>> {
  return store()
    ? testStore.saveSharingAgreement(input)
    : readiness.saveSharingAgreement(input);
}

export async function removeSharingAgreement(
  input: In<typeof readiness.removeSharingAgreement>,
): Promise<PowerWriteResult> {
  return store()
    ? testStore.removeSharingAgreement(input)
    : readiness.removeSharingAgreement(input);
}
