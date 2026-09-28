"use server";

import { campDayKey } from "@camp404/core";
import { MemberRefundRequestInput, PledgeInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { requestRefund, savePledge } from "@/lib/dues";
import { revalidateDues } from "@/lib/dues-revalidate";
import { ledgerCycle } from "@/lib/payments";

// A member's own dues writes (#240): their pledge, and asking for a refund of
// one of their own received payments. Any approved member, for themselves
// only: the actor is always the signed-in member, never an id from the form.
// Proof of payment comes in through /api/uploads/payment-proof, which takes
// the file.

export async function savePledgeAction(
  input: unknown,
): Promise<ActionResult<{ charged: boolean }>> {
  return runAction("savePledgeAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = PledgeInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Pick what you can pay.",
      };
    }
    const result = await savePledge({
      userId: gate.campUser.id,
      cycle: await ledgerCycle(),
      pledge: parsed.data,
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true, data: { charged: result.charged } };
  });
}

export async function requestMyRefundAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("requestMyRefundAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = MemberRefundRequestInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }
    const result = await requestRefund({
      paymentId: parsed.data.paymentId,
      amountCents: null,
      note: parsed.data.note,
      actorId: gate.campUser.id,
      today: campDayKey(new Date()),
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true };
  });
}
