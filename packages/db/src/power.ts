import { and, asc, count, eq, isNull, lt, max, sql } from "drizzle-orm";
import { canEditPower, type PowerWindow } from "@camp404/core";
import {
  POWER_PLAN_DEFAULTS,
  type CurrentKind,
  type EditGeneratorInput,
  type EditLoadInput,
  type FuelType,
  type GeneratorInput,
  type GeneratorOwner,
  type LoadCategory,
  type LoadInput,
  type LoadOwner,
  type LoadSchedule,
  type PowerPlanInput,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// Power and fuel (#253 load list, #254 generators and fuel): the data layer.
//
//  - Anyone in the camp reads the load list, the generators and the plan.
//  - Only a captain or a Power & Lighting lead writes (canEditPower). Every
//    write re-reads the actor's rank and the teams they lead this year INSIDE
//    its own transaction (lockPowerEditor, through lockSenderReach), so a
//    demotion that committed first is seen and one that comes later waits. A
//    caller passes only who is acting, never a rank or a team list.
//  - Loads and the plan are the year's (stamped with currentCycleNumber, read
//    through the transaction); generators are gear and outlive the rollover.
//  - Every edit is a compare-and-set on `version`: a lost race says so in a
//    sentence, never overwrites.
//
// No audit_log rows: this is team planning data, like the task board, not
// another member's data or camp config. There is no money here.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type PowerWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_POWER_EDITOR =
  "Only captains and Power & Lighting leads can change the power plan.";
export const LOAD_GONE =
  "That load isn't on the list any more. Reload the page.";
export const LOAD_CHANGED = "Someone changed this load first. Reload the page.";
export const PLAN_CHANGED =
  "Someone changed this year's plan first. Reload the page.";
export const GENERATOR_GONE =
  "That generator isn't there any more. Reload the page.";
export const GENERATOR_CHANGED =
  "Someone changed this generator first. Reload the page.";
export const INVENTORY_ITEM_GONE =
  "That inventory item isn't there any more. Reload the page.";
export const ALREADY_HAS_LOADS =
  "This year already has loads, so last year's list wasn't copied.";
export const ALREADY_HAS_PLAN =
  "This year already has a plan, so last year's wasn't copied.";
export const NOTHING_TO_COPY = "There is no earlier year to copy from.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Shapes ------------------------------------------------------------------

/** One row of a year's load list. It names no member, even a member's own. */
export interface PowerLoadRow {
  id: string;
  cycle: number;
  name: string;
  area: string;
  category: LoadCategory;
  quantity: number;
  wattsEach: number;
  surgeWattsEach: number | null;
  dutyPct: number;
  schedule: LoadSchedule;
  hoursPerDay: number | null;
  windows: PowerWindow[] | null;
  fromDay: number | null;
  toDay: number | null;
  volts: number;
  current: CurrentKind;
  owner: LoadOwner;
  neighbourCamp: string | null;
  inventoryItemId: string | null;
  circuit: string | null;
  sort: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A generator, from its datasheet. `archivedAt` is set once it is retired. */
export interface GeneratorRow {
  id: string;
  model: string;
  ratedKva: number;
  maxKva: number;
  tankLitres: number;
  runtime50Hours: number;
  runtime100Hours: number;
  fuelType: FuelType;
  owner: GeneratorOwner;
  inventoryItemId: string | null;
  noiseNote: string | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** An inventory item the "From inventory" helper offers. */
export interface PowerInventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  wattsEach: number | null;
}

/** What the year's plan holds; the shape the plan form edits. */
export type PowerPlanSettings = Omit<PowerPlanInput, "expectedVersion">;

/** A year's plan. Version 0 means no row yet: these are the defaults. */
export interface PowerPlan extends PowerPlanSettings {
  cycle: number;
  version: number;
  updatedAt: Date | null;
}

/** The plan a year has before anyone saves one. */
export const DEFAULT_POWER_PLAN: PowerPlanSettings & { version: 0 } = {
  generatorId: null,
  secondGeneratorNote: null,
  powerFactor: POWER_PLAN_DEFAULTS.powerFactor,
  daysOnSite: POWER_PLAN_DEFAULTS.daysOnSite,
  firstPoweredDay: null,
  runFromHour: null,
  runToHour: null,
  compareRunFromHour: POWER_PLAN_DEFAULTS.compareRunFromHour,
  compareRunToHour: POWER_PLAN_DEFAULTS.compareRunToHour,
  lowLoadFactor: POWER_PLAN_DEFAULTS.lowLoadFactor,
  safetyMarginPct: POWER_PLAN_DEFAULTS.safetyMarginPct,
  canLitres: POWER_PLAN_DEFAULTS.canLitres,
  cansOwned: POWER_PLAN_DEFAULTS.cansOwned,
  version: 0,
};

const LOAD_COLUMNS = {
  id: schema.powerLoads.id,
  cycle: schema.powerLoads.cycle,
  name: schema.powerLoads.name,
  area: schema.powerLoads.area,
  category: schema.powerLoads.category,
  quantity: schema.powerLoads.quantity,
  wattsEach: schema.powerLoads.wattsEach,
  surgeWattsEach: schema.powerLoads.surgeWattsEach,
  dutyPct: schema.powerLoads.dutyPct,
  schedule: schema.powerLoads.schedule,
  hoursPerDay: schema.powerLoads.hoursPerDay,
  windows: schema.powerLoads.windows,
  fromDay: schema.powerLoads.fromDay,
  toDay: schema.powerLoads.toDay,
  volts: schema.powerLoads.volts,
  current: schema.powerLoads.current,
  owner: schema.powerLoads.owner,
  neighbourCamp: schema.powerLoads.neighbourCamp,
  inventoryItemId: schema.powerLoads.inventoryItemId,
  circuit: schema.powerLoads.circuit,
  sort: schema.powerLoads.sort,
  version: schema.powerLoads.version,
  createdAt: schema.powerLoads.createdAt,
  updatedAt: schema.powerLoads.updatedAt,
};

const GENERATOR_COLUMNS = {
  id: schema.generators.id,
  model: schema.generators.model,
  ratedKva: schema.generators.ratedKva,
  maxKva: schema.generators.maxKva,
  tankLitres: schema.generators.tankLitres,
  runtime50Hours: schema.generators.runtime50Hours,
  runtime100Hours: schema.generators.runtime100Hours,
  fuelType: schema.generators.fuelType,
  owner: schema.generators.owner,
  inventoryItemId: schema.generators.inventoryItemId,
  noiseNote: schema.generators.noiseNote,
  archivedAt: schema.generators.archivedAt,
  version: schema.generators.version,
  createdAt: schema.generators.createdAt,
  updatedAt: schema.generators.updatedAt,
};

type PlanRow = typeof schema.powerPlans.$inferSelect;

function planOf(row: PlanRow): PowerPlan {
  return {
    cycle: row.cycle,
    generatorId: row.generatorId,
    secondGeneratorNote: row.secondGeneratorNote,
    powerFactor: row.powerFactor,
    daysOnSite: row.daysOnSite,
    firstPoweredDay: row.firstPoweredDay,
    runFromHour: row.runFromHour,
    runToHour: row.runToHour,
    compareRunFromHour: row.compareRunFromHour,
    compareRunToHour: row.compareRunToHour,
    lowLoadFactor: row.lowLoadFactor,
    safetyMarginPct: row.safetyMarginPct,
    canLitres: row.canLitres,
    cansOwned: row.cansOwned,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

const PLAN_KEYS = Object.keys(DEFAULT_POWER_PLAN).filter(
  (key) => key !== "version",
) as (keyof PowerPlanSettings)[];

/** Only the plan's own settings, whatever else the caller's object carries. */
function settingsPatch(
  patch: Partial<PowerPlanSettings>,
): Partial<PowerPlanSettings> {
  return Object.fromEntries(
    PLAN_KEYS.filter((key) => patch[key] !== undefined).map((key) => [
      key,
      patch[key],
    ]),
  );
}

// --- Transactions ------------------------------------------------------------

/** A refusal thrown inside a transaction, so it rolls back everything. */
class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<PowerWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * The rank rung an edit check stands on, from lockSenderReach's answer:
 * undefined is a captain, an empty list of led teams a member, and a
 * non-empty one a lead.
 */
export function reachRank(
  reach: readonly string[] | undefined,
): "captain" | "team_lead" | "camp_member" {
  if (reach === undefined) return "captain";
  return reach.length > 0 ? "team_lead" : "camp_member";
}

/**
 * Whether the actor may change the power plan, read and locked inside the
 * write's own transaction: a captain, or a lead of Power & Lighting this
 * year. The lock (lockSenderReach) means a demotion that committed first is
 * seen, and one that comes later waits for this transaction.
 */
export async function lockPowerEditor(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canEditPower(reachRank(reach), reach ?? []);
}

async function assertPowerEditor(tx: Tx, actorId: string): Promise<void> {
  if (!(await lockPowerEditor(tx, actorId))) refuse(NOT_A_POWER_EDITOR);
}

/** A linked inventory item must exist and not be archived. */
async function assertInventoryItem(tx: Tx, itemId: string | null) {
  if (itemId === null) return;
  if (!UUID.test(itemId)) refuse(INVENTORY_ITEM_GONE);
  const [row] = await tx
    .select({ id: schema.inventoryItems.id })
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.id, itemId),
        isNull(schema.inventoryItems.archivedAt),
      ),
    );
  if (!row) refuse(INVENTORY_ITEM_GONE);
}

/** The latest year below `cycle` that has any loads, or null. */
async function previousCycleWithLoads(
  db: DbOrTx,
  cycle: number,
): Promise<number | null> {
  const [row] = await db
    .select({ cycle: max(schema.powerLoads.cycle) })
    .from(schema.powerLoads)
    .where(lt(schema.powerLoads.cycle, cycle));
  return row?.cycle ?? null;
}

/** The latest year below `cycle` that has a plan, or null. */
async function previousPlan(db: DbOrTx, cycle: number) {
  const [row] = await db
    .select()
    .from(schema.powerPlans)
    .where(lt(schema.powerPlans.cycle, cycle))
    .orderBy(sql`${schema.powerPlans.cycle} desc`)
    .limit(1);
  return row ?? null;
}

// --- Reads -------------------------------------------------------------------

/** A year's load list (this year by default), in the team's order. */
export async function listPowerLoads(cycle?: number): Promise<PowerLoadRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  return db
    .select(LOAD_COLUMNS)
    .from(schema.powerLoads)
    .where(eq(schema.powerLoads.cycle, year))
    .orderBy(asc(schema.powerLoads.sort), asc(schema.powerLoads.createdAt));
}

/** A year's plan (this year by default), or the defaults when none is saved. */
export async function getPowerPlan(cycle?: number): Promise<PowerPlan> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [row] = await db
    .select()
    .from(schema.powerPlans)
    .where(eq(schema.powerPlans.cycle, year));
  return row
    ? planOf(row)
    : { ...DEFAULT_POWER_PLAN, cycle: year, updatedAt: null };
}

/** The generators in service, by model. */
export async function listGenerators(): Promise<GeneratorRow[]> {
  return createHttpDb()
    .select(GENERATOR_COLUMNS)
    .from(schema.generators)
    .where(isNull(schema.generators.archivedAt))
    .orderBy(asc(schema.generators.model), asc(schema.generators.createdAt));
}

/**
 * One generator, archived or not, so a plan that names a retired one still
 * reads. Null when it does not exist.
 */
export async function getGenerator(id: string): Promise<GeneratorRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await createHttpDb()
    .select(GENERATOR_COLUMNS)
    .from(schema.generators)
    .where(eq(schema.generators.id, id));
  return row ?? null;
}

/** The stocked items the "From inventory" helper can pick, with their watts. */
export async function listPowerInventory(): Promise<PowerInventoryItem[]> {
  return createHttpDb()
    .select({
      id: schema.inventoryItems.id,
      name: schema.inventoryItems.name,
      quantity: schema.inventoryItems.quantity,
      unit: schema.inventoryItems.unit,
      wattsEach: schema.inventoryItems.wattsEach,
    })
    .from(schema.inventoryItems)
    .where(isNull(schema.inventoryItems.archivedAt))
    .orderBy(asc(schema.inventoryItems.name));
}

/** The latest year before this one that has any loads, or null. */
export async function previousLoadCycle(): Promise<number | null> {
  const db = createHttpDb();
  return previousCycleWithLoads(db, await currentCycleNumber(db));
}

/** The latest year before this one that has a plan, or null. */
export async function previousPlanCycle(): Promise<number | null> {
  const db = createHttpDb();
  const row = await previousPlan(db, await currentCycleNumber(db));
  return row?.cycle ?? null;
}

// --- Loads -------------------------------------------------------------------

/** The fields a load's form owns: everything but its identity and place. */
type LoadFields = Omit<
  PowerLoadRow,
  "id" | "cycle" | "sort" | "version" | "createdAt" | "updatedAt"
>;

function loadValues(input: LoadFields) {
  return {
    name: input.name,
    area: input.area,
    category: input.category,
    quantity: input.quantity,
    wattsEach: input.wattsEach,
    surgeWattsEach: input.surgeWattsEach,
    dutyPct: input.dutyPct,
    schedule: input.schedule,
    hoursPerDay: input.hoursPerDay,
    windows: input.windows,
    fromDay: input.fromDay,
    toDay: input.toDay,
    volts: input.volts,
    current: input.current,
    owner: input.owner,
    neighbourCamp: input.neighbourCamp,
    inventoryItemId: input.inventoryItemId,
    circuit: input.circuit,
  };
}

/** Adds a load to this year's list, at the end. */
export async function addPowerLoad(
  input: LoadInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    await assertInventoryItem(tx, input.inventoryItemId);
    const cycle = await currentCycleNumber(tx);
    const [last] = await tx
      .select({ sort: max(schema.powerLoads.sort) })
      .from(schema.powerLoads)
      .where(eq(schema.powerLoads.cycle, cycle));
    const [row] = await tx
      .insert(schema.powerLoads)
      .values({
        ...loadValues(input),
        cycle,
        sort: (last?.sort ?? -1) + 1,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.powerLoads.id });
    return { id: row!.id };
  });
}

/** Why a compare-and-set on a load lost: it is gone, or someone was first. */
async function loadLoss(tx: Tx, loadId: string, cycle: number): Promise<never> {
  const [row] = await tx
    .select({ id: schema.powerLoads.id })
    .from(schema.powerLoads)
    .where(
      and(eq(schema.powerLoads.id, loadId), eq(schema.powerLoads.cycle, cycle)),
    );
  refuse(row ? LOAD_CHANGED : LOAD_GONE);
}

/**
 * Changes one of this year's loads. Compare-and-set on the version the editor
 * opened: a load someone else changed first is left as they left it.
 */
export async function updatePowerLoad(
  input: EditLoadInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.loadId)) refuse(LOAD_GONE);
    await assertInventoryItem(tx, input.inventoryItemId);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .update(schema.powerLoads)
      .set({
        ...loadValues(input),
        version: sql`${schema.powerLoads.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.powerLoads.id, input.loadId),
          eq(schema.powerLoads.cycle, cycle),
          eq(schema.powerLoads.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.powerLoads.id });
    if (!row) await loadLoss(tx, input.loadId, cycle);
    return {};
  });
}

/** Takes a load off this year's list, if nobody changed it first. */
export async function removePowerLoad(input: {
  actorId: string;
  loadId: string;
  expectedVersion: number;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.loadId)) refuse(LOAD_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .delete(schema.powerLoads)
      .where(
        and(
          eq(schema.powerLoads.id, input.loadId),
          eq(schema.powerLoads.cycle, cycle),
          eq(schema.powerLoads.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.powerLoads.id });
    if (!row) await loadLoss(tx, input.loadId, cycle);
    return {};
  });
}

/**
 * Copies the most recent earlier year's load list into this year, with fresh
 * ids. Only when this year has no loads, so a second press cannot double the
 * list; two presses at once queue on a lock for the year and the second finds
 * the first's rows. Day numbers carry over unchanged, because they are days
 * on site, not dates.
 */
export async function copyLastYearLoads(input: {
  actorId: string;
}): Promise<PowerWriteResult<{ count: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('power_loads'), ${cycle})`,
    );
    const [here] = await tx
      .select({ n: count() })
      .from(schema.powerLoads)
      .where(eq(schema.powerLoads.cycle, cycle));
    if ((here?.n ?? 0) > 0) refuse(ALREADY_HAS_LOADS);
    const from = await previousCycleWithLoads(tx, cycle);
    if (from === null) refuse(NOTHING_TO_COPY);
    const rows = await tx
      .select(LOAD_COLUMNS)
      .from(schema.powerLoads)
      .where(eq(schema.powerLoads.cycle, from))
      .orderBy(asc(schema.powerLoads.sort), asc(schema.powerLoads.createdAt));
    if (rows.length === 0) refuse(NOTHING_TO_COPY);
    // An inventory link to an item archived since then is dropped, as the
    // add form would refuse it.
    const live = new Set(
      (
        await tx
          .select({ id: schema.inventoryItems.id })
          .from(schema.inventoryItems)
          .where(isNull(schema.inventoryItems.archivedAt))
      ).map((r) => r.id),
    );
    await tx.insert(schema.powerLoads).values(
      rows.map((row, i) => ({
        ...loadValues(row),
        inventoryItemId:
          row.inventoryItemId && live.has(row.inventoryItemId)
            ? row.inventoryItemId
            : null,
        cycle,
        sort: i,
        createdByUserId: input.actorId,
      })),
    );
    return { count: rows.length };
  });
}

// --- The year's plan ---------------------------------------------------------

/**
 * A generator the plan may name: one that exists and is in service, or the
 * one the plan already names even if it has since been archived (so saving
 * the rest of the plan does not force a new choice).
 */
async function assertPlanGenerator(
  tx: Tx,
  generatorId: string | null | undefined,
  current: string | null,
) {
  if (generatorId === undefined || generatorId === null) return;
  if (!UUID.test(generatorId)) refuse(GENERATOR_GONE);
  const [row] = await tx
    .select({ archivedAt: schema.generators.archivedAt })
    .from(schema.generators)
    .where(eq(schema.generators.id, generatorId));
  if (!row) refuse(GENERATOR_GONE);
  if (row.archivedAt !== null && generatorId !== current) {
    refuse(GENERATOR_GONE);
  }
}

/**
 * Saves this year's plan. `expectedVersion` 0 means the editor saw no plan
 * (the defaults), so the save inserts one; if someone saved first, the insert
 * finds their row and refuses. Otherwise it is a compare-and-set on version.
 */
export async function setPowerPlan(input: {
  actorId: string;
  patch: Partial<PowerPlanSettings>;
  expectedVersion: number;
}): Promise<PowerWriteResult<{ version: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const patch = settingsPatch(input.patch);
    const now = new Date();
    if (input.expectedVersion === 0) {
      await assertPlanGenerator(tx, patch.generatorId, null);
      const { version: _zero, ...defaults } = DEFAULT_POWER_PLAN;
      const [row] = await tx
        .insert(schema.powerPlans)
        .values({
          ...defaults,
          ...patch,
          cycle,
          version: 1,
          updatedByUserId: input.actorId,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: schema.powerPlans.cycle })
        .returning({ version: schema.powerPlans.version });
      if (!row) refuse(PLAN_CHANGED);
      return { version: row.version };
    }
    const [current] = await tx
      .select({ generatorId: schema.powerPlans.generatorId })
      .from(schema.powerPlans)
      .where(eq(schema.powerPlans.cycle, cycle));
    await assertPlanGenerator(
      tx,
      patch.generatorId,
      current?.generatorId ?? null,
    );
    const [row] = await tx
      .update(schema.powerPlans)
      .set({
        ...patch,
        version: sql`${schema.powerPlans.version} + 1`,
        updatedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.powerPlans.cycle, cycle),
          eq(schema.powerPlans.version, input.expectedVersion),
        ),
      )
      .returning({ version: schema.powerPlans.version });
    if (!row) refuse(PLAN_CHANGED);
    return { version: row.version };
  });
}

/**
 * Copies the most recent earlier year's plan into this year, when this year
 * has none. The date of day 1 is not carried over (it was last year's date),
 * and neither is a generator that has since been archived.
 */
export async function copyLastYearPlan(input: {
  actorId: string;
}): Promise<PowerWriteResult<{ fromCycle: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const [here] = await tx
      .select({ cycle: schema.powerPlans.cycle })
      .from(schema.powerPlans)
      .where(eq(schema.powerPlans.cycle, cycle));
    if (here) refuse(ALREADY_HAS_PLAN);
    const from = await previousPlan(tx, cycle);
    if (!from) refuse(NOTHING_TO_COPY);
    let generatorId = from.generatorId;
    if (generatorId !== null) {
      const [gen] = await tx
        .select({ archivedAt: schema.generators.archivedAt })
        .from(schema.generators)
        .where(eq(schema.generators.id, generatorId));
      if (!gen || gen.archivedAt !== null) generatorId = null;
    }
    const { version: _v, updatedAt: _u, updatedByUserId: _b, ...rest } = from;
    const [row] = await tx
      .insert(schema.powerPlans)
      .values({
        ...rest,
        cycle,
        generatorId,
        firstPoweredDay: null,
        version: 1,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.powerPlans.cycle })
      .returning({ cycle: schema.powerPlans.cycle });
    if (!row) refuse(ALREADY_HAS_PLAN);
    return { fromCycle: from.cycle };
  });
}

// --- Generators --------------------------------------------------------------

function generatorValues(input: GeneratorInput) {
  return {
    model: input.model,
    ratedKva: input.ratedKva,
    maxKva: input.maxKva,
    tankLitres: input.tankLitres,
    runtime50Hours: input.runtime50Hours,
    runtime100Hours: input.runtime100Hours,
    fuelType: input.fuelType,
    owner: input.owner,
    inventoryItemId: input.inventoryItemId,
    noiseNote: input.noiseNote,
  };
}

/** Adds a generator to the camp's gear. It is not tied to a year. */
export async function addGenerator(
  input: GeneratorInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    await assertInventoryItem(tx, input.inventoryItemId);
    const [row] = await tx
      .insert(schema.generators)
      .values({ ...generatorValues(input), createdByUserId: input.actorId })
      .returning({ id: schema.generators.id });
    return { id: row!.id };
  });
}

/** Why a compare-and-set on a generator lost. */
async function generatorLoss(tx: Tx, generatorId: string): Promise<never> {
  const [row] = await tx
    .select({ archivedAt: schema.generators.archivedAt })
    .from(schema.generators)
    .where(eq(schema.generators.id, generatorId));
  refuse(row && row.archivedAt === null ? GENERATOR_CHANGED : GENERATOR_GONE);
}

/** Changes a generator in service, compare-and-set on its version. */
export async function updateGenerator(
  input: EditGeneratorInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.generatorId)) refuse(GENERATOR_GONE);
    await assertInventoryItem(tx, input.inventoryItemId);
    const [row] = await tx
      .update(schema.generators)
      .set({
        ...generatorValues(input),
        version: sql`${schema.generators.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generators.id, input.generatorId),
          isNull(schema.generators.archivedAt),
          eq(schema.generators.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.generators.id });
    if (!row) await generatorLoss(tx, input.generatorId);
    return {};
  });
}

/**
 * Retires a generator. It is archived, not deleted, so a plan that names it
 * (this year's or an earlier one) still reads.
 */
export async function archiveGenerator(input: {
  actorId: string;
  generatorId: string;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.generatorId)) refuse(GENERATOR_GONE);
    const now = new Date();
    const [row] = await tx
      .update(schema.generators)
      .set({
        archivedAt: now,
        version: sql`${schema.generators.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.generators.id, input.generatorId),
          isNull(schema.generators.archivedAt),
        ),
      )
      .returning({ id: schema.generators.id });
    if (!row) refuse(GENERATOR_GONE);
    return {};
  });
}
