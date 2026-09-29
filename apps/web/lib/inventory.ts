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
import { usesTestStore } from "./test-mode";
import { inventoryStore as store } from "./test-store-inventory";

// Inventory (#246), from the database or, under E2E, the test store's twin.
// The rules live in @camp404/db/inventory; the twin repeats them. Every write
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

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Reads -------------------------------------------------------------------

export async function listInventoryItems(): Promise<InventoryItemRow[]> {
  return usesTestStore() ? store.listInventoryItems() : db.listInventoryItems();
}

export async function getInventoryItem(
  itemId: string,
): Promise<InventoryItemRow | null> {
  return usesTestStore()
    ? store.getInventoryItem(itemId)
    : db.getInventoryItem(itemId);
}

export async function listItemUpdates(
  itemId: string,
): Promise<InventoryUpdateRow[]> {
  return usesTestStore()
    ? store.listItemUpdates(itemId)
    : db.listItemUpdates(itemId);
}

export async function listPendingProposals(): Promise<InventoryUpdateRow[]> {
  return usesTestStore()
    ? store.listPendingProposals()
    : db.listPendingProposals();
}

export async function listInventoryNeeds(): Promise<InventoryNeedRow[]> {
  return usesTestStore() ? store.listInventoryNeeds() : db.listInventoryNeeds();
}

export async function listBookableItems(
  viewerId: string,
): Promise<BookableItemRow[]> {
  return usesTestStore()
    ? store.listBookableItems(viewerId)
    : db.listBookableItems(viewerId);
}

export async function listItemBookings(
  itemId: string,
  viewerId: string,
  withNames: boolean,
): Promise<InventoryBookingRow[]> {
  return usesTestStore()
    ? store.listItemBookings(itemId, viewerId, withNames)
    : db.listItemBookings(itemId, viewerId, withNames);
}

export async function listInventoryLoans(
  itemId?: string,
): Promise<InventoryLoanRow[]> {
  return usesTestStore()
    ? store.listInventoryLoans(itemId)
    : db.listInventoryLoans(itemId);
}

// --- Writes ------------------------------------------------------------------

export async function addInventoryItem(
  input: In<typeof db.addInventoryItem>,
): Promise<InventoryWriteResult<{ id: string }>> {
  return usesTestStore()
    ? store.addInventoryItem(input)
    : db.addInventoryItem(input);
}

export async function updateInventoryItem(
  input: In<typeof db.updateInventoryItem>,
): Promise<InventoryWriteResult<{ version: number }>> {
  return usesTestStore()
    ? store.updateInventoryItem(input)
    : db.updateInventoryItem(input);
}

export async function archiveInventoryItem(
  input: In<typeof db.archiveInventoryItem>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.archiveInventoryItem(input)
    : db.archiveInventoryItem(input);
}

export async function proposeInventoryChange(
  input: In<typeof db.proposeInventoryChange>,
): Promise<InventoryWriteResult<{ id: string }>> {
  return usesTestStore()
    ? store.proposeInventoryChange(input)
    : db.proposeInventoryChange(input);
}

export async function reviewInventoryChange(
  input: In<typeof db.reviewInventoryChange>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.reviewInventoryChange(input)
    : db.reviewInventoryChange(input);
}

export async function addInventoryNeed(
  input: In<typeof db.addInventoryNeed>,
): Promise<InventoryWriteResult<{ id: string }>> {
  return usesTestStore()
    ? store.addInventoryNeed(input)
    : db.addInventoryNeed(input);
}

export async function updateInventoryNeed(
  input: In<typeof db.updateInventoryNeed>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.updateInventoryNeed(input)
    : db.updateInventoryNeed(input);
}

export async function removeInventoryNeed(
  input: In<typeof db.removeInventoryNeed>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.removeInventoryNeed(input)
    : db.removeInventoryNeed(input);
}

export async function pledgeToNeed(
  input: In<typeof db.pledgeToNeed>,
): Promise<InventoryWriteResult> {
  return usesTestStore() ? store.pledgeToNeed(input) : db.pledgeToNeed(input);
}

export async function withdrawPledge(
  input: In<typeof db.withdrawPledge>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.withdrawPledge(input)
    : db.withdrawPledge(input);
}

export async function bookInventoryItem(
  input: In<typeof db.bookInventoryItem>,
): Promise<InventoryWriteResult<{ id: string }>> {
  return usesTestStore()
    ? store.bookInventoryItem(input)
    : db.bookInventoryItem(input);
}

export async function cancelInventoryBooking(
  input: In<typeof db.cancelInventoryBooking>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.cancelInventoryBooking(input)
    : db.cancelInventoryBooking(input);
}

export async function lendInventoryItem(
  input: In<typeof db.lendInventoryItem>,
): Promise<InventoryWriteResult<{ id: string }>> {
  return usesTestStore()
    ? store.lendInventoryItem(input)
    : db.lendInventoryItem(input);
}

export async function returnInventoryLoan(
  input: In<typeof db.returnInventoryLoan>,
): Promise<InventoryWriteResult> {
  return usesTestStore()
    ? store.returnInventoryLoan(input)
    : db.returnInventoryLoan(input);
}
