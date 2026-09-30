// Words and small shapes the gear rental screens share (#241). Pure, and safe
// in a browser: it says nothing about who may see what.

import {
  formatMoney,
  rentalOrderState,
  rentalPrice,
  rentalSources,
  type RentalOrderState,
} from "@camp404/core";
import type { RentalOrderStatus, RentalSource } from "@camp404/types";

/** What a screen needs of a catalogue item to price it. */
export interface PricedItemView {
  campPriceCents: number | null;
  campStockCount: number | null;
  supplierPriceCents: number | null;
}

/** "R 100,00" for one price, "R 100,00 to R 250,00" for two that differ. */
export function moneyRange(lowCents: number, highCents: number): string {
  return lowCents === highCents
    ? formatMoney(lowCents)
    : `${formatMoney(lowCents)} to ${formatMoney(highCents)}`;
}

/** What one of an item costs, as a member reads it before a captain decides. */
export function itemPriceText(item: PricedItemView): string {
  const prices = rentalSources(item).map((s) => rentalPrice(item, s)!);
  if (prices.length === 0) return "No price yet";
  return `${moneyRange(Math.min(...prices), Math.max(...prices))} each`;
}

/** "R 100,00 each": one source's price, under its name in a captain's picker. */
export function sourcePriceText(
  item: PricedItemView,
  source: RentalSource,
): string {
  const price = rentalPrice(item, source);
  return price === null ? "No price" : `${formatMoney(price)} each`;
}

/** "2 × Mattress", or just the name for one. */
export function quantityText(quantity: number, name: string): string {
  return quantity === 1 ? name : `${quantity} × ${name}`;
}

/** "Sleeps 2", for a tent. */
export function sleepsText(sleeps: number): string {
  return `Sleeps ${sleeps}`;
}

/**
 * A member's own tent in a few words: "3-person dome, sleeps 3", or whichever
 * of the two they gave. Null when they said neither.
 */
export function ownTentText(line: {
  ownDescription: string | null;
  ownSleeps: number | null;
}): string | null {
  const parts = [
    line.ownDescription,
    line.ownSleeps === null ? null : sleepsText(line.ownSleeps).toLowerCase(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** A list of names as a sentence part: "Ann", "Ann and Bo", "Ann, Bo and Cy". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const STATE_BADGE = {
  draft: { label: "Not sent yet", variant: "outline" },
  submitted: { label: "Sent", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  charged: { label: "On the dues", variant: "success" },
} as const satisfies Record<
  RentalOrderState,
  { label: string; variant: string }
>;

/** The badge for an order's state. */
export function orderBadge(order: {
  status: RentalOrderStatus;
  chargeId: string | null;
}): (typeof STATE_BADGE)[RentalOrderState] {
  return STATE_BADGE[rentalOrderState(order)];
}
