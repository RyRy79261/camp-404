"use server";

import type { RentalOrderStatus } from "@camp404/types";
import { SaveRentalOrderInput, WithdrawRentalOrderInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { ledgerCycle } from "@/lib/payments";
import { saveRentalOrder, withdrawRentalOrder } from "@/lib/rental";
import { revalidateRental } from "@/lib/rental-revalidate";

// A member's own gear order (#241): save it as a draft or send it, and take a
// sent one back to change it. Any approved member, for themselves only: the
// order is always the signed-in member's, never an id from the form. The
// member says only what they need; the source and the price are the captain's.

export async function saveMyGearAction(
  input: unknown,
): Promise<ActionResult<{ version: number; status: RentalOrderStatus }>> {
  return runAction("saveMyGearAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = SaveRentalOrderInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check your order.",
      };
    }
    const result = await saveRentalOrder({
      userId: gate.campUser.id,
      cycle: await ledgerCycle(),
      ...parsed.data,
    });
    if (!result.ok) return result;
    revalidateRental();
    return {
      ok: true,
      data: { version: result.version, status: result.status },
    };
  });
}

export async function changeMyGearAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("changeMyGearAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = WithdrawRentalOrderInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Reload the page and try again." };
    }
    const result = await withdrawRentalOrder({
      userId: gate.campUser.id,
      cycle: await ledgerCycle(),
      expectedVersion: parsed.data.expectedVersion,
    });
    if (!result.ok) return result;
    revalidateRental();
    return { ok: true, data: { version: result.version } };
  });
}
