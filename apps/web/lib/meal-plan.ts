import "server-only";

import * as db from "@camp404/db/meal-plan";
import type { MealPlan, MealPlanWriteResult } from "@camp404/db/meal-plan";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The kitchen's meal plan (2026-09-24), from the database or, under E2E, the
// test store. The rules live in @camp404/db/meal-plan; the store repeats
// them. The write re-checks the actor itself, so a caller passes only who is
// acting.

export type { MealPlan, MealPlanWriteResult };

/** This year's meal plan (or a given year's), or the defaults. */
export async function getMealPlan(cycle?: number): Promise<MealPlan> {
  return usesTestStore() ? testStore.getMealPlan(cycle) : db.getMealPlan(cycle);
}

/** A captain or a Kitchen lead saves this year's meal plan. */
export async function setMealPlan(
  input: Parameters<typeof db.setMealPlan>[0],
): Promise<MealPlanWriteResult<{ version: number }>> {
  return usesTestStore() ? testStore.setMealPlan(input) : db.setMealPlan(input);
}
