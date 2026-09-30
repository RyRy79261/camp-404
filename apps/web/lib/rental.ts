import "server-only";

import * as db from "@camp404/db/rental";
import type {
  MyRental,
  RentalItem,
  RentalLine,
  RentalOrder,
  RentalOverview,
  RentalOwnTent,
  RentalResult,
  RentalSharer,
  RentalTent,
  RentalUnanswered,
  SharedTent,
} from "@camp404/db/rental";
import type { RentalOrderStatus } from "@camp404/types";
import { rentalTestStore } from "./test-store-rental";
import { usesTestStore } from "./test-mode";

// Gear rental (#241), from the database or, under E2E, the test store's twin.
// The rules live in @camp404/db/rental and the twin repeats them. A member's
// write takes the signed-in member's id; a captain's write re-checks the actor
// itself, so a caller passes only who is acting, never a rank.

export type {
  MyRental,
  RentalItem,
  RentalLine,
  RentalOrder,
  RentalOverview,
  RentalOwnTent,
  RentalResult,
  RentalSharer,
  RentalTent,
  RentalUnanswered,
  SharedTent,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

const store = () => (usesTestStore() ? rentalTestStore : null);

// --- Reads --------------------------------------------------------------------

export async function listRentalItems(
  cycle: number,
  options: { includeArchived?: boolean } = {},
): Promise<RentalItem[]> {
  return (
    store()?.listRentalItems(cycle, options) ??
    db.listRentalItems(cycle, options)
  );
}

/** The member's own order, the catalogue, and the tents they were put in. */
export async function getMyRental(
  userId: string,
  cycle: number,
): Promise<MyRental> {
  return store()?.getMyRental(userId, cycle) ?? db.getMyRental(userId, cycle);
}

export async function listRentalSharerChoices(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return (
    store()?.listRentalSharerChoices(userId) ??
    db.listRentalSharerChoices(userId)
  );
}

/** Every order, for captains. The page gates; this does not. */
export async function listRentalOrders(cycle: number): Promise<RentalOrder[]> {
  return store()?.listRentalOrders(cycle) ?? db.listRentalOrders(cycle);
}

/** One member's order, for captains. The page gates; this does not. */
export async function getRentalOrderOf(
  userId: string,
  cycle: number,
): Promise<RentalOrder | null> {
  const s = store();
  return s
    ? s.getRentalOrderOf(userId, cycle)
    : db.getRentalOrderOf(userId, cycle);
}

/** The totals and the tents, for captains. The page gates; this does not. */
export async function getRentalOverview(
  cycle: number,
): Promise<RentalOverview> {
  return store()?.getRentalOverview(cycle) ?? db.getRentalOverview(cycle);
}

/** Who is coming and has not sent an order, for captains. The page gates. */
export async function listRentalUnanswered(
  cycle: number,
): Promise<RentalUnanswered[]> {
  return store()?.listRentalUnanswered(cycle) ?? db.listRentalUnanswered(cycle);
}

/** One approved member, for a captain filling in their order. The page gates. */
export async function getRentalMember(
  userId: string,
  cycle: number,
): Promise<Awaited<ReturnType<typeof db.getRentalMember>>> {
  const s = store();
  return s
    ? s.getRentalMember(userId, cycle)
    : db.getRentalMember(userId, cycle);
}

// --- Writes -------------------------------------------------------------------

export async function addRentalItem(
  input: In<typeof db.addRentalItem>,
): Promise<RentalResult<{ id: string }>> {
  return store()?.addRentalItem(input) ?? db.addRentalItem(input);
}

export async function editRentalItem(
  input: In<typeof db.editRentalItem>,
): Promise<RentalResult> {
  return store()?.editRentalItem(input) ?? db.editRentalItem(input);
}

export async function archiveRentalItem(
  input: In<typeof db.archiveRentalItem>,
): Promise<RentalResult> {
  return store()?.archiveRentalItem(input) ?? db.archiveRentalItem(input);
}

export async function saveRentalOrder(
  input: In<typeof db.saveRentalOrder>,
): Promise<RentalResult<{ version: number; status: RentalOrderStatus }>> {
  return store()?.saveRentalOrder(input) ?? db.saveRentalOrder(input);
}

export async function withdrawRentalOrder(
  input: In<typeof db.withdrawRentalOrder>,
): Promise<RentalResult<{ version: number }>> {
  return store()?.withdrawRentalOrder(input) ?? db.withdrawRentalOrder(input);
}

export async function fillRentalOrderFor(
  input: In<typeof db.fillRentalOrderFor>,
): Promise<RentalResult<{ version: number }>> {
  return store()?.fillRentalOrderFor(input) ?? db.fillRentalOrderFor(input);
}

export async function askForGearOrders(
  input: In<typeof db.askForGearOrders>,
): Promise<RentalResult<{ asked: number; notified: number }>> {
  return store()?.askForGearOrders(input) ?? db.askForGearOrders(input);
}

export async function confirmRentalOrder(
  input: In<typeof db.confirmRentalOrder>,
): Promise<RentalResult<{ totalCents: number; chargeId: string | null }>> {
  return store()?.confirmRentalOrder(input) ?? db.confirmRentalOrder(input);
}

export async function reopenRentalOrder(
  input: In<typeof db.reopenRentalOrder>,
): Promise<RentalResult> {
  return store()?.reopenRentalOrder(input) ?? db.reopenRentalOrder(input);
}

export async function setTentLabel(
  input: In<typeof db.setTentLabel>,
): Promise<RentalResult> {
  return store()?.setTentLabel(input) ?? db.setTentLabel(input);
}
