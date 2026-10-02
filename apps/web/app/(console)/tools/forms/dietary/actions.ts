"use server";

import { revalidatePath } from "next/cache";
import { SaveDietaryInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { saveMyDietary } from "@/lib/dietary";
import {
  CHECK_DIETARY,
  DIETARY_FORM_PATH,
  MEAL_PLAN_PATH,
} from "@/lib/recipe-copy";

// A member saves their own dietary needs (#245): the foods they react to and
// how, and their diet. Any approved member, for themselves only: the id is the
// signed-in member's, never one from the form.

export async function saveDietaryAction(input: unknown): Promise<ActionResult> {
  return runAction("saveDietaryAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = SaveDietaryInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_DIETARY,
      };
    }
    const result = await saveMyDietary({
      userId: gate.campUser.id,
      ...parsed.data,
    });
    if (!result.ok) return result;
    revalidatePath(DIETARY_FORM_PATH);
    revalidatePath(MEAL_PLAN_PATH);
    return { ok: true };
  });
}
