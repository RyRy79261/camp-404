import { CAMP_TIME_ZONE, bookableNow } from "@camp404/core";
import type {
  InventoryCategory,
  InventoryCondition,
  InventoryLocation,
} from "@camp404/types";

// The inventory screens' fixed words, paths and labels (#246). A plain
// module: a "use server" file may export only async functions, so the
// inventory actions and the screens share these from here. Pure, so the
// client dialogs import it too.

export const INVENTORY_PATH = "/inventory";
export const INVENTORY_NEEDS_PATH = "/inventory/needs";
export const INVENTORY_BOOKINGS_PATH = "/inventory/bookings";
export const INVENTORY_LOANS_PATH = "/inventory/lent";

/** The A4 sheets (#249's print shell), to print before leaving for the burn. */
export const INVENTORY_PRINT_NEEDS_PATH = "/print/inventory/needs";
export const INVENTORY_PRINT_BOOKINGS_PATH = "/print/inventory/bookings";
export const INVENTORY_PRINT_STRIKE_PATH = "/print/inventory/strike";
export const INVENTORY_PRINT_LOADING_PATH = "/print/inventory/loading";

export function inventoryItemPath(id: string): string {
  return `${INVENTORY_PATH}/${id}`;
}

export const CHECK_ITEM = "Check the item and try again.";
export const CHECK_NEED = "Check the need and try again.";
export const CHECK_LOAN = "Check the loan and try again.";
export const CHECK_CHANGE = "Check the change and try again.";

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  kitchen: "Kitchen",
  cooling: "Cooler boxes and fridges",
  structures: "Structures and flooring",
  power: "Power and cables",
  water_and_sanitation: "Water and sanitation",
  decor: "Decor",
  tools: "Tools",
  other: "Other",
};

export const CONDITION_LABELS: Record<InventoryCondition, string> = {
  good: "Good",
  needs_repair: "Needs repair",
  broken: "Broken",
};

export const LOCATION_LABELS: Record<InventoryLocation, string> = {
  storage_unit: "Storage unit",
  custodian_home: "At a member's home",
  on_site: "On site",
};

/** Where an item is, in words: "At Sam's home", "Storage unit, shelf 3". */
export function whereText(item: {
  location: InventoryLocation;
  custodianName: string | null;
  storageLocation: string | null;
}): string {
  const base =
    item.location === "custodian_home"
      ? item.custodianName
        ? `At ${item.custodianName}'s home`
        : LOCATION_LABELS.custodian_home
      : LOCATION_LABELS[item.location];
  return item.storageLocation ? `${base}, ${item.storageLocation}` : base;
}

/**
 * A unit word for a count: "box" stays for 1 and becomes "boxes" for more.
 * Plain English endings only; a unit typed already plural ("boxes") is kept.
 */
export function unitFor(quantity: number, unit: string): string {
  const word = unit.trim();
  if (quantity === 1 || word === "") return word;
  const lower = word.toLowerCase();
  // Already plural, or a measure that reads the same either way.
  if (/(ss|us|is)$/.test(lower)) return `${word}es`;
  if (/s$/.test(lower)) return word;
  if (/(x|z|ch|sh)$/.test(lower)) return `${word}es`;
  // shelf, half, loaf, knife: "shelves", not "shelfs".
  if (/(el|al|oa|ar)f$/.test(lower)) return `${word.slice(0, -1)}ves`;
  if (/ife$/.test(lower)) return `${word.slice(0, -2)}ves`;
  if (/[^aeiou]y$/.test(lower)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** A count with the unit the team typed: "4 boxes", "1 freezer", or "4". */
export function countText(quantity: number, unit: string | null): string {
  return unit && unit.trim()
    ? `${quantity} ${unitFor(quantity, unit)}`
    : String(quantity);
}

/** A day and month, as the app writes dates: "28 Sept", "1 Mar". */
export function shortDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: CAMP_TIME_ZONE,
  }).formatToParts(date);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${day} ${month}`;
}

/**
 * What a gear row says about maintenance, or null when nothing needs doing:
 * "Never done" for an item on a schedule that was never maintained, "Due
 * 1 Mar" once its next date has come.
 */
export function maintenanceNote(
  item: {
    requiresMaintenance: boolean;
    lastMaintainedAt: Date | null;
    nextMaintenanceDueAt: Date | null;
  },
  now: Date,
): { text: string; due: boolean } | null {
  if (!item.requiresMaintenance) return null;
  if (item.lastMaintainedAt === null) return { text: "Never done", due: false };
  const next = item.nextMaintenanceDueAt;
  if (next && next.getTime() <= now.getTime()) {
    return { text: `Due ${shortDate(next)}`, due: true };
  }
  return null;
}

/** One field a suggested change would change: "How many: 4 → 3". */
export interface ChangedField {
  label: string;
  from: string;
  to: string;
}

/**
 * What approving a member's suggestion would change on the item, field by
 * field, as approval applies it (reviewInventoryChange): the count, the
 * condition, where it is, and maintenance done. Only the fields that differ.
 */
export function suggestionDiff(
  item: {
    quantity: number;
    unit: string | null;
    condition: InventoryCondition;
    location: InventoryLocation;
    custodianName: string | null;
    storageLocation: string | null;
  },
  change: {
    quantity: number;
    condition: InventoryCondition | null;
    location: InventoryLocation | null;
    custodianName: string | null;
    storageLocation: string | null;
    maintenancePerformedAt: Date | null;
  },
): ChangedField[] {
  const out: ChangedField[] = [];
  if (change.quantity !== item.quantity) {
    out.push({
      label: "How many",
      from: String(item.quantity),
      to: String(change.quantity),
    });
  }
  const condition = change.condition ?? item.condition;
  if (condition !== item.condition) {
    out.push({
      label: "Condition",
      from: CONDITION_LABELS[item.condition],
      to: CONDITION_LABELS[condition],
    });
  }
  const before = whereText(item);
  const after = whereText({
    location: change.location ?? item.location,
    custodianName: change.custodianName,
    storageLocation: change.storageLocation,
  });
  if (before !== after) out.push({ label: "Where", from: before, to: after });
  if (change.maintenancePerformedAt) {
    out.push({
      label: "Maintenance",
      from: "",
      to: `Done ${shortDate(change.maintenancePerformedAt)}`,
    });
  }
  return out;
}

/** A short date: "27 Sep 2026". */
export function dateText(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: CAMP_TIME_ZONE,
  });
}

/** What one bookable item says, worked out once for both layouts. */
export function bookingState(i: {
  bookableCount: number;
  quantity: number;
  condition: InventoryCondition;
  lentOut: number;
  booked: number;
  myBookingId: string | null;
}) {
  const broken = i.condition === "broken";
  const free = bookableNow({
    bookableCount: i.bookableCount,
    quantity: i.quantity,
    broken,
    lentOut: i.lentOut,
  });
  const left = Math.max(0, free - i.booked);
  // Every reason a unit is not bookable, lent out first: "2 lent out · 1
  // kept for the camp" (the units that are here but over the item's limit).
  const kept = broken
    ? 0
    : Math.max(0, i.quantity - Math.max(0, i.lentOut) - free);
  const reasons = [
    ...(broken ? ["Broken"] : []),
    ...(i.lentOut > 0 ? [`${i.lentOut} lent out`] : []),
    ...(kept > 0 ? [`${kept} kept for the camp`] : []),
  ];
  const why = reasons.length > 0 ? reasons.join(" · ") : "All usable";
  const after =
    i.myBookingId !== null
      ? null
      : free === 0
        ? broken
          ? "Until it's fixed"
          : "Back after the burn"
        : left > 0
          ? `${left} left`
          : "Full";
  return { broken, free, left, why, after };
}

/**
 * Loans grouped by the camp that has them (camp and address together, as
 * typed), in the order the camps first appear. For the Lent out list and the
 * strike checklist.
 */
export function groupLoansByCamp<
  L extends { borrowerCamp: string; borrowerAddress: string },
>(
  loans: readonly L[],
): { key: string; camp: string; address: string; loans: L[] }[] {
  const groups = new Map<
    string,
    { key: string; camp: string; address: string; loans: L[] }
  >();
  for (const l of loans) {
    const key = `${l.borrowerCamp.trim().toLowerCase()}|${l.borrowerAddress.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.loans.push(l);
    else
      groups.set(key, {
        key,
        camp: l.borrowerCamp,
        address: l.borrowerAddress,
        loans: [l],
      });
  }
  return [...groups.values()];
}
