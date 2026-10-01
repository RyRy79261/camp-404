import {
  INGREDIENT_CATEGORIES,
  ViewerRank,
  type IngredientCategory,
  type MealOfTheDay,
  type MealPlanDay,
  type RecipeLineUnit,
} from "@camp404/types";

// The Kitchen's menu (#244) and shopping list (#245), as the owner approved
// them on 2026-09-30. Pure: no DB, no session, no next/*.
//
// WHO MAY ACT. The menu and the snacks are edited by the people who edit the
// meal plan (canEditMealPlan: a captain or a Kitchen lead). The shopping
// list's ticks are shared by the whole camp, and any approved member may tick
// (canTickShoppingList).
//
// THE LIST. Food does not scale by multiplying (AGENTS.md), so the list does
// no scaling maths: for each recipe on the menu it reads the recipe's plate
// count for that meal's plates, as Claude proofread it (recipe_plate_counts),
// and adds the lines up by ingredient and unit. A recipe whose count is not
// there yet is listed as "not counted yet", never guessed. The only
// arithmetic is adding, and grams to kilograms (millilitres to litres), which
// is a unit, not a recipe.

/**
 * Whether someone may tick the shopping list: any approved member (the
 * owner, 2026-09-30). Fails closed on a rank this module does not know.
 */
export function canTickShoppingList(rank: string): boolean {
  return ViewerRank.safeParse(rank).success;
}

/** A snack's tick key. */
export function snackKey(snackId: string): string {
  return `snack:${snackId}`;
}

/** Units that add up in a smaller one: 1 kg is 1000 g, 1 l is 1000 ml. */
const BASE_UNIT: Partial<
  Record<RecipeLineUnit, { unit: RecipeLineUnit; factor: number }>
> = {
  kg: { unit: "g", factor: 1000 },
  l: { unit: "ml", factor: 1000 },
};

/** The bigger unit a total reads better in, from 1000 of the base up. */
const BIGGER_UNIT: Partial<Record<RecipeLineUnit, RecipeLineUnit>> = {
  g: "kg",
  ml: "l",
};

function baseOf(unit: RecipeLineUnit | null): {
  unit: RecipeLineUnit | null;
  factor: number;
} {
  if (unit === null) return { unit: null, factor: 1 };
  return BASE_UNIT[unit] ?? { unit, factor: 1 };
}

/** "onions" reads "Onions" at the head of a line. */
function capitalised(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const lower = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * A shopping line's key: the ingredient's name (any case) and its unit
 * family, so "Onions, 2 kg" and "onions, 500 g" are one line, and "Onions,
 * 3 pieces" another. The ticks are stored under it.
 */
export function shoppingKey(name: string, unit: RecipeLineUnit | null): string {
  return `${lower(name)}|${baseOf(unit).unit ?? ""}`;
}

/** One line of a recipe's plate count, as recipe_plate_counts keeps it. */
export interface CountLine {
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: RecipeLineUnit | null;
}

/** What the list needs to know about a recipe on the menu. */
export interface MenuRecipe {
  title: string;
  /** Each ingredient line's shop area, in the recipe's line order. */
  categories: readonly IngredientCategory[];
  /** The plate counts its book version has, with their lines. */
  counts: readonly { plates: number; lines: readonly CountLine[] }[];
}

/** A recipe on one meal of the menu. */
export interface MenuEntry {
  day: number;
  meal: MealOfTheDay;
  position: number;
  recipeId: string;
}

/** An amount as it reads: a total and its unit, with "to taste" alongside. */
export interface ShoppingAmount {
  /** Null when every source is "to taste". */
  quantity: number | null;
  /** The upper end, when a source gave a range; otherwise null. */
  quantityMax: number | null;
  unit: RecipeLineUnit | null;
  /** Some source gives no amount ("to taste"). */
  toTaste: boolean;
}

/** Where some of a line's amount comes from: one recipe on one meal. */
export interface ShoppingSource {
  day: number;
  meal: MealOfTheDay;
  recipeId: string;
  title: string;
  plates: number;
  amount: ShoppingAmount;
}

export interface ShoppingLine {
  key: string;
  name: string;
  amount: ShoppingAmount;
  /** In menu order: day, then meal, then the order on the meal. */
  sources: ShoppingSource[];
}

export interface ShoppingGroup {
  category: IngredientCategory;
  lines: ShoppingLine[];
}

/** A recipe on the menu the list cannot count, and why. */
export interface NotCounted {
  day: number;
  meal: MealOfTheDay;
  recipeId: string;
  title: string;
  /** The meal's plates: the count that needs proofreading. */
  plates: number;
}

export interface ShoppingList {
  /** Shop areas in INGREDIENT_CATEGORIES order; empty ones left out. */
  groups: ShoppingGroup[];
  /** Menu recipes with no count for their meal's plates yet. */
  notCounted: NotCounted[];
  /** How many meals (a day's breakfast or dinner) the list is from. */
  meals: number;
}

const MEAL_ORDER: Record<MealOfTheDay, number> = {
  breakfast: 0,
  dinner: 1,
};

/** The menu in reading order: day, meal, then the order on the meal. */
export function sortMenu<E extends MenuEntry>(entries: readonly E[]): E[] {
  return [...entries].sort(
    (a, b) =>
      a.day - b.day ||
      MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal] ||
      a.position - b.position,
  );
}

/** A meal's plates on the plan, or 0 for a day past the days on site. */
export function mealPlates(
  days: readonly MealPlanDay[],
  day: number,
  meal: MealOfTheDay,
): number {
  return days[day - 1]?.[meal] ?? 0;
}

/** Running sum in a base unit. */
interface Sum {
  low: number;
  high: number;
  hasAmount: boolean;
  ranged: boolean;
  toTaste: boolean;
}

const emptySum = (): Sum => ({
  low: 0,
  high: 0,
  hasAmount: false,
  ranged: false,
  toTaste: false,
});

function addLine(sum: Sum, line: CountLine): void {
  if (line.quantity === null) {
    sum.toTaste = true;
    return;
  }
  const { factor } = baseOf(line.unit);
  const low = line.quantity * factor;
  const high = (line.quantityMax ?? line.quantity) * factor;
  sum.low += low;
  sum.high += high;
  sum.hasAmount = true;
  if (high !== low) sum.ranged = true;
}

/** A sum in the unit it reads best in: 1500 g as 1.5 kg. */
function amountOf(sum: Sum, baseUnit: RecipeLineUnit | null): ShoppingAmount {
  if (!sum.hasAmount) {
    return { quantity: null, quantityMax: null, unit: baseUnit, toTaste: true };
  }
  const bigger = baseUnit ? BIGGER_UNIT[baseUnit] : undefined;
  const top = Math.max(sum.low, sum.high);
  const [unit, divisor] =
    bigger && top >= 1000 ? [bigger, 1000] : [baseUnit, 1];
  return {
    quantity: sum.low / divisor,
    quantityMax: sum.ranged ? sum.high / divisor : null,
    unit,
    toTaste: sum.toTaste,
  };
}

/**
 * The shopping list for the menu: every recipe on a meal with plates, read at
 * that meal's plates from the counts its book version has, added up by
 * ingredient and unit and grouped by shop area. A recipe with no count for
 * its meal's plates is listed in `notCounted` and adds nothing. A recipe on a
 * meal with no plates (0, or a day past the days on site) is not on the list.
 */
export function buildShoppingList(input: {
  days: readonly MealPlanDay[];
  menu: readonly MenuEntry[];
  recipes: Readonly<Record<string, MenuRecipe>>;
}): ShoppingList {
  const lines = new Map<
    string,
    {
      name: string;
      category: IngredientCategory;
      baseUnit: RecipeLineUnit | null;
      sum: Sum;
      sources: (ShoppingSource & { order: number })[];
    }
  >();
  const notCounted: NotCounted[] = [];
  const meals = new Set<string>();
  const found: {
    order: number;
    entry: MenuEntry;
    recipe: MenuRecipe;
    plates: number;
    line: CountLine;
    category: IngredientCategory;
  }[] = [];

  sortMenu(input.menu).forEach((entry, order) => {
    const recipe = input.recipes[entry.recipeId];
    if (!recipe) return;
    const plates = mealPlates(input.days, entry.day, entry.meal);
    if (plates <= 0) return;
    const count = recipe.counts.find((c) => c.plates === plates);
    if (!count) {
      notCounted.push({
        day: entry.day,
        meal: entry.meal,
        recipeId: entry.recipeId,
        title: recipe.title,
        plates,
      });
      return;
    }
    meals.add(`${entry.day}:${entry.meal}`);
    count.lines.forEach((line, index) => {
      found.push({
        order,
        entry,
        recipe,
        plates,
        line,
        category: recipe.categories[index] ?? "other",
      });
    });
  });

  // Lines with an amount first, so a "to taste" line (which has no unit to
  // go by) joins the line of the same name when there is one.
  const withAmount = found.filter((f) => f.line.quantity !== null);
  const toTaste = found.filter((f) => f.line.quantity === null);
  for (const f of [...withAmount, ...toTaste]) {
    const { line } = f;
    let key = shoppingKey(line.name, line.unit);
    if (line.quantity === null && !lines.has(key)) {
      const name = lower(line.name);
      key =
        [...lines.keys()].find(
          (k) => k.slice(0, k.lastIndexOf("|")) === name,
        ) ?? key;
    }
    let row = lines.get(key);
    if (!row) {
      row = {
        name: capitalised(line.name),
        category: f.category,
        baseUnit: baseOf(line.unit).unit,
        sum: emptySum(),
        sources: [],
      };
      lines.set(key, row);
    }
    addLine(row.sum, line);
    const own = emptySum();
    addLine(own, line);
    row.sources.push({
      order: f.order,
      day: f.entry.day,
      meal: f.entry.meal,
      recipeId: f.entry.recipeId,
      title: f.recipe.title,
      plates: f.plates,
      amount: amountOf(own, baseOf(line.unit).unit),
    });
  }

  const groups: ShoppingGroup[] = INGREDIENT_CATEGORIES.map((category) => ({
    category,
    lines: [...lines.entries()]
      .filter(([, row]) => row.category === category)
      .map(([key, row]) => ({
        key,
        name: row.name,
        amount: amountOf(row.sum, row.baseUnit),
        sources: [...row.sources]
          .sort((a, b) => a.order - b.order)
          .map(({ order: _order, ...source }) => source),
      }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
          a.key.localeCompare(b.key),
      ),
  })).filter((group) => group.lines.length > 0);

  return { groups, notCounted, meals: meals.size };
}
