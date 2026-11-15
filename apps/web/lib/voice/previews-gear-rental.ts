import { formatMoney } from "@camp404/core";
import { ledgerCycle } from "../payments";
import { getRentalOverview, listRentalItems } from "../rental";
import { RENTAL_CATALOGUE_PATH, RENTAL_PATH } from "../rental-copy";
import { rentalItemFingerprint } from "../mcp/tools/gear-rental";
import {
  blocked,
  quote,
  shown,
  str,
  type Args,
  type PreviewFn,
} from "./preview-kit";

// The gear rental catalogue and tent labels: each preview reads the real item
// or tent, writes the row from it, and fills in what the tool compares (the
// item's fingerprint, the tent's label) from what it read.

const money = (cents: unknown): string =>
  typeof cents === "number" ? formatMoney(cents) : "none";

/** The item's prices and stock as one line. */
function itemLine(i: Args): string {
  const camp =
    typeof i.campPriceCents === "number"
      ? `camp ${money(i.campPriceCents)} × ${String(i.campStockCount)}`
      : "no camp stock";
  const supplier =
    typeof i.supplierPriceCents === "number"
      ? `supplier ${money(i.supplierPriceCents)}`
      : "no supplier";
  const reserve =
    typeof i.reserveCount === "number" && i.reserveCount > 0
      ? ` · ${i.reserveCount} reserved (${str(i.reserveSource)})`
      : "";
  return `${camp} · ${supplier}${reserve}`;
}

export const GEAR_RENTAL_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async add_rental_item(args) {
    return {
      sentence: `Add ${quote(str(args.name))} to the gear rental catalogue`,
      facts: `Gear rental · ${args.isTent === true ? `a tent for ${String(args.sleeps)}` : "not a tent"} · ${itemLine(args)}`,
      path: RENTAL_CATALOGUE_PATH,
      args,
      keys: [],
    };
  },

  async update_rental_item(args) {
    const item = (await listRentalItems(await ledgerCycle())).find(
      (i) => i.id === str(args.itemId),
    );
    if (!item) {
      return blocked(
        "Change a gear rental item",
        "That item isn't on the list any more.",
        args,
        RENTAL_CATALOGUE_PATH,
      );
    }
    const change = Object.entries(args)
      .filter(([key]) => key !== "itemId" && key !== "fingerprint")
      .map(([key, value]) =>
        key.endsWith("Cents")
          ? `${key}: ${money(value)}`
          : `${key}: ${shown(value)}`,
      );
    return {
      sentence: `Change ${quote(item.name)} in the gear rental catalogue`,
      facts: `Gear rental · now ${itemLine(item as unknown as Args)} · confirmed orders keep their price`,
      change,
      path: RENTAL_CATALOGUE_PATH,
      args: { ...args, fingerprint: rentalItemFingerprint(item) },
      keys: [`rental-item:${item.id}`],
    };
  },

  async set_tent_label(args) {
    const tent = (await getRentalOverview(await ledgerCycle())).tents.find(
      (t) => t.lineId === str(args.lineId),
    );
    if (!tent) {
      return blocked(
        "Label a camp tent",
        "That tent isn't on a confirmed order.",
        args,
        RENTAL_PATH,
      );
    }
    const label = str(args.label).trim();
    return {
      sentence: label
        ? `Label ${tent.ownerName}'s ${tent.itemName} ${quote(label)}`
        : `Take the label off ${tent.ownerName}'s ${tent.itemName}`,
      facts: `Gear rental · now ${tent.tentLabel ? quote(tent.tentLabel) : "no label"}`,
      path: RENTAL_PATH,
      args: { ...args, from: tent.tentLabel },
      keys: [`tent:${tent.lineId}`],
    };
  },
};
