import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { POWER_EDITOR } from "@camp404/core";
import { type CaptainActionAccess } from "@/lib/captain-gate";
import { ruleActionGate, type RuleActionAccess } from "@/lib/rule-gate";
import { POWER_PATHS } from "@/lib/power-copy";

// The one gate every power action uses (#253–#257), in a plain module: a
// "use server" file may export only async functions, and each export there
// is callable from a browser, so the gate and its helpers live here.
//
// The rank gate at team_lead (clearance is global), then POWER_EDITOR on the
// gate's actor, so a lead of another team is told here rather than
// by the write. The rule is checked again inside every write's transaction,
// which re-reads the actor's rank and led teams and never takes them from here.

export type PowerGateOk = Extract<CaptainActionAccess, { ok: true }>;

export function powerGate(refusal: string): Promise<RuleActionAccess> {
  return ruleActionGate(POWER_EDITOR, refusal);
}

/** The first sentence Zod gives, or the fallback. */
export function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Every power page reads the same rows: refresh them all. */
export function revalidatePower(): void {
  for (const path of POWER_PATHS) revalidatePath(path);
}
