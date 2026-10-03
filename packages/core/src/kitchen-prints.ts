import type { MealOfTheDay, MealPlanDay } from "@camp404/types";
import { addDays } from "./kitchen-prep";
import { mealPlates, sortMenu, type MenuEntry } from "./kitchen-menu";
import { sumMinor } from "./money";

// The Kitchen's A4 prints (#249; the owner approved Option A of each in
// design/prints-round.html, 2026-10-02): the shopping list by shop, the
// recipe book and the prep plan. Pure: no DB, no session, no next/*. The
// pages read the facts on the server and lay them out from here, so the
// grouping, the totals and the page numbers are tested without a browser.

const MEAL_ORDER: Record<MealOfTheDay, number> = { breakfast: 0, dinner: 1 };

// --- Shopping list by shop ----------------------------------------------------

/** What the shop grouping needs of a shopping line. */
export interface ShopPricedLine {
  /** The shop a captain or a Kitchen lead gave it; null or blank: none yet. */
  shop: string | null;
  /** Its price in cents, or null when it has none. */
  amountCents: number | null;
}

export interface ShopGroup<L> {
  /** The shop as first typed, or null for "No shop yet". */
  shop: string | null;
  /** In the order they came (the list's shop-area order). */
  lines: L[];
  /** Every price in the shop added up, in cents. */
  totalCents: number;
}

export interface ShoppingByShop<L> {
  /** The shop with the most lines first; "No shop yet" always last. */
  shops: ShopGroup<L>[];
  /** Every price on the sheet added up, in cents. */
  totalCents: number;
}

/**
 * The shopping lines grouped by shop, for whoever does the shopping (Option
 * A): one block per shop with its total to bring, the busiest shop first,
 * lines with no shop last. Shop names match whatever their case or spacing.
 * Lines keep the order they came in, so a shop's lines stay in shop-area
 * order. Money is whole cents, added with sumMinor.
 */
export function shoppingByShop<L extends ShopPricedLine>(
  lines: readonly L[],
): ShoppingByShop<L> {
  const named = new Map<string, { shop: string; lines: L[] }>();
  const none: L[] = [];
  for (const line of lines) {
    const shop = line.shop?.trim().replace(/\s+/g, " ") ?? "";
    if (!shop) {
      none.push(line);
      continue;
    }
    const key = shop.toLowerCase();
    const group = named.get(key) ?? { shop, lines: [] };
    group.lines.push(line);
    named.set(key, group);
  }
  const total = (ls: readonly L[]) =>
    sumMinor(
      ls.flatMap((l) => (l.amountCents === null ? [] : [l.amountCents])),
    );
  const shops: ShopGroup<L>[] = [...named.values()]
    .sort(
      (a, b) =>
        b.lines.length - a.lines.length ||
        a.shop.localeCompare(b.shop, "en", { sensitivity: "base" }),
    )
    .map((g) => ({ shop: g.shop, lines: g.lines, totalCents: total(g.lines) }));
  if (none.length > 0) {
    shops.push({ shop: null, lines: none, totalCents: total(none) });
  }
  return { shops, totalCents: total(lines) };
}

// --- Recipe book --------------------------------------------------------------

/** What the book needs to know about a recipe on the menu. */
export interface BookRecipe {
  title: string;
  /** The plate counts its book version has a checked recipe for. */
  plates: readonly number[];
}

/** A dish on the contents page. */
export interface BookContentsEntry {
  recipeId: string;
  title: string;
  plates: number;
  /** Its page, or null: no checked recipe for these plates, not in the book. */
  page: number | null;
}

export interface BookContentsMeal {
  meal: MealOfTheDay;
  entries: BookContentsEntry[];
}

export interface BookContentsDay {
  day: number;
  meals: BookContentsMeal[];
}

/** One recipe page: a recipe at one plate count, and the meals it serves. */
export interface BookPage {
  page: number;
  recipeId: string;
  title: string;
  plates: number;
  /** Every meal it is cooked for at this count, in menu order. */
  meals: { day: number; meal: MealOfTheDay }[];
}

export interface RecipeBook {
  contents: BookContentsDay[];
  pages: BookPage[];
  /** Contents and recipe pages together. */
  pageCount: number;
}

/** The contents is page 1; the recipes start on page 2. */
export const BOOK_FIRST_RECIPE_PAGE = 2;

/**
 * The recipe book (Option A): the contents (the menu by day and meal, each
 * dish with its page), then one page per recipe at each plate count it is
 * cooked for, so every amount on a page is the one to cook. A dish cooked
 * twice at the same count shares one page; at two counts it gets two, side by
 * side. Pages follow the menu: a recipe's pages come where it is first
 * cooked. A dish with no checked recipe for its plates is in the contents
 * with no page (food does not scale by multiplying, so nothing is worked out).
 * A meal with no plates, or a day past the days on site, is left out.
 */
export function recipeBook(input: {
  days: readonly MealPlanDay[];
  menu: readonly MenuEntry[];
  recipes: Readonly<Record<string, BookRecipe>>;
}): RecipeBook {
  const served: {
    entry: MenuEntry;
    recipe: BookRecipe;
    plates: number;
  }[] = [];
  for (const entry of sortMenu(input.menu)) {
    const recipe = input.recipes[entry.recipeId];
    if (!recipe) continue;
    const plates = mealPlates(input.days, entry.day, entry.meal);
    if (plates <= 0) continue;
    served.push({ entry, recipe, plates });
  }

  // Each recipe's counts, in order of first appearance; a recipe's counts
  // sit together.
  const order: string[] = [];
  const counts = new Map<string, number[]>();
  for (const { entry, recipe, plates } of served) {
    if (!recipe.plates.includes(plates)) continue;
    const seen = counts.get(entry.recipeId);
    if (!seen) {
      order.push(entry.recipeId);
      counts.set(entry.recipeId, [plates]);
    } else if (!seen.includes(plates)) {
      seen.push(plates);
    }
  }
  const pages: BookPage[] = [];
  const pageOf = new Map<string, number>();
  for (const recipeId of order) {
    for (const plates of counts.get(recipeId)!) {
      const page = BOOK_FIRST_RECIPE_PAGE + pages.length;
      pageOf.set(`${recipeId}:${plates}`, page);
      pages.push({
        page,
        recipeId,
        title: input.recipes[recipeId]!.title,
        plates,
        meals: served
          .filter((s) => s.entry.recipeId === recipeId && s.plates === plates)
          .map((s) => ({ day: s.entry.day, meal: s.entry.meal })),
      });
    }
  }

  const contents: BookContentsDay[] = [];
  for (const { entry, recipe, plates } of served) {
    let day = contents.at(-1);
    if (!day || day.day !== entry.day) {
      day = { day: entry.day, meals: [] };
      contents.push(day);
    }
    let meal = day.meals.at(-1);
    if (!meal || meal.meal !== entry.meal) {
      meal = { meal: entry.meal, entries: [] };
      day.meals.push(meal);
    }
    meal.entries.push({
      recipeId: entry.recipeId,
      title: recipe.title,
      plates,
      page: pageOf.get(`${entry.recipeId}:${plates}`) ?? null,
    });
  }

  return { contents, pages, pageCount: pages.length + 1 };
}

/**
 * The meals a recipe page is cooked for, in words: "Day 2 and Day 6
 * breakfast", "Day 1 dinner and Day 3 breakfast", "Day 1, Day 4 and Day 8
 * dinner". Meals of a kind together, in the order they first come.
 */
export function servedText(
  meals: readonly { day: number; meal: MealOfTheDay }[],
): string {
  const byMeal = new Map<MealOfTheDay, number[]>();
  for (const m of meals) {
    const days = byMeal.get(m.meal) ?? [];
    if (!days.includes(m.day)) days.push(m.day);
    byMeal.set(m.meal, days);
  }
  return andList(
    [...byMeal].map(
      ([meal, days]) => `${andList(days.map((d) => `Day ${d}`))} ${meal}`,
    ),
  );
}

/** "a", "a and b", "a, b and c". */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// --- Prep plan ------------------------------------------------------------------

/** A prep step as the plan prints it (the daily sheet's SheetPrepStep). */
export interface PlanPrepStep {
  /** YYYY-MM-DD */
  dueDate: string;
  what: string;
  recipeTitle: string;
  /** The day and meal it is for. */
  day: number;
  meal: MealOfTheDay;
}

export interface PrepPlanDate<S> {
  /** YYYY-MM-DD */
  date: string;
  steps: S[];
}

export interface PrepPlanDay<S> extends PrepPlanDate<S> {
  /** Day on site, 1 for Day 1. */
  day: number;
}

export interface PrepPlan<S> {
  /** Steps due before Day 1, by date: only the dates that have steps. */
  before: PrepPlanDate<S>[];
  /** Every day on site, Day 1 first, with nothing to prep or not. */
  onSite: PrepPlanDay<S>[];
  /** How many steps are before we leave, and on site. */
  beforeCount: number;
  onSiteCount: number;
}

/**
 * The prep plan (Option A): "Before we leave" by date (only the dates with a
 * step), then each day on site in order, a day with nothing to prep
 * included. Within a date, steps go in the order of the meal they are for
 * (day, then breakfast before dinner), then as they came. A step due after
 * the last day on site goes on the last day, so nothing is lost. With no Day
 * 1 date there are no days on site to put steps under, so every step is
 * listed by date under "Before we leave".
 */
export function prepPlan<S extends PlanPrepStep>(input: {
  steps: readonly S[];
  firstDay: string | null;
  daysOnSite: number;
}): PrepPlan<S> {
  const sorted = input.steps
    .map((step, i) => ({ step, i }))
    .sort(
      (a, b) =>
        a.step.dueDate.localeCompare(b.step.dueDate) ||
        a.step.day - b.step.day ||
        MEAL_ORDER[a.step.meal] - MEAL_ORDER[b.step.meal] ||
        a.i - b.i,
    )
    .map(({ step }) => step);
  const first =
    input.firstDay && addDays(input.firstDay, 0) !== null
      ? input.firstDay
      : null;

  const onSite: PrepPlanDay<S>[] = [];
  if (first) {
    for (let day = 1; day <= Math.max(0, input.daysOnSite); day++) {
      onSite.push({ day, date: addDays(first, day - 1)!, steps: [] });
    }
  }
  const before: PrepPlanDate<S>[] = [];
  for (const step of sorted) {
    if (!first || step.dueDate < first) {
      const last = before.at(-1);
      if (last && last.date === step.dueDate) last.steps.push(step);
      else before.push({ date: step.dueDate, steps: [step] });
      continue;
    }
    const day =
      onSite.find((d) => d.date === step.dueDate) ?? onSite.at(-1) ?? null;
    if (day) day.steps.push(step);
    else before.push({ date: step.dueDate, steps: [step] });
  }
  const count = (ds: readonly PrepPlanDate<S>[]) =>
    ds.reduce((n, d) => n + d.steps.length, 0);
  return {
    before,
    onSite,
    beforeCount: count(before),
    onSiteCount: count(onSite),
  };
}
