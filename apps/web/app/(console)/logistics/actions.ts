"use server";

import { revalidatePath } from "next/cache";
import { canEditLogistics } from "@camp404/core";
import {
  ClearLogisticsPhaseInput,
  SetLogisticsPhaseInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  clearLogisticsPhase,
  saveLogisticsPhase,
  type LogisticsCalendarOutcome,
} from "@/lib/logistics";
import {
  CHECK_PHASE,
  LOGISTICS_PATH,
  LOGISTICS_REFUSAL,
} from "@/lib/logistics-copy";
import { getLeadTeams } from "@/lib/users";

// The logistics calendar's writes (#247). Each action: the gate (a captain or
// a Transport and Logistics lead), the Zod boundary, then the facade with the
// actor's id alone. The gate answers the screen; the rule is checked again
// inside the write's own transaction, which re-reads the actor's rank and led
// teams and never takes a team list from here.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

async function logisticsGate(): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", LOGISTICS_REFUSAL);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canEditLogistics(gate.rank, led)) {
    return { ok: false, error: LOGISTICS_REFUSAL };
  }
  return gate;
}

/** The pages that show the phases: this one, the calendar, Home, the team. */
function revalidateLogistics(): void {
  revalidatePath(LOGISTICS_PATH);
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath("/teams/transport_and_logistics");
}

/** Set one phase's days, place and note, and put it on the camp calendar. */
export async function saveLogisticsPhaseAction(
  input: unknown,
): Promise<ActionResult<{ calendar: LogisticsCalendarOutcome }>> {
  return runAction("saveLogisticsPhaseAction", async () => {
    const gate = await logisticsGate();
    if (!gate.ok) return gate;
    const parsed = SetLogisticsPhaseInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_PHASE,
      };
    }
    const result = await saveLogisticsPhase(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateLogistics();
    return { ok: true, data: { calendar: result.calendar } };
  });
}

/** Clear one phase's days, and take it off the camp calendar. */
export async function clearLogisticsPhaseAction(
  input: unknown,
): Promise<ActionResult<{ calendar: LogisticsCalendarOutcome }>> {
  return runAction("clearLogisticsPhaseAction", async () => {
    const gate = await logisticsGate();
    if (!gate.ok) return gate;
    const parsed = ClearLogisticsPhaseInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_PHASE };
    const result = await clearLogisticsPhase(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateLogistics();
    return { ok: true, data: { calendar: result.calendar } };
  });
}
