"use server";

import { ClaimDecisionInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { APPROVALS_REFUSAL } from "@/lib/claims-copy";
import { decideClaim } from "@/lib/claims";
import { revalidateClaims } from "@/lib/claims-revalidate";

// A team's yes or no on a claim (#242): a lead OF THAT TEAM, or a captain, at
// any amount (owner, 2026-09-30). The rank gate stands at team_lead because
// clearance is global; which team's claims a lead may decide is
// canApproveClaim, checked again inside the write's own transaction with the
// lead flags read there. The actor is always the signed-in member.

export async function decideClaimAction(input: unknown): Promise<ActionResult> {
  return runAction("decideClaimAction", async () => {
    const gate = await captainActionGate("team_lead", APPROVALS_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = ClaimDecisionInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }
    const result = await decideClaim({
      claimId: parsed.data.claimId,
      decision: parsed.data.decision,
      note: parsed.data.note,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateClaims();
    return { ok: true };
  });
}
