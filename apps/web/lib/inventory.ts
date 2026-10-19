import "server-only";

import * as db from "@camp404/db/inventory";
import type {
  BookableItemRow,
  InventoryBookingRow,
  InventoryItemRow,
  InventoryLoanRow,
  InventoryNeedRow,
  InventoryPledgeRow,
  InventoryUpdateRow,
  InventoryWriteResult,
} from "@camp404/db/inventory";
import { inventoryStore } from "./test-store-inventory";
import { twin } from "./twin";

// Inventory (#246), from the database or, under E2E, the test store's twin.
// Who may edit is one rule (inventoryEditor), and the booking and lending
// checks live once in @camp404/core (bookingProblem, loanProblem);
// lib/__tests__/inventory-agreement.test.ts holds the rest equal. Every write
// re-checks the actor itself (a captain, or a lead of the item's team), so a
// caller passes only who is acting, never their rank or their teams.

export type {
  BookableItemRow,
  InventoryBookingRow,
  InventoryItemRow,
  InventoryLoanRow,
  InventoryNeedRow,
  InventoryPledgeRow,
  InventoryUpdateRow,
  InventoryWriteResult,
};

const inventory = twin(db, inventoryStore, [
  "listInventoryItems",
  "getInventoryItem",
  "listItemUpdates",
  "listPendingProposals",
  "listInventoryNeeds",
  "listBookableItems",
  "listItemBookings",
  "listInventoryLoans",
  "addInventoryItem",
  "updateInventoryItem",
  "archiveInventoryItem",
  "proposeInventoryChange",
  "reviewInventoryChange",
  "addInventoryNeed",
  "updateInventoryNeed",
  "removeInventoryNeed",
  "pledgeToNeed",
  "withdrawPledge",
  "bookInventoryItem",
  "cancelInventoryBooking",
  "lendInventoryItem",
  "returnInventoryLoan",
]);

// --- Reads -------------------------------------------------------------------

export const listInventoryItems = inventory.listInventoryItems;
export const getInventoryItem = inventory.getInventoryItem;
export const listItemUpdates = inventory.listItemUpdates;
export const listPendingProposals = inventory.listPendingProposals;
export const listInventoryNeeds = inventory.listInventoryNeeds;
export const listBookableItems = inventory.listBookableItems;
export const listItemBookings = inventory.listItemBookings;
export const listInventoryLoans = inventory.listInventoryLoans;

// --- Writes ------------------------------------------------------------------

export const addInventoryItem = inventory.addInventoryItem;
export const updateInventoryItem = inventory.updateInventoryItem;
export const archiveInventoryItem = inventory.archiveInventoryItem;
export const proposeInventoryChange = inventory.proposeInventoryChange;
export const reviewInventoryChange = inventory.reviewInventoryChange;
export const addInventoryNeed = inventory.addInventoryNeed;
export const updateInventoryNeed = inventory.updateInventoryNeed;
export const removeInventoryNeed = inventory.removeInventoryNeed;
export const pledgeToNeed = inventory.pledgeToNeed;
export const withdrawPledge = inventory.withdrawPledge;
export const bookInventoryItem = inventory.bookInventoryItem;
export const cancelInventoryBooking = inventory.cancelInventoryBooking;
export const lendInventoryItem = inventory.lendInventoryItem;
export const returnInventoryLoan = inventory.returnInventoryLoan;
