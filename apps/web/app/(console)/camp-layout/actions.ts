"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditLayout } from "@camp404/core";
import { SaveLayoutInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  copyLastYearLayout,
  restoreLayoutVersion,
  saveCampLayout,
  shareCampLayout,
  unshareCampLayout,
} from "@/lib/camp-layout";
import {
  CHECK_LAYOUT_INPUT,
  LAYOUT_PATH,
  LAYOUT_REFUSAL,
  SHARE_REFUSAL,
} from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";

// The camp layout's writes (#271). Each action: the gate, the Zod boundary,
// then the facade with the actor's id alone. The gate answers the screen; the
// rule is checked again inside each write's own transaction, which re-reads
// the actor's rank and led teams and never takes a team list from here.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

/**
 * The editor's gate: the rank gate at team_lead (clearance is global), then
 * canEditLayout on the teams they lead, so a lead of another team is told
 * here rather than by the write.
 */
async function layoutGate(): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", LAYOUT_REFUSAL);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canEditLayout(gate.rank, led)) {
    return { ok: false, error: LAYOUT_REFUSAL };
  }
  return gate;
}

const RestoreInput = z.object({
  number: z.number().int().min(1),
  expectedVersion: z.number().int().min(0),
});

export async function saveLayoutAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveLayoutAction", async () => {
    const gate = await layoutGate();
    if (!gate.ok) return gate;
    const parsed = SaveLayoutInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_LAYOUT_INPUT,
      };
    }
    const result = await saveCampLayout({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(LAYOUT_PATH);
    return { ok: true, data: { version: result.version } };
  });
}

export async function restoreLayoutVersionAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("restoreLayoutVersionAction", async () => {
    const gate = await layoutGate();
    if (!gate.ok) return gate;
    const parsed = RestoreInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_LAYOUT_INPUT };
    const result = await restoreLayoutVersion({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(LAYOUT_PATH);
    return { ok: true, data: { version: result.version } };
  });
}

/** Starts this year's plan from the latest earlier year's, when it has none. */
export async function copyLastYearLayoutAction(): Promise<
  ActionResult<{ fromCycle: number }>
> {
  return runAction("copyLastYearLayoutAction", async () => {
    const gate = await layoutGate();
    if (!gate.ok) return gate;
    const result = await copyLastYearLayout({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePath(LAYOUT_PATH);
    return { ok: true, data: { fromCycle: result.fromCycle } };
  });
}

/** Turns the neighbour link on, or replaces it. A captain only. */
export async function shareLayoutAction(): Promise<
  ActionResult<{ token: string }>
> {
  return runAction("shareLayoutAction", async () => {
    const gate = await captainActionGate("captain", SHARE_REFUSAL);
    if (!gate.ok) return gate;
    const result = await shareCampLayout({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePath(LAYOUT_PATH);
    return { ok: true, data: { token: result.token } };
  });
}

/** Turns the neighbour link off: it answers 404 from now on. A captain only. */
export async function unshareLayoutAction(): Promise<ActionResult> {
  return runAction("unshareLayoutAction", async () => {
    const gate = await captainActionGate("captain", SHARE_REFUSAL);
    if (!gate.ok) return gate;
    const result = await unshareCampLayout({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePath(LAYOUT_PATH);
    return { ok: true };
  });
}
