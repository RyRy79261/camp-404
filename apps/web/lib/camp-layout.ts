import "server-only";

import type { ArrivalDayCount } from "@camp404/core";
import * as db from "@camp404/db/camp-layout";
import type {
  CampLayoutState,
  LayoutShare,
  LayoutVersionRow,
  LayoutWriteResult,
  SharedLayout,
} from "@camp404/db/camp-layout";
import { usesTestStore } from "./test-mode";
import { testLayoutStore } from "./test-store-layout";

// The camp layout (#271), from the database or, under E2E, the test store's
// twin. The rules live in @camp404/db/camp-layout; the twin repeats them.
// Every write re-checks the actor itself (a captain or a Structures lead; a
// captain alone for the neighbour link), so a caller passes only who is
// acting, never their rank or their teams.

export type {
  ArrivalDayCount,
  CampLayoutState,
  LayoutShare,
  LayoutVersionRow,
  LayoutWriteResult,
  SharedLayout,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Reads -------------------------------------------------------------------

export async function getCampLayout(
  cycle?: number,
  versionNumber?: number,
): Promise<CampLayoutState> {
  return usesTestStore()
    ? testLayoutStore.getCampLayout(cycle, versionNumber)
    : db.getCampLayout(cycle, versionNumber);
}

export async function listLayoutVersions(
  cycle?: number,
): Promise<LayoutVersionRow[]> {
  return usesTestStore()
    ? testLayoutStore.listLayoutVersions(cycle)
    : db.listLayoutVersions(cycle);
}

export async function previousLayoutCycle(): Promise<number | null> {
  return usesTestStore()
    ? testLayoutStore.previousLayoutCycle()
    : db.previousLayoutCycle();
}

export async function layoutArrivalCounts(
  cycle?: number,
): Promise<ArrivalDayCount[]> {
  return usesTestStore()
    ? testLayoutStore.layoutArrivalCounts(cycle)
    : db.layoutArrivalCounts(cycle);
}

/** The neighbour link. Only a captain's page asks for it. */
export async function getLayoutShare(cycle?: number): Promise<LayoutShare> {
  return usesTestStore()
    ? testLayoutStore.getLayoutShare(cycle)
    : db.getLayoutShare(cycle);
}

/** The neighbour page's whole read: null answers 404. */
export async function getSharedLayout(
  token: string,
): Promise<SharedLayout | null> {
  return usesTestStore()
    ? testLayoutStore.getSharedLayout(token)
    : db.getSharedLayout(token);
}

// --- Writes ------------------------------------------------------------------

export async function saveCampLayout(
  input: In<typeof db.saveCampLayout>,
): Promise<LayoutWriteResult<{ version: number }>> {
  return usesTestStore()
    ? testLayoutStore.saveCampLayout(input)
    : db.saveCampLayout(input);
}

export async function restoreLayoutVersion(
  input: In<typeof db.restoreLayoutVersion>,
): Promise<LayoutWriteResult<{ version: number }>> {
  return usesTestStore()
    ? testLayoutStore.restoreLayoutVersion(input)
    : db.restoreLayoutVersion(input);
}

export async function copyLastYearLayout(
  input: In<typeof db.copyLastYearLayout>,
): Promise<LayoutWriteResult<{ version: number; fromCycle: number }>> {
  return usesTestStore()
    ? testLayoutStore.copyLastYearLayout(input)
    : db.copyLastYearLayout(input);
}

export async function shareCampLayout(
  input: In<typeof db.shareCampLayout>,
): Promise<LayoutWriteResult<{ token: string }>> {
  return usesTestStore()
    ? testLayoutStore.shareCampLayout(input)
    : db.shareCampLayout(input);
}

export async function unshareCampLayout(
  input: In<typeof db.unshareCampLayout>,
): Promise<LayoutWriteResult<{ changed: boolean }>> {
  return usesTestStore()
    ? testLayoutStore.unshareCampLayout(input)
    : db.unshareCampLayout(input);
}
