import { CAMP_TIME_ZONE } from "@camp404/core";
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

export function inventoryItemPath(id: string): string {
  return `${INVENTORY_PATH}/${id}`;
}

/** What someone who may not change a team's gear is told. */
export const INVENTORY_REFUSAL =
  "Only captains and that team's leads can change its gear. You can suggest a change on any item.";
export const ADD_REFUSAL =
  "Only captains and team leads can add gear, each for a team they lead.";
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

/** A count with the unit the team typed: "4 × box", or just "4". */
export function countText(quantity: number, unit: string | null): string {
  return unit ? `${quantity} × ${unit}` : String(quantity);
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
