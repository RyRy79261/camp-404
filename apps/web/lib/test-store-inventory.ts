import { randomUUID } from "node:crypto";
import {
  bookableNow,
  canEditInventory,
  nextMaintenanceDue,
} from "@camp404/core";
import {
  ALREADY_BOOKED,
  BOOKING_GONE,
  CUSTODIAN_UNKNOWN,
  FULLY_BOOKED,
  ITEM_BROKEN,
  ITEM_CHANGED,
  ITEM_GONE,
  LOAN_GONE,
  LOAN_RETURNED,
  LOAN_TOO_MANY,
  NEED_CHANGED,
  NEED_GONE,
  NONE_FREE,
  NOT_AN_INVENTORY_EDITOR,
  NOT_BOOKABLE,
  NOT_YOUR_BOOKING,
  PROPOSAL_DECIDED,
  PROPOSAL_GONE,
  type BookableItemRow,
  type InventoryBookingRow,
  type InventoryItemRow,
  type InventoryLoanRow,
  type InventoryNeedRow,
  type InventoryUpdateRow,
  type InventoryWriteResult,
} from "@camp404/db/inventory";
import type {
  EditInventoryItemInput,
  EditInventoryNeedInput,
  InventoryBookingInput,
  InventoryItemInput,
  InventoryLoanInput,
  InventoryNeedInput,
  InventoryPledgeInput,
  InventoryProposalInput,
  InventoryReviewInput,
} from "@camp404/types";
import { testStore } from "./test-store";

// The E2E twin of @camp404/db/inventory (#246): the same rules on in-memory
// rows, so Playwright can drive the inventory without a database. Kept in its
// own module, beside the main store, and emptied by the E2E reset route.
// Refusals are the db module's own sentences.

type StoreItem = Omit<InventoryItemRow, "custodianName">;

interface StoreUpdate extends Omit<
  InventoryUpdateRow,
  "itemName" | "team" | "custodianName" | "proposedByName" | "reviewedByName"
> {
  reviewedById: string | null;
}

interface StoreNeed {
  id: string;
  cycle: number;
  team: InventoryNeedRow["team"];
  name: string;
  quantity: number;
  itemId: string | null;
  boughtQuantity: number;
  note: string | null;
  version: number;
}

interface StorePledge {
  needId: string;
  userId: string;
  quantity: number;
  note: string | null;
  at: number;
}

interface StoreBooking {
  id: string;
  cycle: number;
  itemId: string;
  userId: string;
  note: string | null;
  createdAt: Date;
}

interface StoreLoan {
  id: string;
  cycle: number;
  itemId: string;
  quantity: number;
  borrowerCamp: string;
  borrowerAddress: string;
  lentAt: Date;
  lentById: string;
  returnedAt: Date | null;
}

interface InventoryState {
  items: StoreItem[];
  updates: StoreUpdate[];
  needs: StoreNeed[];
  pledges: StorePledge[];
  bookings: StoreBooking[];
  loans: StoreLoan[];
  tick: number;
}

const KEY = "__camp404InventoryStore__";

function state(): InventoryState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    items: [],
    updates: [],
    needs: [],
    pledges: [],
    bookings: [],
    loans: [],
    tick: 0,
  } satisfies InventoryState;
  return g[KEY] as InventoryState;
}

/** Empties the inventory twin; the E2E reset route calls it. */
export function resetInventoryStore(): void {
  const s = state();
  s.items.length = 0;
  s.updates.length = 0;
  s.needs.length = 0;
  s.pledges.length = 0;
  s.bookings.length = 0;
  s.loans.length = 0;
  s.tick = 0;
}

/** A strictly later time than the last one, so orders are stable. */
function now(): Date {
  const s = state();
  s.tick += 1;
  return new Date(Date.now() + s.tick);
}

function nameOf(userId: string | null): string | null {
  if (!userId) return null;
  const user = testStore.findUserById(userId);
  return user ? (user.displayName ?? "Unnamed member") : null;
}

function isEditor(actorId: string, team: string): boolean {
  const reach = testStore.senderReach(actorId);
  const rank =
    reach === undefined
      ? "captain"
      : reach.length > 0
        ? "team_lead"
        : "camp_member";
  if (!testStore.findUserById(actorId)) return false;
  return canEditInventory(rank, reach ?? [], team);
}

function refuseOr(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function liveItem(itemId: string): StoreItem | null {
  return (
    state().items.find((i) => i.id === itemId && i.archivedAt === null) ?? null
  );
}

function custodianOk(userId: string | null | undefined): boolean {
  if (!userId) return true;
  return testStore.findUserById(userId)?.approvalStatus === "approved";
}

function rowOf(item: StoreItem): InventoryItemRow {
  return { ...item, custodianName: nameOf(item.custodianUserId) };
}

function updateRow(u: StoreUpdate): InventoryUpdateRow {
  const item = state().items.find((i) => i.id === u.itemId);
  return {
    ...u,
    itemName: item?.name ?? "",
    team: item?.team ?? "kitchen",
    custodianName: nameOf(u.custodianUserId),
    proposedByName: nameOf(u.proposedById),
    reviewedByName: nameOf(u.reviewedById),
  };
}

function itemFields(input: InventoryItemInput) {
  return {
    name: input.name,
    details: input.details ?? null,
    team: input.team,
    category: input.category,
    condition: input.condition,
    quantity: input.quantity,
    unit: input.unit ?? null,
    weightKg: input.weightKg ?? null,
    wattsEach: input.wattsEach ?? null,
    location: input.location,
    custodianUserId: input.custodianUserId ?? null,
    storageLocation: input.storageLocation ?? null,
    requiresMaintenance: input.requiresMaintenance,
    maintenanceIntervalDays: input.maintenanceIntervalDays ?? null,
    bookableCount: input.bookableCount ?? null,
  };
}

function logDirect(item: StoreItem, actorId: string, note: string) {
  const at = now();
  state().updates.push({
    id: randomUUID(),
    itemId: item.id,
    status: "approved",
    quantity: item.quantity,
    condition: item.condition,
    location: item.location,
    custodianUserId: item.custodianUserId,
    storageLocation: item.storageLocation,
    maintenancePerformedAt: null,
    note,
    proposedById: actorId,
    reviewedById: actorId,
    reviewedAt: at,
    reviewNote: null,
    createdAt: at,
  });
}

/** How many of an item are lent out and not back yet, across years. */
function lentOutOf(itemId: string): number {
  return state()
    .loans.filter((l) => l.itemId === itemId && l.returnedAt === null)
    .reduce((sum, l) => sum + l.quantity, 0);
}

function cycle(): number {
  return testStore.currentCycleNumber();
}

function thisYearsNeed(needId: string): StoreNeed | null {
  return (
    state().needs.find((n) => n.id === needId && n.cycle === cycle()) ?? null
  );
}

export const inventoryStore = {
  // --- Reads -----------------------------------------------------------------

  listInventoryItems(): InventoryItemRow[] {
    return state()
      .items.filter((i) => i.archivedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(rowOf);
  },

  getInventoryItem(itemId: string): InventoryItemRow | null {
    const item = state().items.find((i) => i.id === itemId);
    return item ? rowOf(item) : null;
  },

  listItemUpdates(itemId: string): InventoryUpdateRow[] {
    return state()
      .updates.filter((u) => u.itemId === itemId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(updateRow);
  },

  listPendingProposals(): InventoryUpdateRow[] {
    return state()
      .updates.filter(
        (u) => u.status === "pending" && u.itemId && liveItem(u.itemId),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(updateRow);
  },

  listInventoryNeeds(): InventoryNeedRow[] {
    const s = state();
    return s.needs
      .filter((n) => n.cycle === cycle())
      .sort(
        (a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name),
      )
      .map((n) => {
        const item = n.itemId
          ? s.items.find((i) => i.id === n.itemId)
          : undefined;
        return {
          id: n.id,
          team: n.team,
          name: n.name,
          quantity: n.quantity,
          itemId: n.itemId,
          itemName: item?.name ?? null,
          have: item && item.archivedAt === null ? item.quantity : 0,
          boughtQuantity: n.boughtQuantity,
          note: n.note,
          version: n.version,
          pledges: s.pledges
            .filter((p) => p.needId === n.id)
            .sort((a, b) => a.at - b.at)
            .map((p) => ({
              userId: p.userId,
              displayName: nameOf(p.userId) ?? "Unnamed member",
              quantity: p.quantity,
              note: p.note,
            })),
        };
      });
  },

  listBookableItems(viewerId: string): BookableItemRow[] {
    const s = state();
    const year = cycle();
    return s.items
      .filter((i) => i.archivedAt === null && i.bookableCount !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => {
        const bookings = s.bookings.filter(
          (b) => b.itemId === i.id && b.cycle === year,
        );
        return {
          itemId: i.id,
          name: i.name,
          team: i.team,
          bookableCount: i.bookableCount ?? 0,
          quantity: i.quantity,
          condition: i.condition,
          lentOut: lentOutOf(i.id),
          booked: bookings.length,
          myBookingId: bookings.find((b) => b.userId === viewerId)?.id ?? null,
        };
      });
  },

  listItemBookings(
    itemId: string,
    viewerId: string,
    withNames: boolean,
  ): InventoryBookingRow[] {
    return state()
      .bookings.filter((b) => b.itemId === itemId && b.cycle === cycle())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((b) => {
        const mine = b.userId === viewerId;
        const named = withNames || mine;
        return {
          id: b.id,
          userId: named ? b.userId : null,
          displayName: named ? (nameOf(b.userId) ?? "Unnamed member") : null,
          mine,
          note: named ? b.note : null,
          createdAt: b.createdAt,
        };
      });
  },

  listInventoryLoans(itemId?: string): InventoryLoanRow[] {
    const s = state();
    return s.loans
      .filter(
        (l) =>
          // As the db: a loan still out stays in sight across years.
          (l.returnedAt === null || l.cycle === cycle()) &&
          (itemId === undefined || l.itemId === itemId),
      )
      .sort(
        (a, b) =>
          Number(a.returnedAt !== null) - Number(b.returnedAt !== null) ||
          b.lentAt.getTime() - a.lentAt.getTime(),
      )
      .map((l) => {
        const item = s.items.find((i) => i.id === l.itemId);
        return {
          id: l.id,
          itemId: l.itemId,
          itemName: item?.name ?? "",
          team: item?.team ?? "kitchen",
          quantity: l.quantity,
          borrowerCamp: l.borrowerCamp,
          borrowerAddress: l.borrowerAddress,
          lentAt: l.lentAt,
          lentByName: nameOf(l.lentById),
          returnedAt: l.returnedAt,
        };
      });
  },

  // --- Items -----------------------------------------------------------------

  addInventoryItem(
    input: InventoryItemInput & { actorId: string },
  ): InventoryWriteResult<{ id: string }> {
    if (!isEditor(input.actorId, input.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (!custodianOk(input.custodianUserId)) return refuseOr(CUSTODIAN_UNKNOWN);
    const at = now();
    const item: StoreItem = {
      id: randomUUID(),
      ...itemFields(input),
      lastMaintainedAt: null,
      nextMaintenanceDueAt: null,
      lastCheckedAt: null,
      archivedAt: null,
      version: 1,
      updatedAt: at,
    };
    state().items.push(item);
    logDirect(item, input.actorId, "Added");
    return { ok: true, id: item.id };
  },

  updateInventoryItem(
    input: EditInventoryItemInput & { actorId: string },
  ): InventoryWriteResult<{ version: number }> {
    const item = liveItem(input.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (!isEditor(input.actorId, item.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (input.team !== item.team && !isEditor(input.actorId, input.team)) {
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    }
    if (item.version !== input.expectedVersion) return refuseOr(ITEM_CHANGED);
    if (!custodianOk(input.custodianUserId)) return refuseOr(CUSTODIAN_UNKNOWN);
    Object.assign(item, itemFields(input), {
      nextMaintenanceDueAt: nextMaintenanceDue(
        input.requiresMaintenance,
        input.maintenanceIntervalDays ?? null,
        item.lastMaintainedAt,
      ),
      version: item.version + 1,
      updatedAt: now(),
    });
    logDirect(item, input.actorId, "Edited");
    return { ok: true, version: item.version };
  },

  archiveInventoryItem(input: {
    actorId: string;
    itemId: string;
    expectedVersion: number;
  }): InventoryWriteResult {
    const item = liveItem(input.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (!isEditor(input.actorId, item.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (item.version !== input.expectedVersion) return refuseOr(ITEM_CHANGED);
    item.archivedAt = now();
    item.version += 1;
    return { ok: true };
  },

  // --- Proposals ---------------------------------------------------------------

  proposeInventoryChange(
    input: InventoryProposalInput & { actorId: string },
  ): InventoryWriteResult<{ id: string }> {
    const item = liveItem(input.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (!custodianOk(input.custodianUserId)) return refuseOr(CUSTODIAN_UNKNOWN);
    const at = now();
    const id = randomUUID();
    state().updates.push({
      id,
      itemId: item.id,
      status: "pending",
      quantity: input.quantity,
      condition: input.condition,
      location: input.location,
      custodianUserId: input.custodianUserId ?? null,
      storageLocation: input.storageLocation ?? null,
      maintenancePerformedAt: input.maintenanceDone ? at : null,
      note: input.note ?? null,
      proposedById: input.actorId,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: at,
    });
    return { ok: true, id };
  },

  reviewInventoryChange(
    input: InventoryReviewInput & { actorId: string },
  ): InventoryWriteResult {
    const proposal = state().updates.find((u) => u.id === input.updateId);
    if (!proposal?.itemId) return refuseOr(PROPOSAL_GONE);
    const item = liveItem(proposal.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (!isEditor(input.actorId, item.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (proposal.status !== "pending") return refuseOr(PROPOSAL_DECIDED);
    const at = now();
    proposal.status = input.decision;
    proposal.reviewedById = input.actorId;
    proposal.reviewedAt = at;
    proposal.reviewNote = input.reviewNote ?? null;
    if (input.decision === "approved") {
      const lastMaintainedAt =
        proposal.maintenancePerformedAt ?? item.lastMaintainedAt;
      Object.assign(item, {
        quantity: proposal.quantity,
        condition: proposal.condition ?? item.condition,
        location: proposal.location ?? item.location,
        custodianUserId: proposal.custodianUserId,
        storageLocation: proposal.storageLocation,
        lastMaintainedAt,
        nextMaintenanceDueAt: nextMaintenanceDue(
          item.requiresMaintenance,
          item.maintenanceIntervalDays,
          lastMaintainedAt,
        ),
        lastCheckedAt: proposal.createdAt,
        version: item.version + 1,
        updatedAt: at,
      });
    }
    return { ok: true };
  },

  // --- Needs and pledges ---------------------------------------------------------

  addInventoryNeed(
    input: InventoryNeedInput & { actorId: string },
  ): InventoryWriteResult<{ id: string }> {
    if (!isEditor(input.actorId, input.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (input.itemId && !liveItem(input.itemId)) return refuseOr(ITEM_GONE);
    const id = randomUUID();
    state().needs.push({
      id,
      cycle: cycle(),
      team: input.team,
      name: input.name,
      quantity: input.quantity,
      itemId: input.itemId ?? null,
      boughtQuantity: input.boughtQuantity,
      note: input.note ?? null,
      version: 1,
    });
    return { ok: true, id };
  },

  updateInventoryNeed(
    input: EditInventoryNeedInput & { actorId: string },
  ): InventoryWriteResult {
    const need = thisYearsNeed(input.needId);
    if (!need) return refuseOr(NEED_GONE);
    if (!isEditor(input.actorId, need.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (input.team !== need.team && !isEditor(input.actorId, input.team)) {
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    }
    if (need.version !== input.expectedVersion) return refuseOr(NEED_CHANGED);
    if (input.itemId && !liveItem(input.itemId)) return refuseOr(ITEM_GONE);
    Object.assign(need, {
      team: input.team,
      name: input.name,
      quantity: input.quantity,
      itemId: input.itemId ?? null,
      boughtQuantity: input.boughtQuantity,
      note: input.note ?? null,
      version: need.version + 1,
    });
    return { ok: true };
  },

  removeInventoryNeed(input: {
    actorId: string;
    needId: string;
    expectedVersion: number;
  }): InventoryWriteResult {
    const s = state();
    const need = thisYearsNeed(input.needId);
    if (!need) return refuseOr(NEED_GONE);
    if (!isEditor(input.actorId, need.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    if (need.version !== input.expectedVersion) return refuseOr(NEED_CHANGED);
    s.needs.splice(s.needs.indexOf(need), 1);
    for (let i = s.pledges.length - 1; i >= 0; i--) {
      if (s.pledges[i]!.needId === need.id) s.pledges.splice(i, 1);
    }
    return { ok: true };
  },

  pledgeToNeed(
    input: InventoryPledgeInput & { actorId: string },
  ): InventoryWriteResult {
    if (!thisYearsNeed(input.needId)) return refuseOr(NEED_GONE);
    const s = state();
    const mine = s.pledges.find(
      (p) => p.needId === input.needId && p.userId === input.actorId,
    );
    if (mine) {
      mine.quantity = input.quantity;
      mine.note = input.note ?? null;
    } else {
      s.pledges.push({
        needId: input.needId,
        userId: input.actorId,
        quantity: input.quantity,
        note: input.note ?? null,
        at: now().getTime(),
      });
    }
    return { ok: true };
  },

  withdrawPledge(input: {
    actorId: string;
    needId: string;
  }): InventoryWriteResult {
    if (!thisYearsNeed(input.needId)) return refuseOr(NEED_GONE);
    const s = state();
    const i = s.pledges.findIndex(
      (p) => p.needId === input.needId && p.userId === input.actorId,
    );
    if (i >= 0) s.pledges.splice(i, 1);
    return { ok: true };
  },

  // --- Bookings ------------------------------------------------------------------

  bookInventoryItem(
    input: InventoryBookingInput & { actorId: string },
  ): InventoryWriteResult<{ id: string }> {
    const item = liveItem(input.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (item.bookableCount === null) return refuseOr(NOT_BOOKABLE);
    const year = cycle();
    const bookings = state().bookings.filter(
      (b) => b.itemId === item.id && b.cycle === year,
    );
    if (bookings.some((b) => b.userId === input.actorId)) {
      return refuseOr(ALREADY_BOOKED);
    }
    if (item.condition === "broken") return refuseOr(ITEM_BROKEN);
    if (bookings.length >= item.bookableCount) return refuseOr(FULLY_BOOKED);
    const free = bookableNow({
      bookableCount: item.bookableCount,
      quantity: item.quantity,
      broken: false,
      lentOut: lentOutOf(item.id),
    });
    if (bookings.length >= free) return refuseOr(NONE_FREE);
    const id = randomUUID();
    state().bookings.push({
      id,
      cycle: year,
      itemId: item.id,
      userId: input.actorId,
      note: input.note ?? null,
      createdAt: now(),
    });
    return { ok: true, id };
  },

  cancelInventoryBooking(input: {
    actorId: string;
    bookingId: string;
  }): InventoryWriteResult {
    const s = state();
    const booking = s.bookings.find((b) => b.id === input.bookingId);
    if (!booking) return refuseOr(BOOKING_GONE);
    const item = s.items.find((i) => i.id === booking.itemId);
    const own = booking.userId === input.actorId;
    if (!own && !(item && isEditor(input.actorId, item.team))) {
      return refuseOr(NOT_YOUR_BOOKING);
    }
    s.bookings.splice(s.bookings.indexOf(booking), 1);
    return { ok: true };
  },

  // --- Loans ---------------------------------------------------------------------

  lendInventoryItem(
    input: InventoryLoanInput & { actorId: string },
  ): InventoryWriteResult<{ id: string }> {
    const item = liveItem(input.itemId);
    if (!item) return refuseOr(ITEM_GONE);
    if (!isEditor(input.actorId, item.team))
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    const out = lentOutOf(item.id);
    if (out + input.quantity > item.quantity) return refuseOr(LOAN_TOO_MANY);
    const id = randomUUID();
    state().loans.push({
      id,
      cycle: cycle(),
      itemId: item.id,
      quantity: input.quantity,
      borrowerCamp: input.borrowerCamp,
      borrowerAddress: input.borrowerAddress,
      lentAt: now(),
      lentById: input.actorId,
      returnedAt: null,
    });
    return { ok: true, id };
  },

  returnInventoryLoan(input: {
    actorId: string;
    loanId: string;
  }): InventoryWriteResult {
    const s = state();
    const loan = s.loans.find((l) => l.id === input.loanId);
    if (!loan) return refuseOr(LOAN_GONE);
    const item = s.items.find((i) => i.id === loan.itemId);
    if (!item || !isEditor(input.actorId, item.team)) {
      return refuseOr(NOT_AN_INVENTORY_EDITOR);
    }
    if (loan.returnedAt !== null) return refuseOr(LOAN_RETURNED);
    loan.returnedAt = now();
    return { ok: true };
  },
};
