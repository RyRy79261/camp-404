"use server";

import { BudgetInput, ClaimPayInput, ClaimRefInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { auditReadAfterResponse } from "@/lib/audit";
import { payClaim, readClaimAccount, setTeamBudget } from "@/lib/claims";
import { revalidateClaims } from "@/lib/claims-revalidate";
import { moneyActionGate } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";

// The Finance tools' claim and budget writes (#242), for captains and Finance
// leads (moneyActionGate). Each write checks the rule again inside its own
// transaction, which writes the audit row there too. Opening a claim's bank
// details is a read, recorded after the response like every read of
// someone's private data.

const CHECK = "Check the form and try again.";

export async function payClaimAction(input: unknown): Promise<ActionResult> {
  return runAction("payClaimAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = ClaimPayInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? CHECK };
    }
    const result = await payClaim({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateClaims();
    return { ok: true };
  });
}

export async function readClaimAccountAction(
  input: unknown,
): Promise<ActionResult<{ details: string }>> {
  return runAction("readClaimAccountAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = ClaimRefInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const account = await readClaimAccount(parsed.data.claimId);
    if (!account) {
      return { ok: false, error: "That claim isn't there any more." };
    }
    if (account.submitterId !== gate.campUser.id) {
      auditReadAfterResponse({
        actorId: gate.campUser.id,
        action: "reimbursement.account_viewed",
        target: account.submitterId,
        metadata: { reimbursementId: parsed.data.claimId, team: account.team },
      });
    }
    if (account.details.state === "unreadable") {
      return {
        ok: false,
        error:
          "These bank details can't be read with this site's key. Ask the member for them again.",
      };
    }
    if (account.details.state === "absent") {
      return {
        ok: false,
        error: "No bank details are on file: the member's account was erased.",
      };
    }
    return { ok: true, data: { details: account.details.value } };
  });
}

export async function setBudgetAction(input: unknown): Promise<ActionResult> {
  return runAction("setBudgetAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = BudgetInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? CHECK };
    }
    const result = await setTeamBudget({
      ...parsed.data,
      cycle: await ledgerCycle(),
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateClaims();
    return { ok: true };
  });
}
