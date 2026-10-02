"use server";

import { revalidatePath } from "next/cache";
import { canPriceShoppingList, canTickShoppingList } from "@camp404/core";
import { SetShoppingPriceInput, SetShoppingTicksInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { setShoppingPrice, setShoppingTicks } from "@/lib/kitchen-menu";
import {
  CHECK_PRICE,
  PRICE_REFUSAL,
  SHOPPING_LIST_PATH,
  TICK_REFUSAL,
} from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";

// The shopping list's two writes (#245). Ticks are shared by the whole camp,
// and any approved member may tick (the owner, 2026-09-30). The gate answers
// the screen; the write checks the member again. Each line carries the amount
// the member saw, so a tick given for 2 kg does not read as bought once the
// list needs 3 kg.
//
// A line's shop and price (the owner's Option A, 2026-10-02) belong to a
// captain or a Kitchen lead (canPriceShoppingList): the gate here, then the
// Zod boundary (rands only), then the write, which re-reads the actor inside
// its own transaction, compares the line's version and writes the audit row.

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

/** Set a line's shop and price, as a captain or a Kitchen lead. */
export async function setShoppingPriceAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("setShoppingPriceAction", async () => {
    const gate = await captainActionGate("team_lead", PRICE_REFUSAL);
    if (!gate.ok) return gate;
    const led =
      gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
    if (!canPriceShoppingList(gate.rank, led)) {
      return { ok: false, error: PRICE_REFUSAL };
    }
    const parsed = SetShoppingPriceInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_PRICE,
      };
    }
    const result = await setShoppingPrice({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(SHOPPING_LIST_PATH);
    return { ok: true, data: { version: result.version } };
  });
}
