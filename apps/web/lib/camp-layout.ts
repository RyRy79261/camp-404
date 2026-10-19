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
import { testLayoutStore } from "./test-store-layout";
import { twin } from "./twin";

// The camp layout (#271), from the database or, under E2E, the test store's
// twin. Who may save and who may share are one rule each (LAYOUT_EDITOR,
// LAYOUT_SHARER), and the plan's check, its notes and the share token live
// once in @camp404/core; lib/__tests__/camp-layout-agreement.test.ts holds
// the rest equal. Every write re-checks the actor itself (a captain or a
// Structures lead; a captain alone for the neighbour link), so a caller
// passes only who is acting, never their rank or their teams. The neighbour
// page reads through getSharedLayout alone: neighbourView's allowlist and
// arrival counts.

export type {
  ArrivalDayCount,
  CampLayoutState,
  LayoutShare,
  LayoutVersionRow,
  LayoutWriteResult,
  SharedLayout,
};

const layout = twin(db, testLayoutStore, [
  "getCampLayout",
  "listLayoutVersions",
  "previousLayoutCycle",
  "layoutArrivalCounts",
  "getLayoutShare",
  "getSharedLayout",
  "saveCampLayout",
  "restoreLayoutVersion",
  "copyLastYearLayout",
  "shareCampLayout",
  "unshareCampLayout",
]);

// --- Reads -------------------------------------------------------------------

export const getCampLayout = layout.getCampLayout;
export const listLayoutVersions = layout.listLayoutVersions;
export const previousLayoutCycle = layout.previousLayoutCycle;
export const layoutArrivalCounts = layout.layoutArrivalCounts;
/** The neighbour link. Only a captain's page asks for it. */
export const getLayoutShare = layout.getLayoutShare;
/** The neighbour page's whole read: null answers 404. */
export const getSharedLayout = layout.getSharedLayout;

// --- Writes ------------------------------------------------------------------

export const saveCampLayout = layout.saveCampLayout;
export const restoreLayoutVersion = layout.restoreLayoutVersion;
export const copyLastYearLayout = layout.copyLastYearLayout;
export const shareCampLayout = layout.shareCampLayout;
export const unshareCampLayout = layout.unshareCampLayout;
