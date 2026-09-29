"use server";

import { z } from "zod";
import {
  AddFuelCansInput,
  CorrectRefuelInput,
  EditFuelCanInput,
  PowerPlanInput,
  RefuelInput,
  StrikeRefuelInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { getPowerPlan, setPowerPlan } from "@/lib/power";
import {
  CHECK_CANS,
  CHECK_PLAN,
  CHECK_REFUEL,
  POWER_REFUSAL,
} from "@/lib/power-copy";
import { firstIssue, powerGate, revalidatePower } from "@/lib/power-gate";
import {
  addFuelCans,
  correctRefuel,
  logRefuel,
  removeFuelCan,
  strikeRefuel,
  updateFuelCan,
} from "@/lib/power-site";

// The refuelling page's writes (#255): the cans, the log and the low-fuel
// warning. Each action: the gate (a captain or a Power & Lighting lead), the
// Zod boundary, then the facade with the actor's id alone. The rule is
// checked again inside each write's transaction. The log is append-only:
// there is no edit and no delete here, only a correction or a strike-out,
// each a new entry.

const RemoveCanInput = z.object({
  canId: z.guid(),
  expectedVersion: z.number().int().min(0),
});

const LowFuelFields = z.object({
  lowFuelDays: z.number(),
  expectedVersion: z.number(),
});

export async function addFuelCansAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction("addFuelCansAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AddFuelCansInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_CANS) };
    }
    const result = await addFuelCans({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { count: result.count } };
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
    revalidatePower();
    return { ok: true };
  });
}

export async function removeFuelCanAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeFuelCanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveCanInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_CANS };
    const result = await removeFuelCan({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

export async function logRefuelAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("logRefuelAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RefuelInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_REFUEL) };
    }
    const result = await logRefuel({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

/** A correction: a new entry that replaces an earlier one. */
export async function correctRefuelAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("correctRefuelAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = CorrectRefuelInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_REFUEL) };
    }
    const result = await correctRefuel({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

/** A strike-out: a new entry saying an earlier one never happened. */
export async function strikeRefuelAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("strikeRefuelAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = StrikeRefuelInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_REFUEL) };
    }
    const result = await strikeRefuel({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/**
 * The low-fuel warning's days. Checked merged onto the current plan, so the
 * whole plan stays valid, and only this one field is sent.
 */
export async function saveLowFuelDaysAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveLowFuelDaysAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const fields = LowFuelFields.safeParse(input);
    if (!fields.success) return { ok: false, error: CHECK_PLAN };
    const {
      cycle: _cycle,
      version: _v,
      updatedAt: _u,
      ...current
    } = await getPowerPlan();
    const parsed = PowerPlanInput.safeParse({ ...current, ...fields.data });
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_PLAN) };
    }
    const result = await setPowerPlan({
      actorId: gate.campUser.id,
      patch: { lowFuelDays: parsed.data.lowFuelDays },
      expectedVersion: parsed.data.expectedVersion,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { version: result.version } };
  });
}
