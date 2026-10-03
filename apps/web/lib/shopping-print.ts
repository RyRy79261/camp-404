import {
  buildShoppingList,
  mealPlanDayLabel,
  shoppingByShop,
  snackKey,
  type ShoppingByShop,
} from "@camp404/core";
import type { ShoppingFacts } from "@camp404/db/kitchen-menu";
import type { ShoppingPrice } from "@camp404/db/kitchen-prices";
import type { PriceKind } from "@camp404/types";
import {
  CATEGORY_LABEL,
  platesLabel,
  shoppingAmountLabel,
  shoppingBuyLabel,
} from "./recipe-labels";

// The shopping list to print (#249; the owner approved Option A of
// design/print-shopping.html, 2026-10-02). The same list as the screen
// (/kitchen/shopping), worked out the same way from the menu, the snacks and
// the ticks, with only what is still to buy: a line ticked at the amount the
// list needs now is bought and left off; one ticked at another amount is not.
//
// A captain or a Kitchen lead (the caller passes their prices; anyone else
// gets null from getShoppingPricesFor, on the server) prints it by shop, each
// shop with its total, and the total of all shops. Everyone else prints it by
// shop area, and their lines carry no shop and no price at all: not hidden,
// never put in.

/** A line on the sheet. `shop`, `amountCents` and `kind` only with prices. */
export interface PrintShoppingLine {
  key: string;
  name: string;
  /** The amount to buy, rounded up (amountToBuy). */
  amount: string;
  /** Its shop area: "Produce", "Snacks". */
  area: string;
  shop?: string | null;
  amountCents?: number | null;
  kind?: PriceKind;
}

export interface PricedPrintLine extends PrintShoppingLine {
  shop: string | null;
  amountCents: number | null;
  kind: PriceKind;
}

export interface ShoppingPrint {
  /** How many meals the list is from. */
  meals: number;
  /** Lines still to buy, and lines already bought (left off). */
  toBuy: number;
  bought: number;
  /** Dishes on the menu the list cannot count yet: "Green salad (Day 4 · …)". */
  notCounted: string[];
  /** Still to buy, by shop area, in the list's order. */
  areas: { id: string; label: string; lines: PrintShoppingLine[] }[];
  /** Still to buy, by shop, with totals: only with prices. */
  byShop: ShoppingByShop<PricedPrintLine> | null;
  /** Whether any price on the sheet is an estimate, not paid. */
  estimate: boolean;
}

export function shoppingPrint(
  facts: ShoppingFacts,
  prices: readonly ShoppingPrice[] | null,
): ShoppingPrint {
  const { plan, menu, snacks, ticks } = facts;
  const list = buildShoppingList({
    days: plan.days,
    menu: menu.items,
    recipes: menu.recipes,
  });
  const tickedAt = new Map(ticks.map((t) => [t.key, t.amount]));
  const priceOf = prices ? new Map(prices.map((p) => [p.key, p])) : null;

  const all: {
    id: string;
    label: string;
    lines: (PrintShoppingLine & { exact: string })[];
  }[] = list.groups.map((group) => ({
    id: group.category,
    label: CATEGORY_LABEL[group.category],
    lines: group.lines.map((line) => ({
      key: line.key,
      name: line.name,
      amount: shoppingBuyLabel(line.amount),
      area: CATEGORY_LABEL[group.category],
      exact: shoppingAmountLabel(line.amount),
    })),
  }));
  if (snacks.length > 0) {
    all.push({
      id: "snacks",
      label: "Snacks",
      lines: snacks.map((snack) => ({
        key: snackKey(snack.id),
        name: snack.name,
        amount: snack.amount ?? "",
        area: "Snacks",
        exact: snack.amount ?? "",
      })),
    });
  }

  let bought = 0;
  const areas = all
    .map((group) => ({
      ...group,
      lines: group.lines.flatMap(({ exact, ...line }) => {
        // A tick is saved against the exact amount the list needs.
        const done = tickedAt.get(line.key) === exact;
        if (done) bought++;
        return done ? [] : [line];
      }),
    }))
    .filter((group) => group.lines.length > 0);

  let byShop: ShoppingByShop<PricedPrintLine> | null = null;
  let estimate = false;
  if (priceOf) {
    const priced = areas.flatMap((group) =>
      group.lines.map((line): PricedPrintLine => {
        const p = priceOf.get(line.key);
        if (p && p.amountCents !== null && p.kind === "estimate") {
          estimate = true;
        }
        return {
          ...line,
          shop: p?.shop ?? null,
          amountCents: p?.amountCents ?? null,
          kind: p?.kind ?? "estimate",
        };
      }),
    );
    byShop = shoppingByShop(priced);
  }

  return {
    meals: list.meals,
    toBuy: areas.reduce((n, g) => n + g.lines.length, 0),
    bought,
    notCounted: list.notCounted.map(
      (n) =>
        `${n.title} (${mealPlanDayLabel(plan.firstDay, n.day)}, ${n.meal}, ${platesLabel(n.plates)})`,
    ),
    areas,
    byShop,
    estimate,
  };
}
