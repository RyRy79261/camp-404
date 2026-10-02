"use server";

import { revalidatePath } from "next/cache";
import {
  canAddPrepSteps,
  canCheckMenuAllergens,
  canEditMealPlan,
} from "@camp404/core";
import {
  AddMenuItemInput,
  AddPrepStepInput,
  AddSnackInput,
  CorrectRecipeAllergensInput,
  MealPlanInput,
  RecordAllergenPlanInput,
  RemoveMenuItemInput,
  RemovePrepStepInput,
  RemoveSnackInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addMenuItem,
  addPrepStep,
  addSnack,
  correctRecipeAllergens,
  recordAllergenPlan,
  removeMenuItem,
  removePrepStep,
  removeSnack,
} from "@/lib/kitchen-menu";
import { setMealPlan } from "@/lib/meal-plan";
import {
  ALLERGENS_REFUSAL,
  CHECK_MEAL_PLAN,
  CHECK_MENU,
  CHECK_PREP,
  PLAN_REFUSAL,
  PREP_REFUSAL,
  MEAL_PLAN_PATH,
  MEAL_PLAN_REFUSAL,
  MENU_REFUSAL,
  RECIPES_PATH,
  SHOPPING_LIST_PATH,
  SNACK_REFUSAL,
} from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";

/** The task board, where a prep step before we leave lands. */
const TASKS_PATH = "/tasks";

// The meal plan's one write (2026-09-24): the gate (a captain or a Kitchen
// lead, canEditMealPlan), the Zod boundary, then the facade with the actor's
// id alone. The gate answers the screen; the rule is checked again inside the
// write's own transaction, which re-reads the actor's rank and led teams and
// never takes a team list from here, writes the audit row, and compares the
// version.

/** Save this year's meal plan. */
export async function saveMealPlanAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveMealPlanAction", async () => {
    const gate = await captainActionGate("team_lead", MEAL_PLAN_REFUSAL);
    if (!gate.ok) return gate;
    const led =
      gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
    if (!canEditMealPlan(gate.rank, led)) {
      return { ok: false, error: MEAL_PLAN_REFUSAL };
    }
    const parsed = MealPlanInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MEAL_PLAN,
      };
    }
    const result = await setMealPlan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(MEAL_PLAN_PATH);
    revalidatePath(RECIPES_PATH, "layout");
    return { ok: true, data: { version: result.version } };
  });
}

// The menu inside the meal plan (#244, the owner's layout A, 2026-09-30) and
// the year's snacks: the same people as the meal plan (canEditMealPlan), the
// same two moves. The gate answers the screen; each write re-reads the actor
// inside its own transaction and writes its audit row there. Each is a
// one-tap change: the screen reports a refusal as a toast.

/** The editor gate: a captain, or a lead of Kitchen this year. */
async function menuGate(
  refusal: string,
  rule: (rank: string, led: readonly string[]) => boolean = canEditMealPlan,
) {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!rule(gate.rank, led)) {
    return { ok: false as const, error: refusal };
  }
  return gate;
}

function menuChanged() {
  revalidatePath(MEAL_PLAN_PATH);
  revalidatePath(SHOPPING_LIST_PATH);
}

/** Put a recipe from the book on a meal. */
export async function addMenuItemAction(
  input: unknown,
): Promise<ActionResult<{ itemId: string }>> {
  return runAction("addMenuItemAction", async () => {
    const gate = await menuGate(MENU_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AddMenuItemInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MENU,
      };
    }
    const result = await addMenuItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    menuChanged();
    return { ok: true, data: { itemId: result.itemId } };
  });
}

/** Take a recipe off a meal. */
export async function removeMenuItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeMenuItemAction", async () => {
    const gate = await menuGate(MENU_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveMenuItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_MENU };
    const result = await removeMenuItem({
      itemId: parsed.data.itemId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    menuChanged();
    return { ok: true };
  });
}

/** Add a snack to the year's list. */
export async function addSnackAction(
  input: unknown,
): Promise<ActionResult<{ snackId: string }>> {
  return runAction("addSnackAction", async () => {
    const gate = await menuGate(SNACK_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AddSnackInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MENU,
      };
    }
    const result = await addSnack({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    menuChanged();
    return { ok: true, data: { snackId: result.snackId } };
  });
}

/** Take a snack off the year's list. */
export async function removeSnackAction(input: unknown): Promise<ActionResult> {
  return runAction("removeSnackAction", async () => {
    const gate = await menuGate(SNACK_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveSnackInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_MENU };
    const result = await removeSnack({
      snackId: parsed.data.snackId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    menuChanged();
    return { ok: true };
  });
}

// The dietary check and prep steps on the meal plan (#245; the owner's
// Option A, 2026-10-02): the same people (canCheckMenuAllergens,
// canAddPrepSteps: a captain or a Kitchen lead), the same moves. A plan and a
// correction are compare-and-set on the version the dialog opened; a prep
// step before we leave becomes a Kitchen task in the same write.

/** Record (or change) the plan for an anaphylaxis on a recipe on a meal. */
export async function recordAllergenPlanAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("recordAllergenPlanAction", async () => {
    const gate = await menuGate(PLAN_REFUSAL, canCheckMenuAllergens);
    if (!gate.ok) return gate;
    const parsed = RecordAllergenPlanInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MENU,
      };
    }
    const result = await recordAllergenPlan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(MEAL_PLAN_PATH);
    return { ok: true, data: { version: result.version } };
  });
}

/** Correct what a recipe's book version holds. */
export async function correctAllergensAction(
  input: unknown,
): Promise<ActionResult<{ revision: number }>> {
  return runAction("correctAllergensAction", async () => {
    const gate = await menuGate(ALLERGENS_REFUSAL, canCheckMenuAllergens);
    if (!gate.ok) return gate;
    const parsed = CorrectRecipeAllergensInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MENU,
      };
    }
    const result = await correctRecipeAllergens({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(MEAL_PLAN_PATH);
    return { ok: true, data: { revision: result.revision } };
  });
}

/** Add a prep step under a recipe on a meal. */
export async function addPrepStepAction(
  input: unknown,
): Promise<ActionResult<{ onBoard: boolean; due: string }>> {
  return runAction("addPrepStepAction", async () => {
    const gate = await menuGate(PREP_REFUSAL, canAddPrepSteps);
    if (!gate.ok) return gate;
    const parsed = AddPrepStepInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_PREP,
      };
    }
    const result = await addPrepStep({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(MEAL_PLAN_PATH);
    if (result.onBoard) revalidatePath(TASKS_PATH);
    return { ok: true, data: { onBoard: result.onBoard, due: result.due } };
  });
}

/** Take a prep step off, and its task off the board. */
export async function removePrepStepAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removePrepStepAction", async () => {
    const gate = await menuGate(PREP_REFUSAL, canAddPrepSteps);
    if (!gate.ok) return gate;
    const parsed = RemovePrepStepInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_PREP };
    const result = await removePrepStep({
      stepId: parsed.data.stepId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(MEAL_PLAN_PATH);
    revalidatePath(TASKS_PATH);
    return { ok: true };
  });
}
