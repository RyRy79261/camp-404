import "server-only";

import { randomUUID } from "node:crypto";
import {
  addDays,
  campDayStart,
  canAddPrepSteps,
  canCheckMenuAllergens,
  canPriceShoppingList,
  dayOneShift,
  isCurrency,
  mealPlates,
  prepDueDate,
  prepGoesOnBoard,
  prepTaskDetails,
  prepTaskTitle,
  type SheetPrepStep,
} from "@camp404/core";
import {
  ALLERGENS_CHANGED,
  MEAL_ITEM_GONE,
  NOT_A_MEAL_CHECKER,
  PLAN_CHANGED,
  PLAN_NEEDS_WORDS,
  PREP_NEEDS_WORDS,
  PREP_STEP_GONE,
  RECIPE_NEWER_VERSION,
  type AllergenPlan,
  type MealChecks,
  type MealWriteResult,
  type PrepStep,
} from "@camp404/db/kitchen-meals";
import {
  NOT_A_PRICE_KEEPER,
  PRICE_BAD_AMOUNT,
  PRICE_CHANGED,
  PRICE_RANDS_ONLY,
  type PriceWriteResult,
  type ShoppingPrice,
} from "@camp404/db/kitchen-prices";
import { reachRank } from "@camp404/db/power";
import {
  readAllergens,
  type AllergenPlanKind,
  type KitchenAllergen,
  type PriceKind,
  type PrepTiming,
} from "@camp404/types";
import { testStore } from "./test-store";
import { storeKitchenMenu } from "./test-store-kitchen-menu";

// The in-memory twins of @camp404/db/kitchen-prices and kitchen-meals, for
// E2E_TEST_MODE: shops and prices, allergy plans, allergen corrections and
// prep steps, with the same rules, sentences and results. A captain or a
// Kitchen lead writes; members are never sent a price; every write is
// compare-and-set; a prep step due before Day 1 is a Kitchen task on the
// store's board, and taking it off takes the task off. The store keeps no
// audit log. Kept apart from test-store.ts, which calls in here only to reset.

interface ExtrasState {
  prices: Map<string, ShoppingPrice & { cycle: number }>;
  plans: Map<string, AllergenPlan>;
  corrections: Map<string, { allergens: KitchenAllergen[]; revision: number }>;
  steps: (PrepStep & { cycle: number; taskId: string | null })[];
}

const KEY = "__camp404KitchenExtrasTestStore__";

function state(): ExtrasState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    prices: new Map(),
    plans: new Map(),
    corrections: new Map(),
    steps: [],
  } satisfies ExtrasState;
  return g[KEY] as ExtrasState;
}

/** Forget everything (testStore.reset calls this). */
export function resetKitchenExtrasStore(): void {
  const s = state();
  s.prices.clear();
  s.plans.clear();
  s.corrections.clear();
  s.steps.length = 0;
}

const may = (
  actorId: string,
  rule: (rank: string, led: readonly string[]) => boolean,
) => {
  const reach = testStore.senderReach(actorId);
  return rule(reachRank(reach), reach ?? []);
};

/** A menu item of this year's menu, with its recipe's title, or null. */
function menuItem(itemId: string) {
  const menu = storeKitchenMenu();
  const item = menu.items.find((i) => i.id === itemId);
  if (!item) return null;
  return {
    ...item,
    title: menu.recipes[item.recipeId]?.title ?? "Untitled recipe",
  };
}

/** A version's correction, for the twin of readKitchenMenu. */
export function storeAllergenCorrection(
  versionId: string,
): { allergens: KitchenAllergen[]; revision: number } | null {
  return state().corrections.get(versionId) ?? null;
}

/** The twin of removeMenuItem's clean-up: plans and steps go, tasks come off. */
export function storeDropMenuItemExtras(itemId: string, actorId: string): void {
  const s = state();
  s.plans.delete(itemId);
  for (const step of s.steps.filter((x) => x.menuItemId === itemId)) {
    if (step.taskId) testStore.removeTask({ taskId: step.taskId, actorId });
  }
  s.steps = s.steps.filter((x) => x.menuItemId !== itemId);
}

/** Whether a year has prep steps (the meal plan refuses to clear Day 1). */
export function storeHasPrepSteps(cycle: number): boolean {
  return state().steps.some((s) => s.cycle === cycle);
}

/** The twin of the meal plan's re-dating when Day 1 moves. */
export function storeRedatePrepSteps(
  cycle: number,
  from: string | null,
  to: string | null,
): void {
  const shift = dayOneShift(from, to);
  if (shift === null) return;
  const menu = storeKitchenMenu(cycle);
  for (const step of state().steps.filter((s) => s.cycle === cycle)) {
    const due = addDays(step.dueDate, shift);
    if (!due) continue;
    step.dueDate = due;
    const item = menu.items.find((i) => i.id === step.menuItemId);
    if (step.taskId && item) {
      testStore.redateTask(step.taskId, campDayStart(due), {
        from: prepTaskDetails(item.day, item.meal, from),
        to: prepTaskDetails(item.day, item.meal, to),
      });
    }
  }
}

export const kitchenExtrasTestStore = {
  /** The twin of getShoppingPricesFor. */
  getShoppingPricesFor(viewerId: string): ShoppingPrice[] | null {
    if (!may(viewerId, canPriceShoppingList)) return null;
    const cycle = testStore.currentCycleNumber();
    return [...state().prices.values()]
      .filter((p) => p.cycle === cycle)
      .map(({ cycle: _cycle, ...p }) => p);
  },

  /** The twin of setShoppingPrice. */
  setShoppingPrice(input: {
    actorId: string;
    key: string;
    shop: string | null;
    amountCents: number | null;
    kind: PriceKind;
    currency: string;
    expectedVersion: number;
  }): PriceWriteResult<{ version: number }> {
    if (!isCurrency(input.currency))
      return { ok: false, error: PRICE_RANDS_ONLY };
    if (
      input.amountCents !== null &&
      (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
    ) {
      return { ok: false, error: PRICE_BAD_AMOUNT };
    }
    if (!may(input.actorId, canPriceShoppingList)) {
      return { ok: false, error: NOT_A_PRICE_KEEPER };
    }
    const cycle = testStore.currentCycleNumber();
    const id = `${cycle}:${input.key}`;
    const row = state().prices.get(id);
    if ((row?.version ?? 0) !== input.expectedVersion) {
      return { ok: false, error: PRICE_CHANGED };
    }
    const version = (row?.version ?? 0) + 1;
    state().prices.set(id, {
      cycle,
      key: input.key,
      shop: input.shop?.trim() || null,
      amountCents: input.amountCents,
      kind: input.kind,
      version,
    });
    return { ok: true, version };
  },

  /** The twin of getMealChecks. */
  getMealChecks(): MealChecks {
    const cycle = testStore.currentCycleNumber();
    const ids = new Set(storeKitchenMenu(cycle).items.map((i) => i.id));
    return {
      plans: [...state().plans.values()].filter((p) => ids.has(p.menuItemId)),
      prepSteps: state()
        .steps.filter((s) => s.cycle === cycle)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map(({ cycle: _c, taskId: _t, ...s }) => s),
    };
  },

  /** The twin of listSheetPrepSteps. */
  listSheetPrepSteps(cycle: number): SheetPrepStep[] {
    const menu = storeKitchenMenu(cycle);
    return state()
      .steps.filter((s) => s.cycle === cycle)
      .flatMap((s) => {
        const item = menu.items.find((i) => i.id === s.menuItemId);
        if (!item) return [];
        return [
          {
            dueDate: s.dueDate,
            what: s.what,
            recipeTitle:
              menu.recipes[item.recipeId]?.title ?? "Untitled recipe",
            day: item.day,
            meal: item.meal,
          },
        ];
      });
  },

  /** The twin of recordAllergenPlan. */
  recordAllergenPlan(input: {
    actorId: string;
    itemId: string;
    kind: AllergenPlanKind;
    details: string;
    allergens: readonly string[];
    expectedVersion: number;
  }): MealWriteResult<{ version: number }> {
    if (!may(input.actorId, canCheckMenuAllergens)) {
      return { ok: false, error: NOT_A_MEAL_CHECKER };
    }
    const details = input.details.trim();
    if (!details) return { ok: false, error: PLAN_NEEDS_WORDS };
    if (!menuItem(input.itemId)) return { ok: false, error: MEAL_ITEM_GONE };
    const current = state().plans.get(input.itemId);
    if ((current?.version ?? 0) !== input.expectedVersion) {
      return { ok: false, error: PLAN_CHANGED };
    }
    const version = (current?.version ?? 0) + 1;
    state().plans.set(input.itemId, {
      menuItemId: input.itemId,
      kind: input.kind,
      details,
      allergens: readAllergens(input.allergens),
      version,
    });
    return { ok: true, version };
  },

  /** The twin of correctRecipeAllergens. */
  correctRecipeAllergens(input: {
    actorId: string;
    recipeId: string;
    versionId: string;
    allergens: readonly string[];
    expectedRevision: number;
  }): MealWriteResult<{ revision: number }> {
    if (!may(input.actorId, canCheckMenuAllergens)) {
      return { ok: false, error: NOT_A_MEAL_CHECKER };
    }
    const book = testStore.kitchenMenuRecipes([input.recipeId])[input.recipeId];
    if (!book || book.versionId !== input.versionId) {
      return { ok: false, error: RECIPE_NEWER_VERSION };
    }
    const current = state().corrections.get(input.versionId);
    if ((current?.revision ?? 0) !== input.expectedRevision) {
      return { ok: false, error: ALLERGENS_CHANGED };
    }
    const revision = (current?.revision ?? 0) + 1;
    state().corrections.set(input.versionId, {
      allergens: readAllergens(input.allergens),
      revision,
    });
    return { ok: true, revision };
  },

  /** The twin of addPrepStep. */
  addPrepStep(input: {
    actorId: string;
    itemId: string;
    what: string;
    when: PrepTiming;
    date: string | null;
  }): MealWriteResult<{ stepId: string; onBoard: boolean; due: string }> {
    if (!may(input.actorId, canAddPrepSteps)) {
      return { ok: false, error: NOT_A_MEAL_CHECKER };
    }
    const what = input.what.trim();
    if (!what) return { ok: false, error: PREP_NEEDS_WORDS };
    const item = menuItem(input.itemId);
    if (!item) return { ok: false, error: MEAL_ITEM_GONE };
    const cycle = testStore.currentCycleNumber();
    const plan = testStore.getMealPlan(cycle);
    const due = prepDueDate({
      firstDay: plan.firstDay,
      day: item.day,
      when: input.when,
      date: input.date,
    });
    if (!due.ok) return due;
    const onBoard = prepGoesOnBoard(due.due, plan.firstDay!);
    let taskId: string | null = null;
    if (onBoard) {
      const task = testStore.addTask({
        creatorId: input.actorId,
        title: prepTaskTitle(
          item.title,
          mealPlates(plan.days, item.day, item.meal),
          what,
        ),
        description: prepTaskDetails(item.day, item.meal, plan.firstDay),
        team: "kitchen",
        assigneeId: null,
        dueAt: campDayStart(due.due),
      });
      if (!task.ok) return task;
      taskId = task.id;
    }
    const stepId = randomUUID();
    state().steps.push({
      id: stepId,
      cycle,
      menuItemId: item.id,
      what,
      timing: input.when,
      dueDate: due.due,
      onBoard,
      taskId,
    });
    return { ok: true, stepId, onBoard, due: due.due };
  },

  /** The twin of removePrepStep. */
  removePrepStep(input: { actorId: string; stepId: string }): MealWriteResult {
    if (!may(input.actorId, canAddPrepSteps)) {
      return { ok: false, error: NOT_A_MEAL_CHECKER };
    }
    const s = state();
    const at = s.steps.findIndex((x) => x.id === input.stepId);
    if (at < 0) return { ok: false, error: PREP_STEP_GONE };
    const [step] = s.steps.splice(at, 1);
    if (step?.taskId) {
      testStore.removeTask({ taskId: step.taskId, actorId: input.actorId });
    }
    return { ok: true };
  },
};
