// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MENU_DAY_NOT_ON_PLAN,
  MENU_MEAL_HAS_NO_PLATES,
  shoppingKey,
  snackKey,
} from "@camp404/core";
import {
  ALREADY_ON_MEAL,
  MEAL_IS_FULL,
  MENU_ITEM_GONE,
  MENU_RECIPE_NOT_IN_BOOK,
  NOT_A_MENU_EDITOR,
  NOT_A_SNACK_KEEPER,
  NOT_A_TICKER,
  SNACK_GONE,
  TOO_MANY_SNACKS,
  type KitchenMenu,
  type ShoppingFacts,
} from "@camp404/db/kitchen-menu";
import {
  MAX_RECIPES_PER_MEAL,
  MAX_SNACKS,
  MEALS,
  type MealOfTheDay,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";
import { KITCHEN_NOW, recipeInBook, savedMealPlan } from "./_kitchen";

// The Kitchen's menu, snacks and shopping list ticks (#244, #245), through
// lib/kitchen-menu.ts, on the database and on the E2E store: the same people,
// the same calls, the same answers and refusal sentences. The day-and-meal
// check both sides apply is menuSlotProblem in @camp404/core; this holds the
// rest (who may edit and tick, the caps, the reads) equal. The Kitchen lead
// is this domain's lead; the Finance lead is a lead of ANOTHER team, refused.
// See _agreement.ts and _kitchen.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addMenuItem,
  addSnack,
  getKitchenMenu,
  getShoppingFacts,
  getSnacks,
  listMenuBook,
  removeMenuItem,
  removeSnack,
  setShoppingTicks,
} from "../kitchen-menu";
import { suggestRecipe } from "../recipes";

const NOBODY = "00000000-0000-4000-8000-000000000000";
const [BREAKFAST, DINNER] = MEALS;

/**
 * A menu with its recipes as a list by title: the store and the database key
 * them by their own ids, which normalise() only rewrites in values.
 */
function readable(menu: KitchenMenu) {
  return {
    ...menu,
    recipes: Object.values(menu.recipes).sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
  };
}

function readableFacts(facts: ShoppingFacts) {
  return { ...facts, menu: readable(facts.menu) };
}

describe("the kitchen menu: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("puts recipes on a meal for the Kitchen's editors only, on a day and meal with plates", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      // Day 1 has breakfast and dinner; day 2 has dinner only.
      await savedMealPlan(p, (day) => ({
        breakfast: day === 1 ? 40 : 0,
        dinner: day <= 2 ? 45 : 0,
      }));
      const dhal = await recipeInBook(p, "Dhal");
      const stew = await recipeInBook(p, "Stew");
      const suggested = await suggestRecipe({
        submitterId: p.member,
        title: "Not yet",
        source: "text",
        sourceUrl: null,
        text: "Rice.",
        suitabilityNote: null,
        aiConsent: true,
        now: KITCHEN_NOW,
      });
      if (!suggested.ok) throw new Error(suggested.error);
      const add = (
        actorId: string,
        day: number,
        meal: string,
        recipeId = dhal.recipeId,
      ) => addMenuItem({ actorId, day, meal: meal as MealOfTheDay, recipeId });
      const added = await add(p.kitchenLead, 1, BREAKFAST);
      return {
        otherLead: await add(p.financeLead, 1, DINNER),
        member: await add(p.member, 1, DINNER),
        added,
        byCaptain: await add(p.captain, 1, BREAKFAST, stew.recipeId),
        twice: await add(p.kitchenLead, 1, BREAKFAST),
        dayZero: await add(p.kitchenLead, 0, DINNER),
        pastTheEnd: await add(p.kitchenLead, 40, DINNER),
        halfDay: await add(p.kitchenLead, 1.5, DINNER),
        lunch: await add(p.kitchenLead, 1, "lunch"),
        noPlates: await add(p.kitchenLead, 2, BREAKFAST),
        notInBook: await add(p.kitchenLead, 2, DINNER, suggested.id),
        unknown: await add(p.kitchenLead, 2, DINNER, NOBODY),
        menu: readable(await getKitchenMenu()),
        book: await listMenuBook(),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_A_MENU_EDITOR },
      member: { ok: false, error: NOT_A_MENU_EDITOR },
      added: { ok: true },
      byCaptain: { ok: true },
      twice: { ok: false, error: ALREADY_ON_MEAL },
      dayZero: { ok: false, error: MENU_DAY_NOT_ON_PLAN },
      pastTheEnd: { ok: false, error: MENU_DAY_NOT_ON_PLAN },
      halfDay: { ok: false, error: MENU_DAY_NOT_ON_PLAN },
      lunch: { ok: false, error: MENU_DAY_NOT_ON_PLAN },
      noPlates: { ok: false, error: MENU_MEAL_HAS_NO_PLATES },
      notInBook: { ok: false, error: MENU_RECIPE_NOT_IN_BOOK },
      unknown: { ok: false, error: MENU_RECIPE_NOT_IN_BOOK },
    });
    expect(store).toEqual(db);
  });

  it("holds a meal to its cap and takes a recipe off once", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await savedMealPlan(p, () => ({ breakfast: 0, dinner: 50 }));
      const ids: string[] = [];
      for (let i = 0; i <= MAX_RECIPES_PER_MEAL; i += 1) {
        ids.push((await recipeInBook(p, `Recipe ${i}`)).recipeId);
      }
      const items: string[] = [];
      for (const recipeId of ids.slice(0, MAX_RECIPES_PER_MEAL)) {
        const added = await addMenuItem({
          actorId: p.kitchenLead,
          day: 1,
          meal: DINNER,
          recipeId,
        });
        if (!added.ok) throw new Error(added.error);
        items.push(added.itemId);
      }
      const full = await addMenuItem({
        actorId: p.kitchenLead,
        day: 1,
        meal: DINNER,
        recipeId: ids[MAX_RECIPES_PER_MEAL]!,
      });
      const fullAndThere = await addMenuItem({
        actorId: p.kitchenLead,
        day: 1,
        meal: DINNER,
        recipeId: ids[0]!,
      });
      return {
        full,
        fullAndThere,
        otherLead: await removeMenuItem({
          actorId: p.financeLead,
          itemId: items[0]!,
        }),
        removed: await removeMenuItem({
          actorId: p.kitchenLead,
          itemId: items[0]!,
        }),
        again: await removeMenuItem({
          actorId: p.kitchenLead,
          itemId: items[0]!,
        }),
        unknown: await removeMenuItem({ actorId: p.captain, itemId: NOBODY }),
        notAnId: await removeMenuItem({ actorId: p.captain, itemId: "nope" }),
        menu: readable(await getKitchenMenu()),
      };
    });
    expect(db).toMatchObject({
      full: { ok: false, error: MEAL_IS_FULL },
      fullAndThere: { ok: false, error: MEAL_IS_FULL },
      otherLead: { ok: false, error: NOT_A_MENU_EDITOR },
      removed: { ok: true },
      again: { ok: false, error: MENU_ITEM_GONE },
      unknown: { ok: false, error: MENU_ITEM_GONE },
      notAnId: { ok: false, error: MENU_ITEM_GONE },
    });
    expect(store).toEqual(db);
  });

  it("keeps the year's snacks for the Kitchen's editors, up to the cap", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const first = await addSnack({
        actorId: p.kitchenLead,
        name: "  Rusks ",
        amount: " 4 boxes ",
      });
      const otherLead = await addSnack({
        actorId: p.financeLead,
        name: "Chips",
        amount: null,
      });
      const member = await addSnack({
        actorId: p.member,
        name: "Chips",
        amount: null,
      });
      for (let i = 1; i < MAX_SNACKS; i += 1) {
        await addSnack({ actorId: p.captain, name: `Snack ${i}`, amount: "" });
      }
      const tooMany = await addSnack({
        actorId: p.captain,
        name: "One more",
        amount: null,
      });
      if (!first.ok) throw new Error(first.error);
      const snacks = await getSnacks();
      return {
        first,
        otherLead,
        member,
        tooMany,
        count: snacks.length,
        firstSnack: snacks[0],
        lastSnack: snacks.at(-1),
        notYours: await removeSnack({
          actorId: p.financeLead,
          snackId: first.snackId,
        }),
        removed: await removeSnack({
          actorId: p.kitchenLead,
          snackId: first.snackId,
        }),
        again: await removeSnack({
          actorId: p.kitchenLead,
          snackId: first.snackId,
        }),
        afterwards: (await getSnacks()).length,
      };
    });
    expect(db).toMatchObject({
      first: { ok: true },
      otherLead: { ok: false, error: NOT_A_SNACK_KEEPER },
      member: { ok: false, error: NOT_A_SNACK_KEEPER },
      tooMany: { ok: false, error: TOO_MANY_SNACKS },
      count: MAX_SNACKS,
      firstSnack: { name: "Rusks", amount: "4 boxes" },
      notYours: { ok: false, error: NOT_A_SNACK_KEEPER },
      removed: { ok: true },
      again: { ok: false, error: SNACK_GONE },
      afterwards: MAX_SNACKS - 1,
    });
    expect(store).toEqual(db);
  });

  it("lets any approved member tick the list for the whole camp", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const pending = await seed.user("Pending", { approval: "pending" });
      await savedMealPlan(p, () => ({ breakfast: 30, dinner: 45 }));
      const dhal = await recipeInBook(p, "Dhal");
      await addMenuItem({
        actorId: p.kitchenLead,
        day: 1,
        meal: DINNER,
        recipeId: dhal.recipeId,
      });
      const snack = await addSnack({
        actorId: p.kitchenLead,
        name: "Rusks",
        amount: null,
      });
      if (!snack.ok) throw new Error(snack.error);
      const lentils = shoppingKey("Red lentils", "kg");
      const salt = shoppingKey("Salt", "tbsp");
      const tick = (actorId: string, keys: string[], ticked = true) =>
        setShoppingTicks({
          actorId,
          ticked,
          lines: keys.map((key) => ({ key, amount: "3 kg" })),
        });
      const ticked = await tick(p.member, [lentils, salt, lentils]);
      const facts = await getShoppingFacts();
      return {
        ticked,
        byLead: await tick(p.financeLead, [snackKey(snack.snackId)]),
        pending: await tick(pending, [salt]),
        nobody: await tick(NOBODY, [salt]),
        nothing: await tick(p.other, []),
        facts: readableFacts(facts),
        unticked: await tick(p.other, [salt], false),
        // A snack's key holds its id, which differs on each side.
        ticks: (await getShoppingFacts()).ticks
          .map((t) => (t.key.startsWith("snack:") ? "snack" : t.key))
          .sort(),
      };
    });
    expect(db).toMatchObject({
      ticked: { ok: true },
      byLead: { ok: true },
      pending: { ok: false, error: NOT_A_TICKER },
      nobody: { ok: false, error: NOT_A_TICKER },
      nothing: { ok: true },
      unticked: { ok: true },
      ticks: [shoppingKey("Red lentils", "kg"), "snack"],
    });
    expect(store).toEqual(db);
  });
});
