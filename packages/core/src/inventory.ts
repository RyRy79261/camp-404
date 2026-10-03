import {
  INVENTORY_CATEGORIES,
  Team,
  ViewerRank,
  type InventoryCategory,
} from "@camp404/types";

// Inventory (#246). Pure: no DB, no session, no next/*.
//
// WHO MAY CHANGE AN ITEM. Clearance stays global (AGENTS.md): a lead of ANY
// team stands on the `team_lead` rung everywhere. Team identity decides only
// who may act HERE (owner, 2026-09-27: "a lead of that team or a captain"): a
// captain, or a lead of the team that owns the item. That covers editing an
// item, approving or rejecting a member's proposed change to it, lending it
// out, and keeping that team's needs for the year. Every member reads all of
// it. Fails closed: an unknown rank or a key that is not a team gets no, a
// captain's included. The write re-reads the actor's rank and led teams
// inside its own transaction and passes those here; it never takes a team
// list from the caller.

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

function isTeam(team: string): team is Team {
  return Team.safeParse(team).success;
}

/**
 * Whether someone may change a team's gear and needs: a captain, or a lead of
 * that team this year. `ledTeams` are the team keys they lead this year.
 */
export function canEditInventory(
  rank: string,
  ledTeams: readonly string[],
  team: string,
): boolean {
  if (!isViewerRank(rank) || !isTeam(team)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(team);
  return false;
}

/** Whether someone may change gear of at least one team (the Add button). */
export function canEditAnyInventory(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return Team.options.some((team) => canEditInventory(rank, ledTeams, team));
}

// --- Needs against haves ---------------------------------------------------

/** One need, as far as the sum needs it. */
export interface NeedCover {
  /** How many the team needs this year. */
  quantity: number;
  /** How many the camp already has: the linked item's count, or 0. */
  have: number;
  /** How many were bought for it. */
  bought: number;
  /** How many members pledged to bring, all pledges added. */
  pledged: number;
}

/**
 * How many are still needed: the need less what the camp has, what was
 * bought and what members pledged. Never below 0.
 */
export function stillNeeded(need: NeedCover): number {
  const covered =
    Math.max(0, need.have) +
    Math.max(0, need.bought) +
    Math.max(0, need.pledged);
  return Math.max(0, need.quantity - covered);
}

// --- Bookings --------------------------------------------------------------

/**
 * How many bookings an item still takes this year. Zero for an item that is
 * not booked at all (no limit set), so it can never be over-booked by a
 * missing limit.
 */
export function bookingsLeft(
  bookableCount: number | null,
  booked: number,
): number {
  if (bookableCount === null || bookableCount < 1) return 0;
  return Math.max(0, bookableCount - booked);
}

/** An item's state, as far as booking it goes. */
export interface BookableState {
  /** How many members may book one this year (the item's limit), or null. */
  bookableCount: number | null;
  /** How many the camp owns. */
  quantity: number;
  /** Whether the item is marked broken. */
  broken: boolean;
  /** How many are lent to other camps and not back yet. */
  lentOut: number;
}

/**
 * How many units can be booked this year, taken before any booking: the
 * item's limit, less the units lent to other camps (they are not here), and
 * none at all while the item is marked broken. A booking is one unit for the
 * whole burn. Never below 0; 0 for an item with no limit.
 */
export function bookableNow(item: BookableState): number {
  if (item.bookableCount === null || item.bookableCount < 1) return 0;
  if (item.broken) return 0;
  const here = Math.max(0, item.quantity - Math.max(0, item.lentOut));
  return Math.min(item.bookableCount, here);
}

// --- Maintenance -----------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the next maintenance is due: the last one plus the interval. Null for
 * an item with no schedule, or one never maintained (it is due now, which
 * `maintenanceDue` says).
 */
export function nextMaintenanceDue(
  requiresMaintenance: boolean,
  intervalDays: number | null,
  lastMaintainedAt: Date | null,
): Date | null {
  if (!requiresMaintenance || intervalDays === null) return null;
  if (lastMaintainedAt === null) return null;
  return new Date(lastMaintainedAt.getTime() + intervalDays * DAY_MS);
}

/**
 * Whether an item needs maintenance now: it has a schedule, and it was never
 * maintained or its next date has come.
 */
export function maintenanceDue(
  item: {
    requiresMaintenance: boolean;
    maintenanceIntervalDays: number | null;
    lastMaintainedAt: Date | null;
  },
  now: Date,
): boolean {
  if (!item.requiresMaintenance) return false;
  if (item.lastMaintainedAt === null) return true;
  const next = nextMaintenanceDue(
    item.requiresMaintenance,
    item.maintenanceIntervalDays,
    item.lastMaintainedAt,
  );
  return next !== null && next.getTime() <= now.getTime();
}

// --- Loading checklist (#249) ------------------------------------------------

/** What the loading checklist needs of an item. */
export interface LoadingItem {
  name: string;
  category: InventoryCategory;
  /**
   * Its weight in kg, or null when not weighed: the TOTAL for all of them
   * (the form asks "Weight in kg" beside "Watts each"; the type and the
   * column say total), so it is added once, never times How many.
   */
  weightKg: number | null;
}

export interface LoadingGroup<I> {
  category: InventoryCategory;
  /** By name. */
  items: I[];
}

export interface LoadingChecklist<I> {
  /** In the inventory's category order (the Gear tab's); empty ones left out. */
  groups: LoadingGroup<I>[];
  count: number;
  /** Every weight the camp knows, added up; 0 when none is weighed. */
  weightKg: number;
  /** Whether any item is weighed at all. */
  weighed: boolean;
}

/**
 * The loading checklist's list (the owner, 2026-10-02: "With inventory we
 * don't really have shelves and things. We have categories of stuff that we
 * own."): every item the camp owns, grouped by the inventory's categories in
 * the Gear tab's order, by name inside each, and the weight of what is
 * weighed. Nothing says whether an item goes this year, so every item is
 * listed and the sheet says to cross out what stays home.
 */
export function loadingChecklist<I extends LoadingItem>(
  items: readonly I[],
): LoadingChecklist<I> {
  const groups = INVENTORY_CATEGORIES.map((category) => ({
    category,
    items: items
      .filter((i) => i.category === category)
      .sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      ),
  })).filter((g) => g.items.length > 0);
  const weights = items.flatMap((i) =>
    i.weightKg !== null && Number.isFinite(i.weightKg) && i.weightKg > 0
      ? [i.weightKg]
      : [],
  );
  // Weights keep two decimals: add in hundredths so 0.1 + 0.2 stays 0.3.
  const hundredths = weights.reduce((n, w) => n + Math.round(w * 100), 0);
  return {
    groups,
    count: items.length,
    weightKg: hundredths / 100,
    weighed: weights.length > 0,
  };
}
