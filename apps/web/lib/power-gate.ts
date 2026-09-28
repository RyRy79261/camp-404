import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { canEditPower } from "@camp404/core";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import { POWER_PATHS } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";

// The one gate every power action uses (#253–#257), in a plain module: a
// "use server" file may export only async functions, and each export there
// is callable from a browser, so the gate and its helpers live here.
//
// The rank gate at team_lead (clearance is global), then canEditPower on the
// teams the actor leads, so a lead of another team is told here rather than
// by the write. The rule is checked again inside every write's transaction,
// which re-reads the actor's rank and led teams and never takes them from here.

export type PowerGateOk = Extract<CaptainActionAccess, { ok: true }>;

export async function powerGate(
  refusal: string,
): Promise<PowerGateOk | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canEditPower(gate.rank, led)) return { ok: false, error: refusal };
  return gate;
}

/** The first sentence Zod gives, or the fallback. */
export function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Every power page reads the same rows: refresh them all. */
export function revalidatePower(): void {
  for (const path of POWER_PATHS) revalidatePath(path);
}
