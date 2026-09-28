"use server";

import { z } from "zod";
import {
  AssignLoadInput,
  EditGridNodeInput,
  GridNodeInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { CHECK_GRID, POWER_REFUSAL } from "@/lib/power-copy";
import { firstIssue, powerGate, revalidatePower } from "@/lib/power-gate";
import {
  addGridNode,
  assignLoadToGridNode,
  copyLastYearGrid,
  removeGridNode,
  updateGridNode,
} from "@/lib/power-site";

// The grid plan's writes (#256). Each action: the gate (a captain or a Power
// & Lighting lead), the Zod boundary, then the facade with the actor's id
// alone. The rule, the year and the tree's shape are checked again inside
// each write's transaction.

const RemoveNodeInput = z.object({
  nodeId: z.guid(),
  expectedVersion: z.number().int().min(0),
});

export async function addGridNodeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addGridNodeAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = GridNodeInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_GRID) };
    }
    const result = await addGridNode({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

export async function updateGridNodeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateGridNodeAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = EditGridNodeInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_GRID) };
    }
    const result = await updateGridNode({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

export async function removeGridNodeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeGridNodeAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveNodeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_GRID };
    const result = await removeGridNode({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/** Plugs a load in at a point on the grid, or takes it off (null). */
export async function assignLoadAction(input: unknown): Promise<ActionResult> {
  return runAction("assignLoadAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AssignLoadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_GRID };
    const result = await assignLoadToGridNode({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/** Copies the most recent earlier year's grid, when this year has none. */
export async function copyLastYearGridAction(): Promise<
  ActionResult<{ count: number }>
> {
  return runAction("copyLastYearGridAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const result = await copyLastYearGrid({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { count: result.count } };
  });
}
