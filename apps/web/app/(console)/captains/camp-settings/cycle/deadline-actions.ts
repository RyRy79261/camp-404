"use server";

import { revalidatePath } from "next/cache";
import { canManageDeadlines } from "@camp404/core";
import {
  AddDeadlineInput,
  EditDeadlineInput,
  RemoveDeadlineInput,
  SetAfrikaburnDateInput,
  SetDeadlineDoneInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  addDeadline,
  editDeadline,
  removeDeadline,
  setAfrikaburnDate,
  setDeadlineDone,
  type LogisticsCalendarOutcome,
} from "@/lib/logistics";
import {
  CHECK_DEADLINE,
  DEADLINES_REFUSAL,
  LOGISTICS_PATH,
  YEAR_SETTINGS_PATH,
} from "@/lib/logistics-copy";

// The year's AfrikaBurn deadlines (owner, 2026-09-30), kept on the camp's
// year page. Each action: the gate (a captain), the Zod boundary, then the
// facade with the actor's id alone. The write checks the rule again inside
// its own transaction and writes the audit row there.

type Gate = Extract<CaptainActionAccess, { ok: true }>;
type Result = ActionResult<{ calendar: LogisticsCalendarOutcome }>;

async function keeperGate(): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("captain", DEADLINES_REFUSAL);
  if (!gate.ok) return gate;
  if (!canManageDeadlines(gate.rank)) {
    return { ok: false, error: DEADLINES_REFUSAL };
  }
  return gate;
}

/** The pages that show the deadlines. */
function revalidateDeadlines(): void {
  revalidatePath(YEAR_SETTINGS_PATH);
  revalidatePath(LOGISTICS_PATH);
  revalidatePath("/calendar");
  revalidatePath("/");
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? CHECK_DEADLINE;
}

/** Add a deadline; with a date it goes onto the camp calendar. */
export async function addDeadlineAction(input: unknown): Promise<Result> {
  return runAction("addDeadlineAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = AddDeadlineInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await addDeadline(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateDeadlines();
    return { ok: true, data: { calendar: result.calendar } };
  });
}

/** Change a deadline's title, date or note; its event follows. */
export async function editDeadlineAction(input: unknown): Promise<Result> {
  return runAction("editDeadlineAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = EditDeadlineInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await editDeadline(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateDeadlines();
    return { ok: true, data: { calendar: result.calendar } };
  });
}

/**
 * Set or change one of AfrikaBurn's standard dates (owner, 2026-10-01); with
 * a date it goes onto the camp calendar, "No round this year" takes it off.
 */
export async function setAfrikaburnDateAction(input: unknown): Promise<Result> {
  return runAction("setAfrikaburnDateAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SetAfrikaburnDateInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await setAfrikaburnDate(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateDeadlines();
    return { ok: true, data: { calendar: result.calendar } };
  });
}

/** Tick a deadline done, or not done. */
export async function setDeadlineDoneAction(input: unknown): Promise<Result> {
  return runAction("setDeadlineDoneAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SetDeadlineDoneInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_DEADLINE };
    const result = await setDeadlineDone(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateDeadlines();
    return { ok: true, data: { calendar: result.calendar } };
  });
}

/** Remove a deadline; it comes off the camp calendar. */
export async function removeDeadlineAction(input: unknown): Promise<Result> {
  return runAction("removeDeadlineAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = RemoveDeadlineInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_DEADLINE };
    const result = await removeDeadline(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidateDeadlines();
    return { ok: true, data: { calendar: result.calendar } };
  });
}
