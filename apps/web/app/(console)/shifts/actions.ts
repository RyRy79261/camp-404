"use server";

import { revalidatePath } from "next/cache";
import { canAskForShifts, canManageShifts } from "@camp404/core";
import {
  AddVolunteerShiftInput,
  FillShiftDaysInput,
  RemoveShiftTypeInput,
  RemoveVolunteerShiftInput,
  SaveShiftTypeInput,
  SetSlotNeededInput,
  ShiftMemberInput,
  ShiftSlotInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { deliverAfterResponse } from "@/lib/background-work";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addVolunteerShift,
  askForShifts,
  fillShiftDays,
  leaveShift,
  placeMemberOnShift,
  removeShiftType,
  removeVolunteerShift,
  saveShiftType,
  setSlotNeeded,
  signUpForShift,
  takeMemberOffShift,
} from "@/lib/shifts";
import {
  ASK_SHIFTS_REFUSAL,
  CHECK_SHIFT,
  MY_SHIFTS_PATH,
  RELOAD,
  SHIFTS_ACTION_REFUSAL,
  SHIFTS_PATH,
} from "@/lib/shifts-copy";
import { getLeadTeams } from "@/lib/users";

// The shift roster's writes (#248). Each action: the gate, the Zod boundary,
// then the facade with the actor's id alone. Setting shifts up needs at least
// the team-lead rung here; WHICH team's shifts a lead may set up (a lead of
// that team, or a captain) is checked inside the write's own transaction,
// which re-reads the actor's rank and led teams and never takes a team list
// from here. Signing up, leaving and a member's own AfrikaBurn shifts are any
// approved member's, for themselves only: never an id from the form.

function revalidateShifts(): void {
  revalidatePath(SHIFTS_PATH);
  revalidatePath(MY_SHIFTS_PATH);
}

const keeperGate = () => captainActionGate("team_lead", SHIFTS_ACTION_REFUSAL);

/** Add a shift type, or change one. */
export async function saveShiftTypeAction(
  input: unknown,
): Promise<ActionResult<{ daysAdded: number }>> {
  return runAction("saveShiftTypeAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SaveShiftTypeInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_SHIFT,
      };
    }
    // The screen's answer; the write checks again with the rows it locks.
    const led =
      gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
    if (!canManageShifts(gate.rank, led, parsed.data.team)) {
      return { ok: false, error: SHIFTS_ACTION_REFUSAL };
    }
    const result = await saveShiftType(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true, data: { daysAdded: result.daysAdded } };
  });
}

/** Remove a shift type nobody is on. */
export async function removeShiftTypeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeShiftTypeAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = RemoveShiftTypeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await removeShiftType(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true };
  });
}

/** Give a shift type the Burn days it has no slot for yet. */
export async function fillShiftDaysAction(
  input: unknown,
): Promise<ActionResult<{ daysAdded: number }>> {
  return runAction("fillShiftDaysAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = FillShiftDaysInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await fillShiftDays(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true, data: { daysAdded: result.daysAdded } };
  });
}

/** Mark one day's slot not needed, or needed again. */
export async function setSlotNeededAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setSlotNeededAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SetSlotNeededInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await setSlotNeeded(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true };
  });
}

/** The signed-in member takes a place. */
export async function signUpForShiftAction(
  input: unknown,
): Promise<ActionResult<{ mine: number }>> {
  return runAction("signUpForShiftAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = ShiftSlotInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await signUpForShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true, data: { mine: result.mine } };
  });
}

/** The signed-in member leaves a place. */
export async function leaveShiftAction(
  input: unknown,
): Promise<ActionResult<{ mine: number }>> {
  return runAction("leaveShiftAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = ShiftSlotInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await leaveShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true, data: { mine: result.mine } };
  });
}

/** A lead of the shift's team, or a captain, puts a member on a slot. */
export async function placeMemberOnShiftAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("placeMemberOnShiftAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = ShiftMemberInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await placeMemberOnShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true };
  });
}

/** A lead of the shift's team, or a captain, takes a member off a slot. */
export async function takeMemberOffShiftAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("takeMemberOffShiftAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = ShiftMemberInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await takeMemberOffShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateShifts();
    return { ok: true };
  });
}

/**
 * "Ask everyone": nudge each member who is coming and has fewer than the
 * minimum. A captain only; the write checks again. Its notices go out after
 * the response.
 */
export async function askForShiftsAction(): Promise<
  ActionResult<{ asked: number; notified: number }>
> {
  return runAction("askForShiftsAction", async () => {
    const gate = await captainActionGate("team_lead", ASK_SHIFTS_REFUSAL);
    if (!gate.ok) return gate;
    if (!canAskForShifts(gate.rank)) {
      return { ok: false, error: ASK_SHIFTS_REFUSAL };
    }
    const result = await askForShifts(gate.campUser.id);
    if (!result.ok) return result;
    if (result.notified > 0) deliverAfterResponse();
    revalidatePath(SHIFTS_PATH);
    return {
      ok: true,
      data: { asked: result.asked, notified: result.notified },
    };
  });
}

/** The signed-in member lists one of their own AfrikaBurn shifts. */
export async function addVolunteerShiftAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("addVolunteerShiftAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = AddVolunteerShiftInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_SHIFT,
      };
    }
    const result = await addVolunteerShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(MY_SHIFTS_PATH);
    return { ok: true };
  });
}

/** The signed-in member removes one of their own AfrikaBurn shifts. */
export async function removeVolunteerShiftAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeVolunteerShiftAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = RemoveVolunteerShiftInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await removeVolunteerShift(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(MY_SHIFTS_PATH);
    return { ok: true };
  });
}
