import Link from "next/link";
import { Printer } from "lucide-react";
import {
  buildShoppingList,
  canTickShoppingList,
  costBar,
  costPerPersonDay,
  foodCost,
  mealPlanDayLabel,
  personDays,
  snackKey,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { listBudgetTotals } from "@/lib/claims";
import {
  getShoppingFacts,
  getShoppingPricesFor,
  type ShoppingPrice,
} from "@/lib/kitchen-menu";
import { ledgerCycle } from "@/lib/payments";
import {
  MEAL_PLAN_PATH,
  SHOPPING_PRINT_PATH,
  recipePath,
} from "@/lib/recipe-copy";
import {
  CATEGORY_LABEL,
  platesLabel,
  shoppingAmountLabel,
  shoppingBuyLabel,
} from "@/lib/recipe-labels";
import { FoodCostBox } from "./food-cost";
import type { LinePrice } from "./price-editor";
import {
  NotCountedBox,
  ShoppingListView,
  type ShoppingGroupView,
} from "./shopping-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shopping list — Camp 404" };

// The Kitchen's shopping list (#245; the owner's approved mock-up,
// design/approved-ks.html, Option A, 2026-10-01): one checklist with every
// shop area on one page, like Noble Notations' list, worked out on every
// load from the menu inside the meal plan. For each recipe on a meal, the
// plate count Claude proofread for that meal's plates, added up by
// ingredient and unit; each line opens to show where its amount comes from.
// A recipe whose count is not verified yet is listed at the top, "Not
// counted yet: proofread first", and adds nothing: it is never guessed.
// Snacks come last, as typed.
//
// Every approved member reads it and may tick (the owner: ticks are shared
// by the whole camp, and any member may tick).
//
// Prices and food cost (#245; the owner's Option A of kitchen-prices.html and
// kitchen-costing.html, 2026-10-02): a captain or a Kitchen lead also gets
// each line's shop and price, and the food cost box on top (paid and
// estimated, the Kitchen team's one budget amount, what is left, and per
// person per day). The prices are read with the viewer, and the read answers
// null to anyone else (getShoppingPricesFor, checked in @camp404/db): a
// member's page is built with no price in it at all.

/** Every team's budget, the Kitchen's among them (#242, #317). */
const KITCHEN_BUDGET_HREF = "/teams/budgets";

const NO_PRICE: LinePrice = {
  shop: null,
  amountCents: null,
  kind: "estimate",
  version: 0,
};

function linePrice(
  prices: ReadonlyMap<string, ShoppingPrice> | null,
  key: string,
): { price?: LinePrice } {
  if (!prices) return {};
  const p = prices.get(key);
  return {
    price: p
      ? {
          shop: p.shop,
          amountCents: p.amountCents,
          kind: p.kind,
          version: p.version,
        }
      : NO_PRICE,
  };
}

export default async function ShoppingListPage() {
  const { rank, campUser } = await captainPageGate("camp_member");
  const [{ plan, menu, snacks, ticks }, priceRows] = await Promise.all([
    getShoppingFacts(),
    getShoppingPricesFor(campUser.id),
  ]);
  const prices = priceRows ? new Map(priceRows.map((p) => [p.key, p])) : null;
  const list = buildShoppingList({
    days: plan.days,
    menu: menu.items,
    recipes: menu.recipes,
  });
  const tickedAt = new Map(ticks.map((t) => [t.key, t.amount]));
  const dayName = (day: number) => mealPlanDayLabel(plan.firstDay, day);

  const tickState = (key: string, amount: string) => {
    const at = tickedAt.get(key);
    return {
      ticked: at === amount,
      tickedWhen: at !== undefined && at !== amount ? at : null,
    };
  };

  const groups: ShoppingGroupView[] = list.groups.map((group) => ({
    id: group.category,
    label: CATEGORY_LABEL[group.category],
    lines: group.lines.map((line) => {
      const amount = shoppingAmountLabel(line.amount);
      return {
        key: line.key,
        name: line.name,
        amount,
        buy: shoppingBuyLabel(line.amount),
        sources: line.sources.map((s) => ({
          meal: `${dayName(s.day)}, ${s.meal}`,
          title: s.title,
          plates: platesLabel(s.plates),
          amount: shoppingAmountLabel(s.amount),
          href: `${recipePath(s.recipeId)}?plates=${s.plates}`,
        })),
        ...tickState(line.key, amount),
        ...linePrice(prices, line.key),
      };
    }),
  }));
  if (snacks.length > 0) {
    groups.push({
      id: "snacks",
      label: "Snacks",
      lines: snacks.map((snack) => {
        const key = snackKey(snack.id);
        const amount = snack.amount ?? "";
        return {
          key,
          name: snack.name,
          amount,
          sources: [],
          ...tickState(key, amount),
          ...linePrice(prices, key),
        };
      }),
    });
  }

  const empty = groups.length === 0 && list.notCounted.length === 0;

  // The food cost, for the same people as the prices.
  let costBox = null;
  if (prices) {
    const budgets = await listBudgetTotals(await ledgerCycle());
    const budgetCents = budgets.kitchen?.budgetCents ?? null;
    const cost = foodCost(
      groups.flatMap((g) =>
        g.lines.map((l) => ({
          name: l.name,
          amountCents: l.price?.amountCents ?? null,
          kind: l.price?.kind ?? "estimate",
        })),
      ),
    );
    const days = personDays(plan.days);
    costBox = (
      <FoodCostBox
        cost={cost}
        budgetCents={budgetCents}
        budgetHref={KITCHEN_BUDGET_HREF}
        perPersonDayCents={costPerPersonDay(cost.totalCents, days)}
        personDays={days}
        bar={costBar(cost, budgetCents)}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeading
        eyebrow="Kitchen"
        title="Shopping list"
        description={
          empty
            ? undefined
            : `From ${list.meals} meal${list.meals === 1 ? "" : "s"} on the menu. Ticks are shared: everyone sees what is already bought.`
        }
        actions={
          // What is still to buy, on A4 (#249): by shop with prices for a
          // captain or a Kitchen lead, by shop area for everyone else.
          <Button asChild variant="outline">
            <Link href={SHOPPING_PRINT_PATH} target="_blank" rel="noopener">
              <Printer aria-hidden />
              Print list
            </Link>
          </Button>
        }
      />

      {list.notCounted.length > 0 && (
        <NotCountedBox
          items={list.notCounted.map((n) => ({
            key: `${n.day}:${n.meal}:${n.recipeId}`,
            title: n.title,
            meta: `${dayName(n.day)}, ${n.meal} · ${platesLabel(n.plates)}`,
            href: `${recipePath(n.recipeId)}?plates=${n.plates}`,
          }))}
        />
      )}

      {empty ? (
        <p className="text-sm text-muted-foreground">
          Nothing to buy yet. Put recipes on the{" "}
          <Link href={MEAL_PLAN_PATH} className="underline">
            meal plan
          </Link>{" "}
          to fill the list.
        </p>
      ) : (
        <ShoppingListView
          groups={groups}
          canTick={canTickShoppingList(rank)}
          above={costBox}
        />
      )}
    </div>
  );
}
