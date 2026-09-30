"use server";

import { z } from "zod";
import {
  DEFAULT_CURRENCY,
  PAYMENT_STATUSES,
  parseMoneyToMinor,
} from "@camp404/core";
import { Currency } from "@camp404/types";
import { MoneyRefused } from "@camp404/db/dues";
import { runAction } from "@/lib/action-result";
import { revalidateDues } from "@/lib/dues-revalidate";
import { moneyActionGate } from "@/lib/money-gate";
import { recordPayment, setPaymentStatus } from "@/lib/payments";
import { findCampUserById } from "@/lib/users";

// The payments ledger's writes, for the Finance team: captains and Finance
// leads (canManageMoney). Each write checks that again inside its own
// transaction and writes its audit row there.

export type PaymentActionResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

const Status = z.enum(PAYMENT_STATUSES);
const Id = z.string().min(1);
const MAX_NOTE = 500;

/** Record a payment for this year from what the bank statement shows. */
export async function recordPaymentAction(input: {
  userId: string;
  amount: string;
  status: string;
  note?: string;
  /** Only "ZAR", the camp's one currency; left out, the payment is in rands. */
  currency?: string;
}): Promise<PaymentActionResult> {
  return runAction("recordPaymentAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;

    if (!Id.safeParse(input?.userId).success) {
      return { ok: false, error: "Pick the member who paid." };
    }
    // Money is in rands only. A caller that says another currency is refused,
    // not recorded as the same number of rands; "zar" is refused too, not
    // fixed up, like every money write path.
    const currency = Currency.safeParse(input.currency ?? DEFAULT_CURRENCY);
    if (!currency.success) {
      return { ok: false, error: "Payments are recorded in rands (ZAR) only." };
    }
    const amountCents = parseMoneyToMinor(String(input.amount ?? ""));
    if (amountCents === null) {
      return {
        ok: false,
        error: "Type the amount in rands, like 1250 or 1250,50.",
      };
    }
    const status = Status.safeParse(input.status);
    if (!status.success) return { ok: false, error: "Pick a status." };
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > MAX_NOTE) {
      return {
        ok: false,
        error: `Keep the note under ${MAX_NOTE} characters.`,
      };
    }
    const member = await findCampUserById(input.userId);
    if (!member) return { ok: false, error: "Member not found." };

    let reference: string;
    try {
      ({ reference } = await recordPayment({
        userId: input.userId,
        amountCents,
        currency: currency.data,
        status: status.data,
        note: note || null,
        recordedByUserId: gate.campUser.id,
      }));
    } catch (error) {
      if (error instanceof MoneyRefused) {
        return { ok: false, error: error.sentence };
      }
      throw error;
    }
    revalidateDues();
    return { ok: true, reference };
  });
}

/** Mark a payment received or waived, or put it back to pending. */
export async function setPaymentStatusAction(input: {
  paymentId: string;
  from: string;
  to: string;
}): Promise<PaymentActionResult> {
  return runAction("setPaymentStatusAction", async () => {
    const gate = await moneyActionGate();
    if (!gate.ok) return gate;

    const from = Status.safeParse(input?.from);
    const to = Status.safeParse(input?.to);
    if (
      !Id.safeParse(input?.paymentId).success ||
      !from.success ||
      !to.success
    ) {
      return { ok: false, error: "Unknown payment change." };
    }
    if (from.data === to.data) return { ok: true };

    let changed: boolean;
    try {
      changed = await setPaymentStatus({
        paymentId: input.paymentId,
        from: from.data,
        to: to.data,
        actorId: gate.campUser.id,
      });
    } catch (error) {
      if (error instanceof MoneyRefused) {
        return { ok: false, error: error.sentence };
      }
      throw error;
    }
    revalidateDues();
    if (!changed) {
      return {
        ok: false,
        error:
          "Someone else already changed this payment. The list is up to date now.",
      };
    }
    return { ok: true };
  });
}
