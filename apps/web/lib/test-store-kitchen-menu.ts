import "server-only";

import { randomUUID } from "node:crypto";
import { canEditMealPlan } from "@camp404/core";
import {
  ALREADY_ON_MEAL,
  MEAL_IS_FULL,
  MENU_DAY_NOT_ON_PLAN,
  MENU_ITEM_GONE,
  MENU_MEAL_HAS_NO_PLATES,
  MENU_RECIPE_NOT_IN_BOOK,
  NOT_A_MENU_EDITOR,
  NOT_A_SNACK_KEEPER,
  NOT_A_TICKER,
  SNACK_GONE,
  TOO_MANY_SNACKS,
  type KitchenMenu,
  type KitchenMenuItem,
  type KitchenMenuWriteResult,
  type KitchenSnack,
  type ShoppingFacts,
  type ShoppingTick,
} from "@camp404/db/kitchen-menu";
import { reachRank } from "@camp404/db/power";
import {
  MAX_RECIPES_PER_MEAL,
  MAX_SNACKS,
  type MealOfTheDay,
} from "@camp404/types";
import { testStore } from "./test-store";
import { storeDropMenuItemExtras } from "./test-store-kitchen-extras";

// The in-memory twins of the Kitchen's menu, snacks and shopping list ticks
// (@camp404/db/kitchen-menu), for E2E_TEST_MODE. The same rules, sentences
// and results over the store's own rows: a captain or a Kitchen lead edits
// the menu and the snacks; any approved member ticks, for the whole camp; a
// recipe sits on a meal once, and a meal holds at most MAX_RECIPES_PER_MEAL.
// The store keeps no audit log and is one synchronous process, so there is
// nothing to lock. Kept apart from test-store.ts, which calls in here only to
// reset.

interface KitchenMenuState {
  items: (KitchenMenuItem & { cycle: number; createdAt: number })[];
  snacks: (KitchenSnack & { cycle: number; createdAt: number })[];
  /** `${cycle}:${key}` -> the amount it was ticked at. */
  ticks: Map<string, ShoppingTick & { cycle: number }>;
}

const KEY = "__camp404KitchenMenuTestStore__";

function state(): KitchenMenuState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    items: [],
    snacks: [],
    ticks: new Map(),
  } satisfies KitchenMenuState;
  return g[KEY] as KitchenMenuState;
}

/** Clear the menu, the snacks and the ticks (testStore.reset calls this). */
export function resetKitchenMenuStore(): void {
  const s = state();
  s.items.length = 0;
  s.snacks.length = 0;
  s.ticks.clear();
}

let clock = 0;
const tick = () => (clock += 1);

function isEditor(actorId: string): boolean {
  const reach = testStore.senderReach(actorId);
  return canEditMealPlan(reachRank(reach), reach ?? []);
}

const isMember = (userId: string) =>
  testStore.findUserById(userId)?.approvalStatus === "approved";

/** A year's menu (the twin of getKitchenMenu). */
export function storeKitchenMenu(cycle?: number): KitchenMenu {
  const year = cycle ?? testStore.currentCycleNumber();
  const items = state()
    .items.filter((i) => i.cycle === year)
    .sort(
      (a, b) =>
        a.day - b.day || a.position - b.position || a.createdAt - b.createdAt,
    )
    .map(({ id, day, meal, position, recipeId }) => ({
      id,
      day,
      meal,
      position,
      recipeId,
    }));
  return {
    cycle: year,
    items,
    recipes: testStore.kitchenMenuRecipes(items.map((i) => i.recipeId)),
  };
}

/** A year's snacks (the twin of getSnacks). */
export function storeSnacks(cycle?: number): KitchenSnack[] {
  const year = cycle ?? testStore.currentCycleNumber();
  return state()
    .snacks.filter((s) => s.cycle === year)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, name, amount }) => ({ id, name, amount }));
}

/** Everything this year's list is worked out from (the twin of getShoppingFacts). */
export function storeShoppingFacts(): ShoppingFacts {
  const cycle = testStore.currentCycleNumber();
  return {
    plan: testStore.getMealPlan(cycle),
    menu: storeKitchenMenu(cycle),
    snacks: storeSnacks(cycle),
    ticks: [...state().ticks.values()]
      .filter((t) => t.cycle === cycle)
      .map(({ key, amount }) => ({ key, amount })),
  };
}

/** The twin of addMenuItem. */
export function storeAddMenuItem(input: {
  actorId: string;
  day: number;
  meal: MealOfTheDay;
  recipeId: string;
}): KitchenMenuWriteResult<{ itemId: string }> {
  if (!isEditor(input.actorId)) return { ok: false, error: NOT_A_MENU_EDITOR };
  const cycle = testStore.currentCycleNumber();
  const plan = testStore.getMealPlan(cycle);
  if (input.day < 1 || input.day > plan.daysOnSite) {
    return { ok: false, error: MENU_DAY_NOT_ON_PLAN };
  }
  if ((plan.days[input.day - 1]?.[input.meal] ?? 0) <= 0) {
    return { ok: false, error: MENU_MEAL_HAS_NO_PLATES };
  }
  if (!testStore.recipeInBook(input.recipeId)) {
    return { ok: false, error: MENU_RECIPE_NOT_IN_BOOK };
  }
  const onMeal = state().items.filter(
    (i) => i.cycle === cycle && i.day === input.day && i.meal === input.meal,
  );
  if (onMeal.length >= MAX_RECIPES_PER_MEAL) {
    return { ok: false, error: MEAL_IS_FULL };
  }
  if (onMeal.some((i) => i.recipeId === input.recipeId)) {
    return { ok: false, error: ALREADY_ON_MEAL };
  }
  const id = randomUUID();
  state().items.push({
    id,
    cycle,
    day: input.day,
    meal: input.meal,
    recipeId: input.recipeId,
    position: Math.max(0, ...onMeal.map((i) => i.position)) + 1,
    createdAt: tick(),
  });
  return { ok: true, itemId: id };
}

/** The twin of removeMenuItem. */
export function storeRemoveMenuItem(input: {
  actorId: string;
  itemId: string;
}): KitchenMenuWriteResult {
  if (!isEditor(input.actorId)) return { ok: false, error: NOT_A_MENU_EDITOR };
  const cycle = testStore.currentCycleNumber();
  const items = state().items;
  const at = items.findIndex((i) => i.id === input.itemId && i.cycle === cycle);
  if (at < 0) return { ok: false, error: MENU_ITEM_GONE };
  items.splice(at, 1);
  // Its plan and prep steps go with it; their tasks come off the board.
  storeDropMenuItemExtras(input.itemId, input.actorId);
  return { ok: true };
}

/** The twin of addSnack. */
export function storeAddSnack(input: {
  actorId: string;
  name: string;
  amount: string | null;
}): KitchenMenuWriteResult<{ snackId: string }> {
  if (!isEditor(input.actorId)) return { ok: false, error: NOT_A_SNACK_KEEPER };
  const cycle = testStore.currentCycleNumber();
  if (storeSnacks(cycle).length >= MAX_SNACKS) {
    return { ok: false, error: TOO_MANY_SNACKS };
  }
  const id = randomUUID();
  state().snacks.push({
    id,
    cycle,
    name: input.name.trim(),
    amount: input.amount?.trim() || null,
    createdAt: tick(),
  });
  return { ok: true, snackId: id };
}

/** The twin of removeSnack. */
export function storeRemoveSnack(input: {
  actorId: string;
  snackId: string;
}): KitchenMenuWriteResult {
  if (!isEditor(input.actorId)) return { ok: false, error: NOT_A_SNACK_KEEPER };
  const cycle = testStore.currentCycleNumber();
  const snacks = state().snacks;
  const at = snacks.findIndex(
    (s) => s.id === input.snackId && s.cycle === cycle,
  );
  if (at < 0) return { ok: false, error: SNACK_GONE };
  snacks.splice(at, 1);
  return { ok: true };
}

/** The twin of setShoppingTicks. */
export function storeSetShoppingTicks(input: {
  actorId: string;
  lines: readonly ShoppingTick[];
  ticked: boolean;
}): KitchenMenuWriteResult {
  if (!isMember(input.actorId)) return { ok: false, error: NOT_A_TICKER };
  const cycle = testStore.currentCycleNumber();
  const ticks = state().ticks;
  for (const line of input.lines) {
    const key = `${cycle}:${line.key}`;
    if (input.ticked)
      ticks.set(key, { cycle, key: line.key, amount: line.amount });
    else ticks.delete(key);
  }
  return { ok: true };
}
