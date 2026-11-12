import {
  allergenFlags,
  buildShoppingList,
  mealPlanDayLabel,
  mealPlates,
  planCovers,
  snackKey,
} from "@camp404/core";
import { MEALS } from "@camp404/types";
import type {
  MealChecks,
  MenuDietary,
  ShoppingFacts,
} from "@/lib/kitchen-menu";
import {
  MEAL_PLAN_PATH,
  RECIPES_PATH,
  SHOPPING_LIST_PATH,
} from "@/lib/recipe-copy";
import { shoppingAmountLabel } from "@/lib/recipe-labels";
import {
  ATTENTION_LIMIT,
  plural,
  type GlanceAttention,
  type GlanceTile,
  type TeamGlance,
} from "@/lib/team-glance";

// The Kitchen's panel on its team page (approved mock-up,
// docs/plans/2026-11-12-team-dashboards-mockup.html): how much of the year's
// menu is planned, what waits on a reviewer, how far the shopping is, and,
// for a captain or a Kitchen lead only, the meals that hold something an
// anaphylactic member coming cannot eat with no plan recorded. Worked out with
// the meal plan's and the shopping list's own calculations, so the panel and
// those pages never disagree. Counts and days only: no member, no food named.

const REVIEW_PATH = "/kitchen/recipes/review";

const MEAL_WORD = { breakfast: "breakfast", dinner: "dinner" } as const;

export interface KitchenGlanceInput {
  now: Date;
  facts: ShoppingFacts;
  /** Suggestions to decide plus proofread recipes to accept. */
  reviewWaiting: number;
  /** A captain or a Kitchen lead (KITCHEN_REVIEWER): the Review link is theirs. */
  canReview: boolean;
  /** A captain's or a Kitchen lead's view: the counts and the plans. */
  allergy: { dietary: MenuDietary; plans: MealChecks["plans"] } | null;
}

export function kitchenGlance(input: KitchenGlanceInput): TeamGlance {
  const { facts } = input;
  const { plan, menu } = facts;
  const dayName = (day: number) =>
    mealPlanDayLabel(plan.firstDay, day).split(" · ")[0]!;

  // The meals the plan feeds: a day's breakfast or dinner with plates on it.
  // A recipe left on a meal whose plates went to 0 feeds nobody, so it counts
  // nowhere here (the shopping list adds nothing for it either).
  const items = menu.items.filter(
    (i) =>
      i.day <= plan.daysOnSite &&
      menu.recipes[i.recipeId] &&
      mealPlates(plan.days, i.day, i.meal) > 0,
  );
  const meals: { day: number; meal: (typeof MEALS)[number] }[] = [];
  for (let day = 1; day <= plan.daysOnSite; day++) {
    for (const meal of MEALS) {
      if (mealPlates(plan.days, day, meal) > 0) meals.push({ day, meal });
    }
  }
  const empty = meals.filter(
    (m) => !items.some((i) => i.day === m.day && i.meal === m.meal),
  );
  const planned = meals.length - empty.length;

  // The shopping list, as /kitchen/shopping works it out, ticks included.
  const list = buildShoppingList({
    days: plan.days,
    menu: menu.items,
    recipes: menu.recipes,
  });
  const tickedAt = new Map(facts.ticks.map((t) => [t.key, t.amount]));
  const lineTicks = [
    ...list.groups.flatMap((g) =>
      g.lines.map((l) => tickedAt.get(l.key) === shoppingAmountLabel(l.amount)),
    ),
    ...facts.snacks.map(
      (s) => tickedAt.get(snackKey(s.id)) === (s.amount ?? ""),
    ),
  ];
  const ticked = lineTicks.filter(Boolean).length;

  // Meals with a recipe someone coming is anaphylactic to and no plan for it.
  let missingPlans: { day: number; meal: (typeof MEALS)[number] }[] | null =
    null;
  if (input.allergy) {
    const { dietary, plans } = input.allergy;
    missingPlans = [];
    for (const item of items) {
      const recipe = menu.recipes[item.recipeId]!;
      const flags = allergenFlags(recipe.allergens, dietary.counts);
      const covers = planCovers(
        plans.find((p) => p.menuItemId === item.id)?.allergens ?? null,
        flags.red,
      );
      if (
        !covers &&
        !missingPlans.some((m) => m.day === item.day && m.meal === item.meal)
      ) {
        missingPlans.push({ day: item.day, meal: item.meal });
      }
    }
  }

  const tiles: GlanceTile[] = [
    {
      key: "meals",
      label: "Meals with a recipe",
      value: meals.length === 0 ? "—" : `${planned} of ${meals.length}`,
      hint:
        meals.length === 0
          ? "No plates on the meal plan yet"
          : empty.length === 0
            ? "Every meal has a recipe"
            : `${plural(empty.length, "meal")} still empty`,
      ...(meals.length > 0
        ? { progress: { value: planned, max: meals.length } }
        : {}),
    },
    {
      key: "review",
      label: "Recipes to review",
      value: String(input.reviewWaiting),
      hint:
        input.reviewWaiting === 0
          ? "Nothing waiting"
          : "waiting for a Kitchen lead",
      ...(input.reviewWaiting > 0 ? { tone: "warn" as const } : {}),
    },
    {
      key: "shopping",
      label: "Shopping ticked",
      value: lineTicks.length === 0 ? "—" : `${ticked} of ${lineTicks.length}`,
      hint:
        lineTicks.length === 0
          ? "Nothing on the list yet"
          : "on the shared list",
      ...(lineTicks.length > 0
        ? { progress: { value: ticked, max: lineTicks.length } }
        : {}),
    },
  ];
  if (missingPlans) {
    tiles.push({
      key: "allergy",
      label: "Allergy plans",
      value:
        missingPlans.length === 0
          ? "All set"
          : `${missingPlans.length} missing`,
      hint:
        missingPlans.length === 0
          ? "No meal needs a plan"
          : "a meal someone coming can't eat",
      tone: missingPlans.length === 0 ? "ok" : "bad",
    });
  }

  const mealPlan = { href: MEAL_PLAN_PATH, label: "Meal plan" };
  const attention: GlanceAttention[] = [
    ...(missingPlans ?? []).map((m) => ({
      key: `plan-${m.day}-${m.meal}`,
      tone: "bad" as const,
      text: `${dayName(m.day)} ${MEAL_WORD[m.meal]}: no allergy plan for an anaphylactic member.`,
      link: mealPlan,
    })),
    ...empty.map((m) => ({
      key: `empty-${m.day}-${m.meal}`,
      tone: "warn" as const,
      text: `${dayName(m.day)} ${MEAL_WORD[m.meal]} has no recipe yet.`,
      link: mealPlan,
    })),
  ];
  if (list.notCounted.length > 0) {
    attention.push({
      key: "not-counted",
      tone: "warn",
      text: `${plural(list.notCounted.length, "recipe is", "recipes are")} not counted for their meal's plates yet.`,
      link: { href: SHOPPING_LIST_PATH, label: "Shopping list" },
    });
  }
  if (input.reviewWaiting > 0) {
    attention.push({
      key: "review",
      tone: "warn",
      text: `${plural(input.reviewWaiting, "recipe is", "recipes are")} waiting for review.`,
      // Only a reviewer may open the review page; everyone else sees the count.
      ...(input.canReview
        ? { link: { href: REVIEW_PATH, label: "Review" } }
        : {}),
    });
  }
  // No prep steps here (owner, 2026-11-12: "I dont like the prep steps
  // thing at all"); the meal plan holds them.
  const shown = attention.slice(0, ATTENTION_LIMIT);

  return {
    title: "Kitchen at a glance",
    tiles,
    attention: shown,
    links: [
      mealPlan,
      { href: SHOPPING_LIST_PATH, label: "Shopping list" },
      { href: RECIPES_PATH, label: "Recipe book" },
    ],
    ...(input.allergy
      ? {}
      : { note: "Allergy plans are for the Kitchen leads and captains." }),
  };
}
