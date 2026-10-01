"use server";

import { revalidatePath } from "next/cache";
import { canEditMealPlan } from "@camp404/core";
import {
  AddMenuItemInput,
  AddSnackInput,
  MealPlanInput,
  RemoveMenuItemInput,
  RemoveSnackInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addMenuItem,
  addSnack,
  removeMenuItem,
  removeSnack,
} from "@/lib/kitchen-menu";
import { setMealPlan } from "@/lib/meal-plan";
import {
  CHECK_MEAL_PLAN,
  CHECK_MENU,
  MEAL_PLAN_PATH,
  MEAL_PLAN_REFUSAL,
  MENU_REFUSAL,
  RECIPES_PATH,
  SHOPPING_LIST_PATH,
  SNACK_REFUSAL,
} from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";

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
async function menuGate(refusal: string) {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canEditMealPlan(gate.rank, led)) {
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
