import Link from "next/link";
import {
  buildShoppingList,
  canTickShoppingList,
  mealPlanDayLabel,
  snackKey,
  sourcesSummary,
  type ShoppingAmount,
} from "@camp404/core";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getShoppingFacts } from "@/lib/kitchen-menu";
import { MEAL_PLAN_PATH, recipePath } from "@/lib/recipe-copy";
import { CATEGORY_LABEL, formatAmount, platesLabel } from "@/lib/recipe-labels";
import { ShoppingListView, type ShoppingGroupView } from "./shopping-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shopping list — Camp 404" };

// The Kitchen's shopping list (#245, the owner's layout A, 2026-09-30): one
// list grouped by shop area, like Noble Notations' list, worked out on every
// load from the menu inside the meal plan. For each recipe on a meal, the
// plate count Claude proofread for that meal's plates, added up by
// ingredient and unit; each line opens to show where its amount comes from.
// A recipe whose count is not verified yet is listed at the top, "Not
// counted yet: proofread first", and adds nothing: it is never guessed.
// Snacks come last, as typed.
//
// Every approved member reads it and may tick (the owner: ticks are shared
// by the whole camp, and any member may tick). No prices, suppliers, stock or
// allergen check: each is its own step, not asked for yet.

const MEAL_WORD = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };

/** "2.5 kg", "1–1.5 kg", "10 g + to taste", "To taste". */
function amountLabel(amount: ShoppingAmount): string {
  const main = formatAmount(amount.quantity, amount.quantityMax, amount.unit);
  if (!main) return "To taste";
  return amount.toTaste ? `${main} + to taste` : main;
}

export default async function ShoppingListPage() {
  const { rank } = await captainPageGate("camp_member");
  const { plan, menu, snacks, ticks } = await getShoppingFacts();
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
      const amount = amountLabel(line.amount);
      return {
        key: line.key,
        name: line.name,
        amount,
        summary: sourcesSummary(line.sources),
        sources: line.sources.map((s) => ({
          meal: `${dayName(s.day)}, ${MEAL_WORD[s.meal]}`,
          title: s.title,
          plates: platesLabel(s.plates),
          amount: amountLabel(s.amount),
          href: `${recipePath(s.recipeId)}?plates=${s.plates}`,
        })),
        ...tickState(line.key, amount),
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
          summary: "",
          sources: [],
          ...tickState(key, amount),
        };
      }),
    });
  }

  const empty = groups.length === 0 && list.notCounted.length === 0;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeading
        eyebrow="Kitchen"
        title="Shopping list"
        description={
          empty
            ? undefined
            : `From ${list.meals} meal${list.meals === 1 ? "" : "s"} on the menu.`
        }
      />

      {list.notCounted.length > 0 && (
        <section
          aria-labelledby="not-counted-heading"
          className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4"
        >
          <h2 id="not-counted-heading" className="text-sm font-semibold">
            Not counted yet: proofread first
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {list.notCounted.map((n) => (
              <li key={`${n.day}:${n.meal}:${n.recipeId}`}>
                <Link
                  href={`${recipePath(n.recipeId)}?plates=${n.plates}`}
                  className="font-medium hover:underline"
                >
                  {n.title}
                </Link>{" "}
                <span className="text-muted-foreground">
                  {dayName(n.day)}, {MEAL_WORD[n.meal]} ·{" "}
                  {platesLabel(n.plates)}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
        <ShoppingListView groups={groups} canTick={canTickShoppingList(rank)} />
      )}
    </div>
  );
}
