"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditPower } from "@camp404/core";
import {
  EditGeneratorInput,
  EditLoadInput,
  GeneratorInput,
  LoadInput,
  PowerPlanInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  addGenerator,
  addPowerLoad,
  archiveGenerator,
  copyLastYearLoads,
  copyLastYearPlan,
  getPowerPlan,
  removePowerLoad,
  setPowerPlan,
  updateGenerator,
  updatePowerLoad,
} from "@/lib/power";
import {
  CHECK_GENERATOR,
  CHECK_LOAD,
  CHECK_PLAN,
  POWER_FUEL_PATH,
  POWER_LOADS_PATH,
  POWER_REFUSAL,
} from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";

// The load list's and the fuel page's writes (#253, #254). Each action: the gate (a captain or a Power &
// Lighting lead), the Zod boundary, then the facade with the actor's id alone.
// The gate answers the screen; the rule itself is checked again inside each
// write's own transaction (lockPowerEditor), which re-reads the actor's rank
// and led teams and never takes a team list from here.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function revalidatePower(): void {
  revalidatePath(POWER_LOADS_PATH);
  revalidatePath(POWER_FUEL_PATH);
}

/**
 * The power editor's gate: the rank gate at team_lead (clearance is global),
 * then canEditPower on the teams they lead, so a lead of another team is told
 * here rather than by the write.
 */
async function powerGate(
  refusal: string,
): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canEditPower(gate.rank, led)) return { ok: false, error: refusal };
  return gate;
}

const RemoveLoadInput = z.object({
  loadId: z.guid(),
  expectedVersion: z.number().int().min(0),
});

/**
 * The plan fields the load list edits; the rest of the plan is kept. Only the
 * types here: PowerPlanInput gives the sentences, and every field is required,
 * so a missing one cannot fall back to its default and reset the plan.
 */
const PlanSettingsFields = z.object({
  daysOnSite: z.number(),
  firstPoweredDay: z.string().nullable(),
  powerFactor: z.number(),
  expectedVersion: z.number(),
});

/**
 * The plan fields the fuel page edits; the date of day 1 is the load list's
 * and is kept. Types only, every field required, as PlanSettingsFields.
 */
const hourOrNull = z.number().nullable();
const FuelPlanFields = z.object({
  generatorId: z.string().nullable(),
  secondGeneratorNote: z.string().nullable(),
  runFromHour: hourOrNull,
  runToHour: hourOrNull,
  daysOnSite: z.number(),
  powerFactor: z.number(),
  lowLoadFactor: z.number(),
  safetyMarginPct: z.number(),
  canLitres: z.number(),
  cansOwned: z.number(),
  expectedVersion: z.number(),
});

const ArchiveGeneratorInput = z.object({ generatorId: z.guid() });

export async function addLoadAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addLoadAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = LoadInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_LOAD) };
    }
    const result = await addPowerLoad({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

export async function updateLoadAction(input: unknown): Promise<ActionResult> {
  return runAction("updateLoadAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = EditLoadInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_LOAD) };
    }
    const result = await updatePowerLoad({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

export async function removeLoadAction(input: unknown): Promise<ActionResult> {
  return runAction("removeLoadAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RemoveLoadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_LOAD };
    const result = await removePowerLoad({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/** Copies the most recent earlier year's loads, when this year has none. */
export async function copyLastYearLoadsAction(): Promise<
  ActionResult<{ count: number }>
> {
  return runAction("copyLastYearLoadsAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const result = await copyLastYearLoads({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { count: result.count } };
  });
}

/**
 * Days on site, the first powered day and the power factor. They are checked
 * merged onto the current plan (so the whole plan stays valid), and only these
 * three are sent, so a fuel setting saved meanwhile is not written back.
 */
export async function savePlanSettingsAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("savePlanSettingsAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const fields = PlanSettingsFields.safeParse(input);
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
    const { daysOnSite, firstPoweredDay, powerFactor, expectedVersion } =
      parsed.data;
    const result = await setPowerPlan({
      actorId: gate.campUser.id,
      patch: { daysOnSite, firstPoweredDay, powerFactor },
      expectedVersion,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { version: result.version } };
  });
}

/**
 * The fuel plan: the generator, its hours (24 h unless set), days on site,
 * the power factor and the margins. Checked merged onto the current plan and
 * sent without the date of day 1, which the load list owns.
 */
export async function saveFuelPlanAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveFuelPlanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const fields = FuelPlanFields.safeParse(input);
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
    const { firstPoweredDay: _day, expectedVersion, ...patch } = parsed.data;
    const result = await setPowerPlan({
      actorId: gate.campUser.id,
      patch,
      expectedVersion,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { version: result.version } };
  });
}

/** Copies the most recent earlier year's plan, when this year has none. */
export async function copyLastYearPlanAction(): Promise<
  ActionResult<{ fromCycle: number }>
> {
  return runAction("copyLastYearPlanAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const result = await copyLastYearPlan({ actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { fromCycle: result.fromCycle } };
  });
}

export async function addGeneratorAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addGeneratorAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = GeneratorInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_GENERATOR) };
    }
    const result = await addGenerator({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true, data: { id: result.id } };
  });
}

export async function updateGeneratorAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateGeneratorAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = EditGeneratorInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_GENERATOR) };
    }
    const result = await updateGenerator({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}

/** Retires a generator; a plan that names it still reads. */
export async function archiveGeneratorAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("archiveGeneratorAction", async () => {
    const gate = await powerGate(POWER_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = ArchiveGeneratorInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_GENERATOR };
    const result = await archiveGenerator({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePower();
    return { ok: true };
  });
}
