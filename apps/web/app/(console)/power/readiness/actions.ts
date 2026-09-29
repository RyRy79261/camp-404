"use server";

import { z } from "zod";
import {
  AddReadinessItemInput,
  EditReadinessItemInput,
  SharingAgreementInput,
  TickReadinessItemInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  CHECK_READINESS,
  CHECK_SHARING,
  POWER_REFUSAL,
} from "@/lib/power-copy";
import { firstIssue, powerGate, revalidatePower } from "@/lib/power-gate";
import {
  addReadinessItem,
  addWorkPlanToBoard,
  removeReadinessItem,
  removeSharingAgreement,
  saveSharingAgreement,
  startReadinessChecklist,
  tickReadinessItem,
  updateReadinessItem,
} from "@/lib/power-site";
import { revalidatePath } from "next/cache";

// The readiness page's writes (#257): the checklist, the work plan on the
// task board and the sharing agreement. Each action: the gate (a captain or a
// Power & Lighting lead), the Zod boundary, then the facade with the actor's
// id alone. The rule is checked again inside each write's transaction.

const StartInput = z.object({ generatorId: z.guid() });
const RemoveItemInput = z.object({
  itemId: z.guid(),
  expectedVersion: z.number().int().min(0),
});
const RemoveSharingInput = z.object({
  expectedVersion: z.number().int().min(1),
});

export async function startChecklistAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction("startChecklistAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = StartInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_READINESS };
    const result = await startReadinessChecklist({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { count: result.count } };
  });
}

export async function addReadinessItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addReadinessItemAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AddReadinessItemInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_READINESS) };
    }
    const result = await addReadinessItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

export async function updateReadinessItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateReadinessItemAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = EditReadinessItemInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_READINESS) };
    }
    const result = await updateReadinessItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

export async function tickReadinessItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("tickReadinessItemAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = TickReadinessItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_READINESS };
    const result = await tickReadinessItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

export async function removeReadinessItemAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeReadinessItemAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveItemInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_READINESS };
    const result = await removeReadinessItem({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/** Puts the year's work plan on the task board, once a year. */
export async function addWorkPlanAction(): Promise<
  ActionResult<{ count: number; fromCycle: number | null }>
> {
  return runAction("addWorkPlanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const result = await addWorkPlanToBoard({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePower();
    revalidatePath("/tasks");
    return {
      ok: true,
      data: { count: result.count, fromCycle: result.fromCycle },
    };
  });
}

export async function saveSharingAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveSharingAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = SharingAgreementInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_SHARING) };
    }
    const result = await saveSharingAgreement({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { version: result.version } };
  });
}

export async function removeSharingAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeSharingAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveSharingInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_SHARING };
    const result = await removeSharingAgreement({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}
