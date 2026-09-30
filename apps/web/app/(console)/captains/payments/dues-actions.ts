"use server";

import { z } from "zod";
import {
  campDayKey,
  parseStatement,
  proposeStatementMatches,
  STATEMENT_MAX_BYTES,
  type StatementProposal,
} from "@camp404/core";
import { MoneyRefused } from "@camp404/db/dues";
import {
  ChargeInput,
  DuesYearInput,
  EditFeeTierInput,
  FeeTierInput,
  PaymentPlanInput,
  RefundDecisionInput,
  RefundRequestInput,
  SetFeeInput,
  SettleUpInput,
  StatementConfirmInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  addCharge,
  addFeeTier,
  archiveFeeTier,
  cancelCharge,
  decideRefund,
  editFeeTier,
  publishSettleUp,
  requestRefund,
  saveDuesYear,
  setFee,
  setPaymentPlan,
  statementContext,
  type MoneyResult,
} from "@/lib/dues";
import { revalidateDues } from "@/lib/dues-revalidate";
import { moneyActionGate } from "@/lib/money-gate";
import { ledgerCycle, recordPayment, setPaymentStatus } from "@/lib/payments";

// The Finance tools' writes (#240), for captains and Finance leads. Each
// action: the gate (moneyActionGate), the Zod boundary, then the facade with
// the actor's id alone. The rule is checked again inside each write's own
// transaction, which writes the audit row there too.

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

// --- The year's settings ---------------------------------------------------------

export async function saveDuesYearAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveDuesYearAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = DuesYearInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await saveDuesYear({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function addFeeTierAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addFeeTierAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = FeeTierInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await addFeeTier({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function editFeeTierAction(input: unknown): Promise<ActionResult> {
  return runAction("editFeeTierAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = EditFeeTierInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await editFeeTier({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true };
  });
}

export async function archiveFeeTierAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("archiveFeeTierAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = z.object({ tierId: Id }).safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const result = await archiveFeeTier({
      tierId: parsed.data.tierId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true };
  });
}

// --- One member's account ---------------------------------------------------------

const SetFeeAction = SetFeeInput.extend({
  expectedFeeId: Id.nullable(),
});

export async function setFeeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("setFeeAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = SetFeeAction.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await setFee({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function addChargeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addChargeAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = ChargeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await addCharge({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

export async function cancelChargeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("cancelChargeAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = z.object({ chargeId: Id }).safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const result = await cancelCharge({
      chargeId: parsed.data.chargeId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true };
  });
}

export async function setPaymentPlanAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("setPaymentPlanAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = PaymentPlanInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await setPaymentPlan({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

// --- Refunds ----------------------------------------------------------------------

export async function requestRefundAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("requestRefundAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = RefundRequestInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await requestRefund({
        paymentId: parsed.data.paymentId,
        amountCents: parsed.data.amountCents,
        note: parsed.data.note,
        actorId: gate.campUser.id,
        today: campDayKey(new Date()),
      }),
    );
  });
}

export async function decideRefundAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("decideRefundAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = RefundDecisionInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await decideRefund({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateDues();
    return { ok: true };
  });
}

// --- Settle-up ----------------------------------------------------------------------

const PublishSettleUp = SettleUpInput.extend({
  previewedUserIds: z.array(z.string().min(1).max(64)).max(500),
});

export async function publishSettleUpAction(
  input: unknown,
): Promise<ActionResult<{ id: string; members: number }>> {
  return runAction("publishSettleUpAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = PublishSettleUp.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return settle(
      await publishSettleUp({
        ...parsed.data,
        cycle: await ledgerCycle(),
        actorId: gate.campUser.id,
      }),
    );
  });
}

// --- The bank statement import -------------------------------------------------------

export interface StatementPreview {
  proposals: StatementProposal[];
  skippedOutgoing: number;
  skippedUnreadable: number;
  /** Every member, for a line the Finance team names by hand. */
  members: { id: string; name: string; refCode: string | null }[];
}

/**
 * Read a bank or transfer-service statement the Finance team uploaded and
 * propose a member for each line of money coming in. The file is read here,
 * in memory, and never stored: nothing is written until a line is confirmed.
 */
export async function previewStatementAction(
  form: FormData,
): Promise<ActionResult<StatementPreview>> {
  return runAction("previewStatementAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const file = form.get("statement");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose the statement file first." };
    }
    if (file.size > STATEMENT_MAX_BYTES) {
      return {
        ok: false,
        error: "That file is too big. Download a shorter date range.",
      };
    }
    const parsed = parseStatement(await file.text());
    if (!parsed.ok) return parsed;
    const context = await statementContext(await ledgerCycle());
    return {
      ok: true,
      data: {
        proposals: proposeStatementMatches(
          parsed.lines,
          context.members,
          context.payments,
        ),
        skippedOutgoing: parsed.skippedOutgoing,
        skippedUnreadable: parsed.skippedUnreadable,
        members: context.members
          .filter((m) => m.refCode !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  });
}

/**
 * Confirm one statement line: a new payment, received, for the member the
 * Finance team named; or the member's own pending payment, marked received.
 */
export async function confirmStatementLineAction(
  input: unknown,
): Promise<ActionResult<{ reference: string | null }>> {
  return runAction("confirmStatementLineAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;
    const parsed = StatementConfirmInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const line = parsed.data;
    try {
      if (line.kind === "reconcile") {
        const moved = await setPaymentStatus({
          paymentId: line.paymentId,
          from: "pending",
          to: "reconciled",
          actorId: gate.campUser.id,
        });
        revalidateDues();
        if (!moved) {
          return {
            ok: false,
            error: "That payment was already changed. Check the ledger.",
          };
        }
        return { ok: true, data: { reference: null } };
      }
      const { reference } = await recordPayment({
        userId: line.userId,
        amountCents: line.amountCents,
        currency: "ZAR",
        status: "reconciled",
        note: line.description || null,
        recordedByUserId: gate.campUser.id,
        source: "statement",
        method: "bank_transfer",
        paidOn: line.paidOn,
      });
      revalidateDues();
      return { ok: true, data: { reference } };
    } catch (error) {
      if (error instanceof MoneyRefused) {
        return { ok: false, error: error.sentence };
      }
      throw error;
    }
  });
}
