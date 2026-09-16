"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PAYMENT_STATUSES, parseRandsToCents } from "@camp404/core";
import { recordPayment, setPaymentStatus } from "@camp404/db/payments";
import { runAction } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { findCampUserById } from "@/lib/users";

// The payments ledger's writes. Captain-only. The database writes the audit
// row for each in the same transaction.

export type PaymentActionResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

const Status = z.enum(PAYMENT_STATUSES);
const Id = z.string().min(1);
const MAX_NOTE = 500;

function revalidateLedger(): void {
  revalidatePath("/captains/payments");
  // The roster's "Dues this year" reads the ledger.
  revalidatePath("/captains/camp-management");
}

/** Record a payment for this year from what the bank statement shows. */
export async function recordPaymentAction(input: {
  userId: string;
  amount: string;
  status: string;
  note?: string;
}): Promise<PaymentActionResult> {
  return runAction("recordPaymentAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;

    if (!Id.safeParse(input?.userId).success) {
      return { ok: false, error: "Pick the member who paid." };
    }
    const amountCents = parseRandsToCents(String(input.amount ?? ""));
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

    const { reference } = await recordPayment({
      userId: input.userId,
      amountCents,
      status: status.data,
      note: note || null,
      recordedByUserId: gate.campUser.id,
    });
    revalidateLedger();
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
    const gate = await captainActionGate("captain");
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

    const changed = await setPaymentStatus({
      paymentId: input.paymentId,
      from: from.data,
      to: to.data,
      actorId: gate.campUser.id,
    });
    revalidateLedger();
    if (!changed) {
      return {
        ok: false,
        error:
          "Another captain already changed this payment. The list is up to date now.",
      };
    }
    return { ok: true };
  });
}
