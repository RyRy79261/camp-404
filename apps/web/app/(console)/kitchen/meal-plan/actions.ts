"use server";

import { revalidatePath } from "next/cache";
import { canEditMealPlan } from "@camp404/core";
import { MealPlanInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { setMealPlan } from "@/lib/meal-plan";
import {
  CHECK_MEAL_PLAN,
  MEAL_PLAN_PATH,
  MEAL_PLAN_REFUSAL,
  RECIPES_PATH,
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
