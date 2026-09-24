import { and, asc, eq, sql } from "drizzle-orm";
import { canEditMealPlan, mealPlanPeaks } from "@camp404/core";
import {
  MEAL_PLAN_DEFAULT_DAYS,
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
// current year, the days on site, the date of day 1 and the plates at
// breakfast, lunch and dinner on each.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A save as the caller sends it: the date of day 1 may be left out (none). */
export type MealPlanSave = { actorId: string } & Omit<
  MealPlanInput,
  "firstDay"
> & { firstDay?: string | null };

/** A year's meal plan. Version 0 means none is saved: these are the defaults. */
export interface MealPlan {
  cycle: number;
  daysOnSite: number;
  /** The date of day 1 (YYYY-MM-DD), or null when nobody has set it. */
  firstDay: string | null;
  /** One row per day on site, day 1 first. */
  days: MealPlanDay[];
  version: number;
  updatedAt: Date | null;
}

const EMPTY_DAY: MealPlanDay = { breakfast: 0, lunch: 0, dinner: 0 };

/** The plan a year has before anyone saves one: 11 days, no plates. */
export function defaultMealPlan(cycle: number): MealPlan {
  return {
    cycle,
    daysOnSite: MEAL_PLAN_DEFAULT_DAYS,
    firstDay: null,
    days: Array.from({ length: MEAL_PLAN_DEFAULT_DAYS }, () => ({
      ...EMPTY_DAY,
    })),
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
      ? { breakfast: row.breakfast, lunch: row.lunch, dinner: row.dinner }
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

/** A year's meal plan, read through `db`. */
export async function readMealPlan(
  db: DbOrTx,
  cycle: number,
): Promise<MealPlan> {
  const [plan] = await db
    .select()
    .from(schema.kitchenMealPlans)
    .where(eq(schema.kitchenMealPlans.cycle, cycle));
  if (!plan) return defaultMealPlan(cycle);
  const rows = await db
    .select({
      day: schema.kitchenMealPlanDays.day,
      breakfast: schema.kitchenMealPlanDays.breakfast,
      lunch: schema.kitchenMealPlanDays.lunch,
      dinner: schema.kitchenMealPlanDays.dinner,
    })
    .from(schema.kitchenMealPlanDays)
    .where(eq(schema.kitchenMealPlanDays.cycle, cycle))
    .orderBy(asc(schema.kitchenMealPlanDays.day));
  return {
    cycle,
    daysOnSite: plan.daysOnSite,
    firstDay: plan.firstDay,
    days: mealPlanDays(plan.daysOnSite, rows),
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
 * Saves this year's meal plan. `expectedVersion` 0 means the editor saw no
 * plan (the defaults), so the save inserts one, and if someone saved first
 * the insert finds their row and refuses. Otherwise it is a compare-and-set
 * on version. The year's day rows are replaced, and the audit row says what
 * the plan was and what it became.
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
  const { daysOnSite, firstDay, days, expectedVersion } = parsed.data;
  try {
    return await withTransaction(async (tx: Tx) => {
      if (!(await lockMealPlanEditor(tx, input.actorId))) {
        refuse(NOT_A_MEAL_PLAN_EDITOR);
      }
      const cycle = await currentCycleNumber(tx);
      const before = await readMealPlan(tx, cycle);
      const now = new Date();
      let version: number;
      if (expectedVersion === 0) {
        const [row] = await tx
          .insert(schema.kitchenMealPlans)
          .values({
            cycle,
            daysOnSite,
            firstDay,
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
            daysOnSite,
            firstDay,
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
        .where(eq(schema.kitchenMealPlanDays.cycle, cycle));
      await tx.insert(schema.kitchenMealPlanDays).values(
        days.map((d, i) => ({
          cycle,
          day: i + 1,
          breakfast: d.breakfast,
          lunch: d.lunch,
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
          before: {
            daysOnSite: before.daysOnSite,
            firstDay: before.firstDay,
            days: before.days,
          },
          after: { daysOnSite, firstDay, days },
        },
      });
      return { ok: true as const, version };
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}
