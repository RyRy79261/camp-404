"use server";

import { revalidatePath } from "next/cache";
import {
  EditFuelCanInput,
  FuelCanInput,
  RemoveFuelCanInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { CHECK_CANS, POWER_REFUSAL } from "@/lib/power-copy";
import { firstIssue, powerGate, revalidatePower } from "@/lib/power-gate";
import { addFuelCan, removeFuelCan, updateFuelCan } from "@/lib/power-site";

// The fuel can register's writes (#255; owner, 2026-10-02): add, change and
// remove a can on the list the can sheet prints. Each action: the gate (a
// captain or a Power & Lighting lead), the Zod boundary, then the facade with
// the actor's id alone. The rule is checked again inside each write's
// transaction, which also writes the audit row. Who fills a can is never sent:
// it is the driver of the car the can travels with.

/** Power, and Transport, which shows each car's cans. */
function revalidateCans(): void {
  revalidatePower();
  revalidatePath("/transport");
}

export async function addFuelCanAction(
  input: unknown,
): Promise<ActionResult<{ number: number }>> {
  return runAction("addFuelCanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = FuelCanInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_CANS) };
    }
    const result = await addFuelCan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateCans();
    return { ok: true, data: { number: result.number } };
  });
}

export async function updateFuelCanAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateFuelCanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = EditFuelCanInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_CANS) };
    }
    const result = await updateFuelCan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateCans();
    return { ok: true };
  });
}

export async function removeFuelCanAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeFuelCanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveFuelCanInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_CANS };
    const result = await removeFuelCan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateCans();
    return { ok: true };
  });
}
