"use server";

import { revalidatePath } from "next/cache";
import { canAskForAttendance, canEditLogistics } from "@camp404/core";
import {
  ClearLogisticsPhaseInput,
  SetAttendanceInput,
  SetLogisticsPhaseInput,
  type AttendanceAnswer,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  askForAttendance,
  clearLogisticsPhase,
  saveLogisticsPhase,
  setMyAttendance,
  type LogisticsCalendarOutcome,
} from "@/lib/logistics";
import {
  ASK_REFUSAL,
  CHECK_PHASE,
  LOGISTICS_PATH,
  LOGISTICS_REFUSAL,
} from "@/lib/logistics-copy";
import { deliverAfterResponse } from "@/lib/background-work";
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

// --- Attendance --------------------------------------------------------------

/**
 * The signed-in member's own answer for one phase: going, maybe or can't.
 * Any approved member, for themselves only; never an id from the form.
 */
export async function setMyAttendanceAction(
  input: unknown,
): Promise<ActionResult<{ answer: AttendanceAnswer }>> {
  return runAction("setMyAttendanceAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = SetAttendanceInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Reload the page and try again." };
    }
    const result = await setMyAttendance(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(LOGISTICS_PATH);
    return { ok: true, data: { answer: result.answer } };
  });
}

/**
 * "Ask everyone": nudge each member who is coming and has not answered every
 * phase still open. A captain only (canAskForAttendance); the write checks
 * again. Its notices go out after the response.
 */
export async function askForAttendanceAction(): Promise<
  ActionResult<{ asked: number; notified: number }>
> {
  return runAction("askForAttendanceAction", async () => {
    const gate = await captainActionGate("team_lead", ASK_REFUSAL);
    if (!gate.ok) return gate;
    if (!canAskForAttendance(gate.rank)) {
      return { ok: false, error: ASK_REFUSAL };
    }
    const result = await askForAttendance(gate.campUser.id);
    if (!result.ok) return result;
    if (result.notified > 0) deliverAfterResponse();
    revalidatePath(LOGISTICS_PATH);
    return {
      ok: true,
      data: { asked: result.asked, notified: result.notified },
    };
  });
}
