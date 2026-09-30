"use server";

import type { z } from "zod";
import {
  ArchiveRentalItemInput,
  ConfirmRentalOrderInput,
  EditRentalItemInput,
  RentalItemInput,
  ReopenRentalOrderInput,
  TentLabelInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { ledgerCycle } from "@/lib/payments";
import {
  addRentalItem,
  archiveRentalItem,
  confirmRentalOrder,
  editRentalItem,
  reopenRentalOrder,
  setTentLabel,
} from "@/lib/rental";
import { rentalActionGate } from "@/lib/rental-gate";
import { revalidateRental } from "@/lib/rental-revalidate";

// The captains' gear rental writes (#241). Each action: the gate
// (rentalActionGate), the Zod boundary, then the facade with the actor's id
// alone. The rule is checked again inside each write's own transaction, which
// writes the audit row there too.

const CHECK = "Check the form and try again.";

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? CHECK;
}

// --- The catalogue ---------------------------------------------------------------

export async function addRentalItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addRentalItemAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = RentalItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await addRentalItem({
      cycle: await ledgerCycle(),
      item: parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental();
    return { ok: true, data: { id: result.id } };
  });
}

export async function editRentalItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("editRentalItemAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = EditRentalItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await editRentalItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental();
    return { ok: true };
  });
}

export async function archiveRentalItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("archiveRentalItemAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = ArchiveRentalItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const result = await archiveRentalItem({
      itemId: parsed.data.itemId,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental();
    return { ok: true };
  });
}

// --- Orders ------------------------------------------------------------------------

export async function confirmRentalOrderAction(
  input: unknown,
): Promise<ActionResult<{ totalCents: number; charged: boolean }>> {
  return runAction("confirmRentalOrderAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = ConfirmRentalOrderInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await confirmRentalOrder({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental({ money: true });
    return {
      ok: true,
      data: {
        totalCents: result.totalCents,
        charged: result.chargeId !== null,
      },
    };
  });
}

export async function reopenRentalOrderAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("reopenRentalOrderAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = ReopenRentalOrderInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK };
    const result = await reopenRentalOrder({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental({ money: true });
    return { ok: true };
  });
}

export async function setTentLabelAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setTentLabelAction", async () => {
    const gate = await rentalActionGate();
    if (!gate.ok) return gate;
    const parsed = TentLabelInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await setTentLabel({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRental();
    return { ok: true };
  });
}
