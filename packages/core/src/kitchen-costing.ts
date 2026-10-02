import type { MealPlanDay, PriceKind } from "@camp404/types";
import { sumMinor } from "./money";
import { canEditMealPlan } from "./recipes";

// The Kitchen's prices and food cost (#245; the owner approved Option A of
// design/kitchen-prices.html and kitchen-costing.html, 2026-10-02). Pure: no
// DB, no session, no next/*.
//
// WHO. Captains and Kitchen leads give a shopping line a shop and a price and
// read the food cost; every other member reads the list exactly as before and
// is never sent a price (the page filters on the server). The same people
// edit the meal plan, so the rule is canEditMealPlan's, fail-closed.
//
// THE FIGURES (the approved mock-up's note):
//  - Food cost: every price on the shopping list, snacks included: what was
//    paid where a line says paid, the estimate where it says estimate. A line
//    with no price adds nothing and is named, so the cost is known to be short.
//  - Kitchen budget: the Kitchen team's one amount from team budgets (#317).
//  - Left: the budget less the food cost.
//  - Per person per day: the food cost over person-days, where each day counts
//    its larger meal's plates (the camp does breakfast and dinner).
// Money is rands in whole cents; sums go through sumMinor.

/**
 * Whether someone may give shopping lines a shop and a price, and read the
 * food cost: a captain or a Kitchen lead. `ledTeams` are the team keys they
 * lead this year.
 */
export function canPriceShoppingList(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return canEditMealPlan(rank, ledTeams);
}

/** One shopping line's price, as the cost needs it. */
export interface PricedLine {
  name: string;
  /** Null when the line has no price yet. */
  amountCents: number | null;
  kind: PriceKind;
}

export interface FoodCost {
  paidCents: number;
  estimatedCents: number;
  totalCents: number;
  /** The names of the lines with no price yet, in list order. */
  noPrice: string[];
}

/** The food cost of the lines on the list. */
export function foodCost(lines: readonly PricedLine[]): FoodCost {
  const paid: number[] = [];
  const estimated: number[] = [];
  const noPrice: string[] = [];
  for (const line of lines) {
    if (line.amountCents === null) noPrice.push(line.name);
    else if (line.kind === "paid") paid.push(line.amountCents);
    else estimated.push(line.amountCents);
  }
  const paidCents = sumMinor(paid);
  const estimatedCents = sumMinor(estimated);
  return {
    paidCents,
    estimatedCents,
    totalCents: sumMinor([paidCents, estimatedCents]),
    noPrice,
  };
}

/**
 * The person-days the food feeds: each day counts its larger meal's plates.
 * A day with no meals counts nothing.
 */
export function personDays(days: readonly MealPlanDay[]): number {
  let total = 0;
  for (const day of days) {
    const most = Math.max(day.breakfast, day.dinner, 0);
    if (Number.isFinite(most)) total += most;
  }
  return total;
}

/**
 * The food cost per person per day, in whole cents (rounded half up), or
 * null when the plan has no plates yet.
 */
export function costPerPersonDay(
  totalCents: number,
  days: number,
): number | null {
  if (!Number.isSafeInteger(totalCents) || days <= 0) return null;
  return Math.round(totalCents / days);
}

export interface CostBar {
  /** The paid part of the bar, as a percentage of its length. */
  paidPercent: number;
  /** The estimated part, after the paid part. */
  estimatedPercent: number;
  /** The food cost as a whole percentage of the budget. */
  ofBudgetPercent: number;
}

/**
 * The bar under the figures: paid solid, estimates after it, as parts of the
 * budget, capped at the bar's length. Null when there is no budget to measure
 * against (none set, or R0).
 */
export function costBar(
  cost: Pick<FoodCost, "paidCents" | "estimatedCents" | "totalCents">,
  budgetCents: number | null,
): CostBar | null {
  if (budgetCents === null || budgetCents <= 0) return null;
  const paidPercent = Math.min(100, (100 * cost.paidCents) / budgetCents);
  const estimatedPercent = Math.min(
    100 - paidPercent,
    (100 * cost.estimatedCents) / budgetCents,
  );
  return {
    paidPercent,
    estimatedPercent,
    ofBudgetPercent: Math.round((100 * cost.totalCents) / budgetCents),
  };
}
