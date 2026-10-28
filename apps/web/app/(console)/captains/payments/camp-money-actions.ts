"use server";

import { z } from "zod";
import {
  CampBalanceInput,
  CampBillInput,
  MarkCampBillPaidInput,
  SaveCampBankDetailsInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { deliverAfterResponse } from "@/lib/background-work";
import {
  addCampBill,
  markCampBillPaid,
  recordCampBalance,
  removeCampBill,
  saveCampBankDetails,
  updateCampBill,
} from "@/lib/camp-money";
import { setCollectingFees, type MoneyResult } from "@/lib/dues";
import { revalidateDues } from "@/lib/dues-revalidate";
import { askForPledges, remindFeesOwed } from "@/lib/fee-reminders";
import { moneyActionGate } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";

// The camp fees sprint's Finance writes (Camp money, Who owes what's switch
// and reminders, Finance settings' bank details), for captains and Finance
// leads. Each action: the gate (moneyActionGate, MONEY_KEEPER), the Zod
// boundary, then the facade with the actor's id alone. The rule is checked
// again inside each write's own transaction, which writes the audit row too.

const CHECK = "Check the form and try again.";

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? CHECK;
}

/** A facade result as an action result, refreshing the dues pages on success. */
function settle<T extends object>(result: MoneyResult<T>): ActionResult<T> {
  if (!result.ok) return result;
  revalidateDues();
  const { ok: _ok, ...data } = result;
  return { ok: true, data: data as T } as ActionResult<T>;
}

const Id = z.guid();

// --- Camp money ------------------------------------------------------------------

export async function recordCampBalanceAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("recordCampBalanceAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = CampBalanceInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await recordCampBalance({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function addCampBillAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addCampBillAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = CampBillInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await addCampBill({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

const UpdateBill = z.object({
  billId: Id,
  expectedVersion: z.number().int().min(1),
  bill: CampBillInput,
});

export async function updateCampBillAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("updateCampBillAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = UpdateBill.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await updateCampBill({
        ...parsed.data.bill,
        billId: parsed.data.billId,
        expectedVersion: parsed.data.expectedVersion,
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function markCampBillPaidAction(
  input: unknown,
): Promise<ActionResult<{ paidCount: number }>> {
  return runAction("markCampBillPaidAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = MarkCampBillPaidInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await markCampBillPaid({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function removeCampBillAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeCampBillAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = z
      .object({ billId: Id, expectedVersion: z.number().int().min(1) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    return settle(
      await removeCampBill({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function saveCampBankDetailsAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveCampBankDetailsAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = SaveCampBankDetailsInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await saveCampBankDetails({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

// --- Who owes what: collecting and reminders -----------------------------------------

export async function setCollectingFeesAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("setCollectingFeesAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = z
      .object({ on: z.boolean(), expectedVersion: z.number().int().min(0) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    return settle(
      await setCollectingFees({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function askForPledgesAction(): Promise<
  ActionResult<{ asked: number; notified: number }>
> {
  return runAction("askForPledgesAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const result = await askForPledges({
      cycle: await ledgerCycle(),
      actorId: gate.campUser.id,
    });
    if (result.ok && result.notified > 0) deliverAfterResponse();
    return settle(result);
  });
}

export async function remindFeesOwedAction(
  input: unknown,
): Promise<
  ActionResult<{ reminded: number; notified: number; posted: number }>
> {
  return runAction("remindFeesOwedAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = z.object({ postInTelegram: z.boolean() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const result = await remindFeesOwed({
      cycle: await ledgerCycle(),
      actorId: gate.campUser.id,
      postInTelegram: parsed.data.postInTelegram,
    });
    if (result.ok && (result.notified > 0 || result.posted > 0)) {
      deliverAfterResponse();
    }
    return settle(result);
  });
}
