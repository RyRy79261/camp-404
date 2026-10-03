import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import {
  addDays,
  campDayStart,
  campOnSite,
  canEditMealPlan,
  mealPlanPeaks,
  prepTaskDetails,
  type CampOnSite,
} from "@camp404/core";
import {
  MEAL_PLAN_DEFAULT_DAYS,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  type MealPlanDay,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The kitchen's meal plan (the owner's sketch, 2026-09-24): for the camp's
// current year, the plates at breakfast and dinner on each day on site. The
// camp does no lunch (the owner, 2026-10-01): the table never had a lunch
// column read anywhere, so the one it had was dropped (migration
// drop_kitchen_lunch).
//
//  - The days on site and the date of Day 1 are NOT the meal plan's (the
//    owner, 2026-10-03: "one place to set dates"). They are read from the
//    year's Logistics days every time (campOnSite): Day 1 is the first Build
//    day, else the first Burn day, and the last day on site the last Strike
//    day. With no Build or Burn days the plan runs by day number, 11 days.
//    The plates are kept by day number, so a day range that moves keeps them.
//    When the Logistics days move Day 1, the Logistics write re-dates the prep
//    steps and their tasks in its own transaction (redatePrepSteps, below).
//
//  - Anyone approved reads it (the page gates that). A recipe in the book is
//    shown at each distinct count in it (mealPlanPlateCounts), and the
//    largest is the count Claude writes a new recipe for (mealPlanPeaks, then
//    defaultPlates).
//  - A captain or a Kitchen lead saves it (canEditMealPlan). The save re-reads
//    the actor's rank and the teams they lead this year INSIDE its own
//    transaction (lockSenderReach), never trusting the caller, writes its
//    audit row in the same transaction, and is a compare-and-set on
//    `version`: a lost race says so in a sentence, never overwrites.
//  - Year-scoped: the rows carry the camp's current burn year, read through
//    the transaction.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type MealPlanWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_MEAL_PLAN_EDITOR =
  "Only a Kitchen lead or a captain can change the meal plan.";
export const MEAL_PLAN_CHANGED =
  "Someone changed the meal plan first. Reload the page.";
export const CHECK_MEAL_PLAN = "Check the meal plan and try again.";
export const MEAL_PLAN_DAYS_MOVED =
  "The camp's dates changed in Logistics. Reload the page.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A save as the caller sends it. */
export type MealPlanSave = { actorId: string } & MealPlanInput;

/** A year's meal plan. Version 0 means none is saved: these are the defaults. */
export interface MealPlan {
  cycle: number;
  /** From Logistics: Day 1 to the last day on site; 11 with no dates. */
  daysOnSite: number;
  /**
   * The date of Day 1 (YYYY-MM-DD), from Logistics: the first Build day, else
   * the first Burn day. Null when Logistics has neither.
   */
  firstDay: string | null;
  /** One row per day on site, day 1 first. */
  days: MealPlanDay[];
  version: number;
  updatedAt: Date | null;
}

const EMPTY_DAY: MealPlanDay = { breakfast: 0, dinner: 0 };

/**
 * The plan a year has before anyone saves one: no plates, on the days in
 * Logistics (`onSite`), or 11 days with no date.
 */
export function defaultMealPlan(
  cycle: number,
  onSite: CampOnSite | null = null,
): MealPlan {
  const daysOnSite = onSite?.daysOnSite ?? MEAL_PLAN_DEFAULT_DAYS;
  return {
    cycle,
    daysOnSite,
    firstDay: onSite?.firstDay ?? null,
    days: Array.from({ length: daysOnSite }, () => ({ ...EMPTY_DAY })),
    version: 0,
    updatedAt: null,
  };
}

/**
 * The plan's days from its stored rows: day 1 to `daysOnSite`, a day with no
 * row empty.
 */
export function mealPlanDays(
  daysOnSite: number,
  rows: readonly ({ day: number } & MealPlanDay)[],
): MealPlanDay[] {
  return Array.from({ length: daysOnSite }, (_, i) => {
    const row = rows.find((r) => r.day === i + 1);
    return row
      ? { breakfast: row.breakfast, dinner: row.dinner }
      : { ...EMPTY_DAY };
  });
}

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

/**
 * Whether the actor may change the meal plan, read and locked inside the
 * write's own transaction: a captain, or a lead of Kitchen this year.
 */
export async function lockMealPlanEditor(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canEditMealPlan(reachRank(reach), reach ?? []);
}

// --- Reads -------------------------------------------------------------------

/** The Logistics phases the days on site come from. */
const ON_SITE_PHASES = ["build", "burn", "strike"] as const;

/**
 * A year's days on site from its Logistics days (campOnSite), or null when
 * neither Build nor Burn has days. `lock` takes a share lock on the phase
 * rows, so a write that depends on Day 1 (a prep step's date) waits for a
 * Logistics save that moves it, and then reads the new days.
 */
export async function readCampOnSite(
  db: DbOrTx,
  cycle: number,
  options: { lock?: boolean } = {},
): Promise<CampOnSite | null> {
  const query = db
    .select({
      phase: schema.logisticsPhases.phase,
      startDate: schema.logisticsPhases.startDate,
      endDate: schema.logisticsPhases.endDate,
    })
    .from(schema.logisticsPhases)
    .where(
      and(
        eq(schema.logisticsPhases.cycle, cycle),
        inArray(schema.logisticsPhases.phase, [...ON_SITE_PHASES]),
      ),
    );
  const rows = options.lock ? await query.for("share") : await query;
  return campOnSite(rows, MEAL_PLAN_MAX_DAYS);
}

/**
 * A year's meal plan, read through `db`: its plates by day number, on the
 * days on site from Logistics. `lock` as readCampOnSite's.
 */
export async function readMealPlan(
  db: DbOrTx,
  cycle: number,
  options: { lock?: boolean } = {},
): Promise<MealPlan> {
  const onSite = await readCampOnSite(db, cycle, options);
  const [plan] = await db
    .select()
    .from(schema.kitchenMealPlans)
    .where(eq(schema.kitchenMealPlans.cycle, cycle));
  if (!plan) return defaultMealPlan(cycle, onSite);
  const daysOnSite = onSite?.daysOnSite ?? MEAL_PLAN_DEFAULT_DAYS;
  const rows = await db
    .select({
      day: schema.kitchenMealPlanDays.day,
      breakfast: schema.kitchenMealPlanDays.breakfast,
      dinner: schema.kitchenMealPlanDays.dinner,
    })
    .from(schema.kitchenMealPlanDays)
    .where(eq(schema.kitchenMealPlanDays.cycle, cycle))
    .orderBy(asc(schema.kitchenMealPlanDays.day));
  return {
    cycle,
    daysOnSite,
    firstDay: onSite?.firstDay ?? null,
    days: mealPlanDays(daysOnSite, rows),
    version: plan.version,
    updatedAt: plan.updatedAt,
  };
}

/** This year's meal plan (or a given year's), or the defaults. */
export async function getMealPlan(cycle?: number): Promise<MealPlan> {
  const db = createHttpDb();
  return readMealPlan(db, cycle ?? (await currentCycleNumber(db)));
}

/**
 * This year's largest plates at each meal, read through `db` (a transaction's
 * `tx` inside one), in the shape the kitchen settings and the prompts use.
 */
export async function readMealPlanPeaks(db: DbOrTx = createHttpDb()) {
  const plan = await readMealPlan(db, await currentCycleNumber(db));
  return mealPlanPeaks(plan.days);
}

// --- Write -------------------------------------------------------------------

/**
 * Saves this year's plates. `expectedVersion` 0 means the editor saw no plan
 * (the defaults), so the save inserts one, and if someone saved first the
 * insert finds their row and refuses. Otherwise it is a compare-and-set on
 * version. The rows must be the days on site in Logistics as they are now: a
 * Logistics change since the page opened says so in a sentence. Days 1 to
 * the days on site are replaced; a day past them keeps its plates, so a day
 * range that shrinks and grows again loses nothing. The audit row says what
 * the plates were and what they became.
 */
export async function setMealPlan(
  input: MealPlanSave,
): Promise<MealPlanWriteResult<{ version: number }>> {
  const parsed = MealPlanInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? CHECK_MEAL_PLAN,
    };
  }
  const { days, expectedVersion } = parsed.data;
  try {
    return await withTransaction(async (tx: Tx) => {
      if (!(await lockMealPlanEditor(tx, input.actorId))) {
        refuse(NOT_A_MEAL_PLAN_EDITOR);
      }
      const cycle = await currentCycleNumber(tx);
      const before = await readMealPlan(tx, cycle, { lock: true });
      if (days.length !== before.daysOnSite) refuse(MEAL_PLAN_DAYS_MOVED);
      const now = new Date();
      let version: number;
      if (expectedVersion === 0) {
        const [row] = await tx
          .insert(schema.kitchenMealPlans)
          .values({
            cycle,
            version: 1,
            updatedByUserId: input.actorId,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: schema.kitchenMealPlans.cycle })
          .returning({ version: schema.kitchenMealPlans.version });
        if (!row) refuse(MEAL_PLAN_CHANGED);
        version = row.version;
      } else {
        const [row] = await tx
          .update(schema.kitchenMealPlans)
          .set({
            version: sql`${schema.kitchenMealPlans.version} + 1`,
            updatedByUserId: input.actorId,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.kitchenMealPlans.cycle, cycle),
              eq(schema.kitchenMealPlans.version, expectedVersion),
            ),
          )
          .returning({ version: schema.kitchenMealPlans.version });
        if (!row) refuse(MEAL_PLAN_CHANGED);
        version = row.version;
      }
      await tx
        .delete(schema.kitchenMealPlanDays)
        .where(
          and(
            eq(schema.kitchenMealPlanDays.cycle, cycle),
            lte(schema.kitchenMealPlanDays.day, days.length),
          ),
        );
      await tx.insert(schema.kitchenMealPlanDays).values(
        days.map((d, i) => ({
          cycle,
          day: i + 1,
          breakfast: d.breakfast,
          dinner: d.dinner,
        })),
      );
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "camp.kitchen_meal_plan.changed",
        target: "kitchen",
        metadata: {
          cycle,
          version,
          daysOnSite: before.daysOnSite,
          firstDay: before.firstDay,
          before: { days: before.days },
          after: { days },
        },
      });
      return { ok: true as const, version };
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Moves a year's prep steps by `shift` days because Day 1 moved from `from`
 * to `to`, inside the Logistics save that moved it (setLogisticsPhase and
 * clearLogisticsPhase in ./logistics): "the day before" and "the same day"
 * stay with their meal, and a "before we leave" date moves by the same days.
 * Each step's Kitchen task (one not taken off the board) gets the new due
 * date, and its line of detail ("For Day 3 breakfast, Sat 24 Apr") the new
 * date when nobody has edited it. A task's version is bumped as an edit's is,
 * so an edit dialog opened before cannot put the old date back. One audit row
 * says what moved. Nothing to move writes nothing.
 */
export async function redatePrepSteps(
  tx: Tx,
  input: {
    actorId: string;
    cycle: number;
    shift: number;
    from: string;
    to: string;
  },
): Promise<void> {
  const steps = await tx
    .select({
      id: schema.kitchenPrepSteps.id,
      dueDate: schema.kitchenPrepSteps.dueDate,
      taskId: schema.kitchenPrepSteps.taskId,
      day: schema.kitchenMenuItems.day,
      meal: schema.kitchenMenuItems.meal,
    })
    .from(schema.kitchenPrepSteps)
    .innerJoin(
      schema.kitchenMenuItems,
      eq(schema.kitchenMenuItems.id, schema.kitchenPrepSteps.menuItemId),
    )
    .where(eq(schema.kitchenPrepSteps.cycle, input.cycle))
    .for("update");
  if (steps.length === 0) return;
  let tasks = 0;
  for (const step of steps) {
    const due = addDays(step.dueDate, input.shift);
    if (!due) continue;
    await tx
      .update(schema.kitchenPrepSteps)
      .set({ dueDate: due })
      .where(eq(schema.kitchenPrepSteps.id, step.id));
    if (!step.taskId) continue;
    const meal = step.meal === "breakfast" ? "breakfast" : "dinner";
    const oldDetails = prepTaskDetails(step.day, meal, input.from);
    const newDetails = prepTaskDetails(step.day, meal, input.to);
    const moved = await tx
      .update(schema.tasks)
      .set({
        dueAt: campDayStart(due),
        description: sql`case when ${schema.tasks.description} = ${oldDetails} then ${newDetails} else ${schema.tasks.description} end`,
        version: sql`${schema.tasks.version} + 1`,
      })
      .where(
        and(
          eq(schema.tasks.id, step.taskId),
          ne(schema.tasks.status, "cancelled"),
        ),
      )
      .returning({ id: schema.tasks.id });
    tasks += moved.length;
  }
  await writeAuditEvent(tx, {
    actorId: input.actorId,
    action: "camp.kitchen_prep.redated",
    target: "kitchen",
    metadata: {
      cycle: input.cycle,
      from: input.from,
      to: input.to,
      shift: input.shift,
      steps: steps.length,
      tasks,
    },
  });
}
