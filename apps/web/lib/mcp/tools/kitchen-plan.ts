import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  allergenFlags,
  buildShoppingList,
  mealPlanDayLabel,
  mealPlates,
  planCovers,
  snackKey,
  type DietaryCounts,
} from "@camp404/core";
import { MEAL_PLAN_CHANGED } from "@camp404/db/meal-plan";
import { MENU_ITEM_GONE } from "@camp404/db/kitchen-menu";
import {
  ALLERGEN_PLAN_KINDS,
  AddMenuItemInput,
  AddPrepStepInput,
  AddSnackInput,
  CorrectRecipeAllergensInput,
  KITCHEN_ALLERGENS,
  MEALS_OF_THE_DAY,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  PREP_TIMINGS,
  PRICE_KINDS,
  RecordAllergenPlanInput,
  RemoveMenuItemInput,
  RemoveSnackInput,
  SetShoppingPriceInput,
  SetShoppingTicksInput,
} from "@camp404/types";
import {
  addMenuItem,
  addPrepStep,
  addSnack,
  correctRecipeAllergens,
  getKitchenMenu,
  getMealChecks,
  getMenuDietaryFor,
  getShoppingFacts,
  getShoppingPricesFor,
  getSnacks,
  listMenuBook,
  recordAllergenPlan,
  removeMenuItem,
  removeSnack,
  setShoppingPrice,
  setShoppingTicks,
} from "../../kitchen-menu";
import { getMealPlan, setMealPlan } from "../../meal-plan";
import {
  CHECK_MEAL_PLAN,
  CHECK_MENU,
  CHECK_PREP,
  CHECK_PRICE,
  MEAL_PLAN_PATH,
  SHOPPING_LIST_PATH,
} from "../../recipe-copy";
import { CATEGORY_LABEL, shoppingAmountLabel } from "../../recipe-labels";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The meal plan's and the shopping list's writes over MCP (#244, #245), each
// the page's own write through its own facade (lib/kitchen-menu.ts,
// lib/meal-plan.ts), with the signed-in person's id alone. Every write
// re-reads the actor inside its own transaction (lockAllowed on the Kitchen's
// rule) and writes its audit row there, as on the page.
//
//  - The plates: the page saves the whole week, a compare-and-set on the plan's
//    version and on the days Logistics gives. The tool takes only the days
//    that change and fills the rest from the plan AT the version the caller
//    read, so a call on an older version is refused rather than merged.
//  - The menu and the snacks: one-tap adds and removes, as on the page. Taking
//    a recipe off a meal also drops its prep steps (their tasks come off the
//    board) and its allergy plan, which re-adding does not bring back, so the
//    tool refuses a recipe that has either; that stays on the page.
//  - The allergy plan and the allergen correction are compare-and-sets on what
//    the caller read (the plan's version, the correction's revision and the
//    book version). The editors' read gives the flags as COUNTS only, the
//    page's dietary box: nothing names anyone.
//  - A prep step is added as on the page (one due before we leave becomes a
//    Kitchen task). Taking one off stays on the page.
//  - Ticks are the whole camp's and any approved member's; each line names the
//    amount the caller read, and a line whose amount has moved since is
//    refused here (the page would tick it at a stale amount). A price is a
//    captain's or a Kitchen lead's, rands only, on the line's version.

const firstIssue = (error: z.ZodError, fallback: string) =>
  error.issues[0]?.message ?? fallback;

const NOT_ON_LIST =
  "That line isn't on the shopping list now. Read the list again.";
const AMOUNT_MOVED =
  "The amount on that line changed since you read it. Read the list again.";
const MENU_ITEM_HAS_EXTRAS =
  "That recipe has prep steps or an allergy plan on this meal, which taking it off would lose. Take it off on the website.";

const NO_COUNTS: DietaryCounts = {
  members: 0,
  allergies: [],
  intolerances: [],
  preferences: [],
};

/** One shopping line as a tick or a price names it. */
export interface ShoppingLineView {
  key: string;
  area: string;
  name: string;
  amount: string;
  ticked: boolean;
  tickedAtOtherAmount: string | null;
  price?: {
    shop: string | null;
    priceCents: number | null;
    kind: string;
    version: number;
  };
}

/**
 * This year's shopping lines as the page works them out (the same
 * buildShoppingList from the same facts, snacks last), with prices only for
 * a viewer getShoppingPricesFor answers (a captain or a Kitchen lead).
 */
export async function readShoppingLines(
  viewerId: string,
): Promise<ShoppingLineView[]> {
  const [{ plan, menu, snacks, ticks }, priceRows] = await Promise.all([
    getShoppingFacts(),
    getShoppingPricesFor(viewerId),
  ]);
  const prices = priceRows ? new Map(priceRows.map((p) => [p.key, p])) : null;
  const tickedAt = new Map(ticks.map((t) => [t.key, t.amount]));
  const list = buildShoppingList({
    days: plan.days,
    menu: menu.items,
    recipes: menu.recipes,
  });
  const line = (
    key: string,
    area: string,
    name: string,
    amount: string,
  ): ShoppingLineView => {
    const at = tickedAt.get(key);
    const p = prices?.get(key);
    return {
      key,
      area,
      name,
      amount,
      ticked: at === amount,
      tickedAtOtherAmount: at !== undefined && at !== amount ? at : null,
      ...(prices
        ? {
            price: {
              shop: p?.shop ?? null,
              priceCents: p?.amountCents ?? null,
              kind: p?.kind ?? "estimate",
              version: p?.version ?? 0,
            },
          }
        : {}),
    };
  };
  return [
    ...list.groups.flatMap((group) =>
      group.lines.map((l) =>
        line(
          l.key,
          CATEGORY_LABEL[group.category],
          l.name,
          shoppingAmountLabel(l.amount),
        ),
      ),
    ),
    ...snacks.map((s) =>
      line(snackKey(s.id), "Snacks", s.name, s.amount ?? ""),
    ),
  ];
}

export function registerKitchenPlanTools(server: McpServer): void {
  server.registerTool(
    "get_meal_plan_for_editing",
    {
      title: "Read the meal plan to edit it",
      description:
        "The Meal plan page as a captain or Kitchen lead sees it: `version` (for set_meal_plan_plates), each day's plates, each recipe on a meal with its menu item `id`, allergy flags (counts only), its plan and prep steps, the snacks with ids, and `book`: recipes you may put on a meal.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_meal_plan_for_editing",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const [plan, menu, snacks, book, dietary, checks] = await Promise.all(
            [
              getMealPlan(),
              getKitchenMenu(),
              getSnacks(),
              listMenuBook(),
              getMenuDietaryFor(scope.campUserId),
              getMealChecks(),
            ],
          );
          const counts = dietary?.counts ?? NO_COUNTS;
          const onMeal = (day: number, meal: "breakfast" | "dinner") =>
            menu.items
              .filter((i) => i.day === day && i.meal === meal)
              .sort((a, b) => a.position - b.position)
              .flatMap((item) => {
                const recipe = menu.recipes[item.recipeId];
                if (!recipe) return [];
                const plates = mealPlates(plan.days, day, meal);
                const flags = allergenFlags(recipe.allergens, counts);
                const allergyPlan =
                  checks.plans.find((p) => p.menuItemId === item.id) ?? null;
                return [
                  {
                    id: item.id,
                    recipeId: item.recipeId,
                    title: recipe.title,
                    verified: recipe.counts.some((c) => c.plates === plates),
                    bookVersionId: recipe.versionId,
                    allergens: recipe.allergens.map((a) => a.allergen),
                    allergenRevision: recipe.allergenRevision,
                    anaphylaxis: flags.red.map((f) => ({
                      allergen: f.allergen,
                      text: f.text,
                    })),
                    otherFlags: flags.amber.map((f) => ({
                      allergen: f.allergen,
                      text: f.text,
                    })),
                    plan: allergyPlan
                      ? {
                          kind: allergyPlan.kind,
                          details: allergyPlan.details,
                          allergens: allergyPlan.allergens,
                          version: allergyPlan.version,
                        }
                      : null,
                    planCoversAnaphylaxis: planCovers(
                      allergyPlan?.allergens ?? null,
                      flags.red,
                    ),
                    prepSteps: checks.prepSteps
                      .filter((s) => s.menuItemId === item.id)
                      .map((s) => ({
                        what: s.what,
                        when: s.timing,
                        due: s.dueDate,
                        onBoard: s.onBoard,
                      })),
                  },
                ];
              });
          return {
            version: plan.version,
            firstDay: plan.firstDay,
            daysOnSite: plan.daysOnSite,
            days: plan.days.map((d, index) => {
              const day = index + 1;
              return {
                day,
                label: mealPlanDayLabel(plan.firstDay, day),
                breakfast: {
                  plates: d.breakfast,
                  recipes: onMeal(day, "breakfast"),
                },
                dinner: { plates: d.dinner, recipes: onMeal(day, "dinner") },
              };
            }),
            snacks: snacks.map((s) => ({
              id: s.id,
              name: s.name,
              amount: s.amount,
            })),
            book: book.map((r) => ({
              recipeId: r.id,
              title: r.title,
              readyPlates: r.readyPlates,
            })),
            url: siteUrl(MEAL_PLAN_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_meal_plan_plates",
    {
      title: "Change the plates on the meal plan",
      description:
        "Changes the plates at breakfast or dinner on the days you give (day 1 is the first day on site); other days stay as they are. Give `expectedVersion` from get_meal_plan_for_editing; if someone saved first it is refused: read again. 0 plates means no meal.",
      inputSchema: z.object({
        expectedVersion: z.number().int().min(0),
        days: z
          .array(
            z.object({
              day: z.number().int().min(1).max(MEAL_PLAN_MAX_DAYS),
              breakfast: z.number().int().min(0).optional(),
              dinner: z.number().int().min(0).optional(),
            }),
          )
          .min(1)
          .max(MEAL_PLAN_MAX_DAYS),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_meal_plan_plates",
        extra,
        argsForAudit: {
          expectedVersion: args.expectedVersion,
          days: args.days.map((d) => d.day),
        },
        handler: async ({ scope }) => {
          const plan = await getMealPlan();
          // The days left out are filled from this read, so it must be the
          // version the caller read; the write checks the version again.
          if (plan.version !== args.expectedVersion) {
            throw new ToolError(MEAL_PLAN_CHANGED);
          }
          const days = plan.days.map((d) => ({ ...d }));
          for (const change of args.days) {
            const row = days[change.day - 1];
            if (!row) {
              throw new ToolError(
                `Day ${change.day} isn't on the meal plan: it has ${plan.daysOnSite} days on site.`,
              );
            }
            if (change.breakfast !== undefined) {
              row.breakfast = change.breakfast;
            }
            if (change.dinner !== undefined) row.dinner = change.dinner;
          }
          const parsed = MealPlanInput.safeParse({
            firstDay: plan.firstDay,
            days,
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_MEAL_PLAN));
          }
          const result = await setMealPlan({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { version: result.version, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "add_menu_item",
    {
      title: "Put a recipe on a meal",
      description:
        "Puts a recipe from the book on a meal of the menu, after the ones there. `day` is the day on site (1 = Day 1), `meal` breakfast or dinner (no lunch), `recipeId` from get_meal_plan_for_editing's `book`. The meal must have plates saved.",
      inputSchema: z.object({
        day: z.number().int().min(1).max(MEAL_PLAN_MAX_DAYS),
        meal: z.enum(MEALS_OF_THE_DAY),
        recipeId: z.string(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_menu_item",
        extra,
        argsForAudit: { ...args },
        handler: async ({ scope }) => {
          const parsed = AddMenuItemInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_MENU));
          }
          const result = await addMenuItem({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { id: result.itemId, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "remove_menu_item",
    {
      title: "Take a recipe off a meal",
      description:
        "Takes a recipe off a meal: give the menu item `id` from get_meal_plan_for_editing. Putting it back is add_menu_item. A recipe with prep steps or an allergy plan on that meal is refused (they would be lost): take that one off on the website.",
      inputSchema: z.object({ itemId: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_menu_item",
        extra,
        argsForAudit: { itemId: args.itemId },
        handler: async ({ scope }) => {
          const parsed = RemoveMenuItemInput.safeParse(args);
          if (!parsed.success) throw new ToolError(MENU_ITEM_GONE);
          const checks = await getMealChecks();
          if (
            checks.plans.some((p) => p.menuItemId === parsed.data.itemId) ||
            checks.prepSteps.some((s) => s.menuItemId === parsed.data.itemId)
          ) {
            throw new ToolError(
              `${MENU_ITEM_HAS_EXTRAS} ${siteUrl(MEAL_PLAN_PATH)}`,
            );
          }
          const result = await removeMenuItem({
            itemId: parsed.data.itemId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { removed: parsed.data.itemId, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "add_snack",
    {
      title: "Add a snack",
      description:
        'Adds a snack to the year\'s list (it goes on the shopping list): its `name` and, if known, an `amount` as words ("6 packets").',
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.string().max(60).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_snack",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const parsed = AddSnackInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_MENU));
          }
          const result = await addSnack({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.snackId,
            name: parsed.data.name,
            amount: parsed.data.amount,
            url: siteUrl(MEAL_PLAN_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "remove_snack",
    {
      title: "Take a snack off",
      description:
        "Takes a snack off the year's list: give its `id` from get_meal_plan_for_editing. Adding it again is add_snack.",
      inputSchema: z.object({ snackId: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_snack",
        extra,
        argsForAudit: { snackId: args.snackId },
        handler: async ({ scope }) => {
          const parsed = RemoveSnackInput.safeParse(args);
          if (!parsed.success) throw new ToolError(CHECK_MENU);
          const result = await removeSnack({
            snackId: parsed.data.snackId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { removed: parsed.data.snackId, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "record_allergen_plan",
    {
      title: "Record an allergy plan",
      description: `Records (or replaces) the kitchen's plan for a recipe on a meal that someone coming is anaphylactic to: \`kind\` portion (a separate portion) or substitution, \`details\` (what exactly the kitchen will do), \`allergens\` it covers, and \`expectedVersion\`: the plan's version you read (0 for none).`,
      inputSchema: z.object({
        itemId: z.string(),
        kind: z.enum(ALLERGEN_PLAN_KINDS),
        details: z.string().min(1).max(500),
        allergens: z.array(z.enum(KITCHEN_ALLERGENS)).min(1),
        expectedVersion: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "record_allergen_plan",
        extra,
        argsForAudit: {
          itemId: args.itemId,
          kind: args.kind,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const parsed = RecordAllergenPlanInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_MENU));
          }
          const result = await recordAllergenPlan({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { version: result.version, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "correct_recipe_allergens",
    {
      title: "Correct a recipe's allergens",
      description: `Replaces what a recipe's book version holds with the \`allergens\` you give (the whole list; [] for none). Give \`recipeId\`, \`versionId\` (its bookVersionId) and \`expectedRevision\` (its allergenRevision) from get_meal_plan_for_editing.`,
      inputSchema: z.object({
        recipeId: z.string(),
        versionId: z.string(),
        allergens: z.array(z.enum(KITCHEN_ALLERGENS)),
        expectedRevision: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "correct_recipe_allergens",
        extra,
        argsForAudit: {
          recipeId: args.recipeId,
          expectedRevision: args.expectedRevision,
        },
        handler: async ({ scope }) => {
          const parsed = CorrectRecipeAllergensInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_MENU));
          }
          const result = await correctRecipeAllergens({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { revision: result.revision, url: siteUrl(MEAL_PLAN_PATH) };
        },
      }),
  );

  server.registerTool(
    "add_prep_step",
    {
      title: "Add a prep step",
      description:
        "Adds a prep step under a recipe on a meal (menu item `itemId`): `what` to do and `when`: day_before, same_day, or before_leaving with a `date` (YYYY-MM-DD). One due before Day 1 goes on the task board for the Kitchen; one on site prints on that day's sheet.",
      inputSchema: z.object({
        itemId: z.string(),
        what: z.string().min(1).max(160),
        when: z.enum(PREP_TIMINGS),
        date: z.string().nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_prep_step",
        extra,
        argsForAudit: { itemId: args.itemId, when: args.when },
        handler: async ({ scope }) => {
          const parsed = AddPrepStepInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_PREP));
          }
          const result = await addPrepStep({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.stepId,
            due: result.due,
            onTheTaskBoard: result.onBoard,
            url: siteUrl(MEAL_PLAN_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_shopping_lines",
    {
      title: "List the shopping lines to tick",
      description:
        "Every line of the shopping list, flat: its `key` and `amount` (what set_shopping_ticks names), area, name and whether it is ticked. Captains and Kitchen leads also get each line's `price` with its `version` (for set_shopping_price).",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_shopping_lines",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => ({
          lines: await readShoppingLines(scope.campUserId),
          url: siteUrl(SHOPPING_LIST_PATH),
        }),
      }),
  );

  server.registerTool(
    "set_shopping_ticks",
    {
      title: "Tick shopping lines",
      description:
        "Ticks (or with `ticked` false, unticks) lines of the shopping list for the whole camp. Give each line's `key` and the `amount` you read from list_shopping_lines; a line whose amount has changed since is refused: read again.",
      inputSchema: z.object({
        lines: z
          .array(z.object({ key: z.string(), amount: z.string() }))
          .min(1)
          .max(300),
        ticked: z.boolean(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_shopping_ticks",
        extra,
        argsForAudit: { lines: args.lines.length, ticked: args.ticked },
        handler: async ({ scope }) => {
          const parsed = SetShoppingTicksInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              firstIssue(parsed.error, "Check the list and try again."),
            );
          }
          const now = new Map(
            (await readShoppingLines(scope.campUserId)).map((l) => [
              l.key,
              l.amount,
            ]),
          );
          for (const l of parsed.data.lines) {
            const amount = now.get(l.key);
            if (amount === undefined) throw new ToolError(NOT_ON_LIST);
            if (amount !== l.amount) throw new ToolError(AMOUNT_MOVED);
          }
          const result = await setShoppingTicks({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            ticked: parsed.data.ticked,
            lines: parsed.data.lines.length,
            url: siteUrl(SHOPPING_LIST_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_shopping_price",
    {
      title: "Set a line's shop and price",
      description: `Sets a shopping line's \`shop\` and price for the whole amount, in rand cents (\`amountCents\`: 9600 is R96,00; null to clear), and \`kind\`: ${PRICE_KINDS.join(" or ")}. Give the line's \`key\` and \`expectedVersion\` (its price version from list_shopping_lines, 0 for none). Rands only.`,
      inputSchema: z.object({
        key: z.string(),
        shop: z.string().max(80).nullable(),
        amountCents: z.number().int().min(0).nullable(),
        kind: z.enum(PRICE_KINDS),
        expectedVersion: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_shopping_price",
        extra,
        argsForAudit: {
          key: args.key,
          kind: args.kind,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const parsed = SetShoppingPriceInput.safeParse({
            ...args,
            currency: "ZAR",
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_PRICE));
          }
          const lines = await readShoppingLines(scope.campUserId);
          if (!lines.some((l) => l.key === parsed.data.key)) {
            throw new ToolError(NOT_ON_LIST);
          }
          const result = await setShoppingPrice({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { version: result.version, url: siteUrl(SHOPPING_LIST_PATH) };
        },
      }),
  );
}
