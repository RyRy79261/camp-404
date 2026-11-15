import { formatMoney, mealPlanDayLabel, menuSlotProblem } from "@camp404/core";
import {
  ALLERGEN_LABELS,
  type KitchenAllergen,
  type PrepTiming,
} from "@camp404/types";
import {
  getKitchenMenu,
  getMealChecks,
  getSnacks,
  listMenuBook,
} from "../kitchen-menu";
import { getMealPlan } from "../meal-plan";
import { MEAL_PLAN_PATH, SHOPPING_LIST_PATH } from "../recipe-copy";
import { readShoppingLines } from "../mcp/tools/kitchen-plan";
import {
  blocked,
  dayLabel,
  listed,
  quote,
  shown,
  str,
  type Args,
  type PreviewFn,
} from "./preview-kit";

// The meal plan's and the shopping list's previews: each reads the real plan,
// menu item, snack or shopping line, writes the row from it, and fills in the
// compare-and-set value the tool takes (the plan's version, an allergy plan's
// version, a correction's revision and book version, a line's amount or price
// version) from what it read.

const foods = (list: unknown): string => {
  const names = Array.isArray(list)
    ? list.map((f) => ALLERGEN_LABELS[f as KitchenAllergen] ?? String(f))
    : [];
  return names.length === 0 ? "none" : names.join(", ");
};

const mealName = (firstDay: string | null, day: number, meal: string) =>
  `${mealPlanDayLabel(firstDay, day)} ${meal}`;

const WHEN: Record<PrepTiming, string> = {
  day_before: "the day before",
  same_day: "the same day",
  before_leaving: "before we leave",
};

/** A menu item of this year's menu, with its recipe's title and meal. */
async function findMenuItem(itemId: string) {
  const [plan, menu] = await Promise.all([getMealPlan(), getKitchenMenu()]);
  const item = menu.items.find((i) => i.id === itemId);
  if (!item) return null;
  return {
    item,
    title: menu.recipes[item.recipeId]?.title ?? "Untitled recipe",
    meal: mealName(plan.firstDay, item.day, item.meal),
  };
}

const goneItem = (sentence: string, args: Args) =>
  blocked(sentence, "That recipe isn't on the menu now.", args, MEAL_PLAN_PATH);

export const KITCHEN_PLAN_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_meal_plan_plates(args) {
    const plan = await getMealPlan();
    const days = Array.isArray(args.days)
      ? (args.days as {
          day?: number;
          breakfast?: number;
          dinner?: number;
        }[])
      : [];
    const change: string[] = [];
    for (const d of days) {
      const day = typeof d.day === "number" ? d.day : 0;
      const row = plan.days[day - 1];
      if (!row) {
        return blocked(
          "Change the plates on the meal plan",
          `Day ${day} isn't on the meal plan: it has ${plan.daysOnSite} days on site.`,
          args,
          MEAL_PLAN_PATH,
        );
      }
      const name = mealPlanDayLabel(plan.firstDay, day);
      for (const meal of ["breakfast", "dinner"] as const) {
        if (typeof d[meal] === "number") {
          change.push(`${name} ${meal}: ${row[meal]} → ${d[meal]} plates`);
        }
      }
    }
    return {
      sentence: `Change the plates on ${days.length} day${days.length === 1 ? "" : "s"} of the meal plan`,
      facts:
        "Kitchen · the other days stay as they are · a recipe needs a count for its new plates",
      change,
      path: MEAL_PLAN_PATH,
      args: { ...args, expectedVersion: plan.version },
      keys: ["meal-plan"],
    };
  },

  async add_menu_item(args) {
    const day = typeof args.day === "number" ? args.day : 0;
    const meal = str(args.meal);
    const [plan, book, menu] = await Promise.all([
      getMealPlan(),
      listMenuBook(),
      getKitchenMenu(),
    ]);
    const recipe = book.find((r) => r.id === str(args.recipeId));
    const sentence = recipe
      ? `Put ${quote(recipe.title)} on ${mealName(plan.firstDay, day, meal)}`
      : "Put a recipe on a meal";
    if (!recipe) {
      return blocked(
        sentence,
        "That recipe isn't in the recipe book.",
        args,
        MEAL_PLAN_PATH,
      );
    }
    const problem = menuSlotProblem(plan, day, meal);
    if (problem) return blocked(sentence, problem, args, MEAL_PLAN_PATH);
    if (
      menu.items.some(
        (i) => i.day === day && i.meal === meal && i.recipeId === recipe.id,
      )
    ) {
      return blocked(
        sentence,
        "That recipe is already on this meal.",
        args,
        MEAL_PLAN_PATH,
      );
    }
    const plates = plan.days[day - 1]?.[meal as "breakfast" | "dinner"] ?? 0;
    return {
      sentence,
      facts: `Kitchen · menu · ${plates} plates at that meal${recipe.readyPlates.includes(plates) ? "" : " · no count for those plates yet"}`,
      path: MEAL_PLAN_PATH,
      args,
      keys: [`meal:${day}:${meal}`],
    };
  },

  async remove_menu_item(args) {
    const found = await findMenuItem(str(args.itemId));
    if (!found) return goneItem("Take a recipe off a meal", args);
    const sentence = `Take ${quote(found.title)} off ${found.meal}`;
    const checks = await getMealChecks();
    if (
      checks.plans.some((p) => p.menuItemId === found.item.id) ||
      checks.prepSteps.some((s) => s.menuItemId === found.item.id)
    ) {
      return blocked(
        sentence,
        "It has prep steps or an allergy plan there: take it off on the website.",
        args,
        MEAL_PLAN_PATH,
      );
    }
    return {
      sentence,
      facts: "Kitchen · menu · putting it back is one tap",
      path: MEAL_PLAN_PATH,
      args,
      keys: [
        `menu-item:${found.item.id}`,
        `meal:${found.item.day}:${found.item.meal}`,
      ],
    };
  },

  async add_snack(args) {
    const amount = str(args.amount).trim();
    return {
      sentence: `Add the snack ${quote(str(args.name).trim())}${amount ? ` (${amount})` : ""}`,
      facts: "Kitchen · the year's snacks · it goes on the shopping list",
      path: MEAL_PLAN_PATH,
      args,
      keys: ["snacks"],
    };
  },

  async remove_snack(args) {
    const snack = (await getSnacks()).find((s) => s.id === str(args.snackId));
    if (!snack) {
      return blocked(
        "Take a snack off",
        "That snack isn't on the list now.",
        args,
        MEAL_PLAN_PATH,
      );
    }
    return {
      sentence: `Take the snack ${quote(snack.name)}${snack.amount ? ` (${snack.amount})` : ""} off`,
      facts: "Kitchen · the year's snacks",
      path: MEAL_PLAN_PATH,
      args,
      keys: [`snack:${snack.id}`, "snacks"],
    };
  },

  async record_allergen_plan(args) {
    const found = await findMenuItem(str(args.itemId));
    if (!found) return goneItem("Record an allergy plan", args);
    const plan =
      (await getMealChecks()).plans.find(
        (p) => p.menuItemId === found.item.id,
      ) ?? null;
    return {
      sentence: `${plan ? "Replace" : "Record"} the allergy plan for ${quote(found.title)} on ${found.meal}: ${str(args.kind) === "portion" ? "a separate portion" : "a substitution"}`,
      facts: `Kitchen · meal plan${plan ? ` · now: ${shown(plan.details)}` : ""}`,
      change: [
        `Plan: ${shown(args.details)}`,
        `Covers: ${foods(args.allergens)}`,
      ],
      path: MEAL_PLAN_PATH,
      args: { ...args, expectedVersion: plan?.version ?? 0 },
      keys: [`menu-item:${found.item.id}`],
    };
  },

  async correct_recipe_allergens(args) {
    const menu = await getKitchenMenu();
    const recipe = menu.recipes[str(args.recipeId)];
    if (!recipe?.versionId) {
      return blocked(
        "Correct a recipe's allergens",
        "That recipe isn't on this year's menu.",
        args,
        MEAL_PLAN_PATH,
      );
    }
    return {
      sentence: `Correct what ${quote(recipe.title)} holds`,
      facts: `Kitchen · the book's version · now: ${foods(recipe.allergens.map((a) => a.allergen))}`,
      change: [`Allergens: ${foods(args.allergens)}`],
      path: MEAL_PLAN_PATH,
      args: {
        ...args,
        versionId: recipe.versionId,
        expectedRevision: recipe.allergenRevision,
      },
      keys: [`recipe:${str(args.recipeId)}`],
    };
  },

  async add_prep_step(args) {
    const found = await findMenuItem(str(args.itemId));
    if (!found) return goneItem("Add a prep step", args);
    const when = str(args.when) as PrepTiming;
    const date = str(args.date);
    return {
      sentence: `Add a prep step to ${quote(found.title)} on ${found.meal}: ${shown(args.what)}`,
      facts: `Kitchen · ${WHEN[when] ?? when}${when === "before_leaving" && date ? `, ${dayLabel(date)} · it goes on the task board` : ""}`,
      path: MEAL_PLAN_PATH,
      args,
      keys: [`menu-item:${found.item.id}`],
    };
  },

  async set_shopping_ticks(args, ctx) {
    const ticked = args.ticked !== false;
    const given = Array.isArray(args.lines)
      ? (args.lines as { key?: unknown }[]).map((l) => str(l.key))
      : [];
    const now = new Map(
      (await readShoppingLines(ctx.scope.campUserId)).map((l) => [l.key, l]),
    );
    const sentence = `${ticked ? "Tick" : "Untick"} ${given.length} line${given.length === 1 ? "" : "s"} of the shopping list`;
    const lines = given.map((key) => now.get(key));
    if (lines.some((l) => !l)) {
      return blocked(
        sentence,
        "That line isn't on the shopping list now.",
        args,
        SHOPPING_LIST_PATH,
      );
    }
    const found = lines.filter((l) => l !== undefined);
    return {
      sentence,
      facts: `Kitchen · shared by the whole camp · ${listed(found.map((l) => `${l.name}${l.amount ? ` ${l.amount}` : ""}`))}`,
      path: SHOPPING_LIST_PATH,
      args: {
        ...args,
        ticked,
        lines: found.map((l) => ({ key: l.key, amount: l.amount })),
      },
      keys: found.map((l) => `shopping:${l.key}`),
    };
  },

  async set_shopping_price(args, ctx) {
    const line = (await readShoppingLines(ctx.scope.campUserId)).find(
      (l) => l.key === str(args.key),
    );
    if (!line?.price) {
      return blocked(
        "Set a shopping line's price",
        line
          ? "Only a Kitchen lead or a captain can set shops and prices."
          : "That line isn't on the shopping list now.",
        args,
        SHOPPING_LIST_PATH,
      );
    }
    const cents =
      typeof args.amountCents === "number" ? args.amountCents : null;
    const shop = str(args.shop).trim();
    const price = line.price;
    return {
      sentence: `Set ${quote(line.name)} (${line.amount}) to ${cents === null ? "no price" : formatMoney(cents)}${shop ? ` at ${shop}` : ""} (${str(args.kind) === "paid" ? "paid" : "estimate"})`,
      facts: `Kitchen · shopping list · now ${price.priceCents === null ? "no price" : formatMoney(price.priceCents)}${price.shop ? ` at ${price.shop}` : ""}`,
      path: SHOPPING_LIST_PATH,
      args: { ...args, expectedVersion: price.version },
      keys: [`price:${line.key}`],
    };
  },
};
