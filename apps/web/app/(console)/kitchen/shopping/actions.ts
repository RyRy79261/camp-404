"use server";

import { revalidatePath } from "next/cache";
import { canTickShoppingList } from "@camp404/core";
import { SetShoppingTicksInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { setShoppingTicks } from "@/lib/kitchen-menu";
import { SHOPPING_LIST_PATH, TICK_REFUSAL } from "@/lib/recipe-copy";

// The shopping list's one write (#245): ticks, shared by the whole camp, and
// any approved member may tick (the owner, 2026-09-30). The gate answers the
// screen; the write checks the member again. Each line carries the amount
// the member saw, so a tick given for 2 kg does not read as bought once the
// list needs 3 kg.

/** Tick (or untick) lines of this year's shopping list. */
export async function setShoppingTicksAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setShoppingTicksAction", async () => {
    const gate = await captainActionGate("camp_member", TICK_REFUSAL);
    if (!gate.ok) return gate;
    if (!canTickShoppingList(gate.rank)) {
      return { ok: false, error: TICK_REFUSAL };
    }
    const parsed = SetShoppingTicksInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the list and try again.",
      };
    }
    const result = await setShoppingTicks({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(SHOPPING_LIST_PATH);
    return { ok: true };
  });
}
