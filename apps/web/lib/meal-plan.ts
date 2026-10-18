import "server-only";

import * as db from "@camp404/db/meal-plan";
import type { MealPlan, MealPlanWriteResult } from "@camp404/db/meal-plan";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The kitchen's meal plan (2026-09-24), from the database or, under E2E, the
// test store's twin. Its input is checked by one Zod schema on both sides
// (MealPlanInput), and who may save it is one rule (MEAL_PLAN_EDITOR);
// lib/__tests__/meal-plan-agreement.test.ts holds the rest equal. The write
// re-checks the actor itself, so a caller passes only who is acting.

export type { MealPlan, MealPlanWriteResult };

const plan = twin(db, testStore, ["getMealPlan", "setMealPlan"]);

/** This year's meal plan (or a given year's), or the defaults. */
export const getMealPlan = plan.getMealPlan;

/** A captain or a Kitchen lead saves this year's meal plan. */
export const setMealPlan = plan.setMealPlan;
