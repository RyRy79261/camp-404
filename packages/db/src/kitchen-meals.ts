import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  campDayStart,
  canAddPrepSteps,
  canCheckMenuAllergens,
  mealPlates,
  prepDueDate,
  prepGoesOnBoard,
  prepTaskDetails,
  prepTaskTitle,
  type SheetPrepStep,
} from "@camp404/core";
import {
  ALLERGEN_PLAN_KINDS,
  ALLERGEN_PLAN_MAX,
  PREP_TIMINGS,
  PREP_WHAT_MAX,
  readAllergens,
  type AllergenPlanKind,
  type KitchenAllergen,
  type MealOfTheDay,
  type PrepTiming,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { readMealPlan } from "./meal-plan";
import { reachRank } from "./power";
import * as schema from "./schema";
import { addTaskWithin } from "./tasks";

// What a captain or a Kitchen lead adds under a recipe on the meal plan
// (#245; the owner approved Option A of design/kitchen-dietary.html and
// design/kitchen-prep.html, 2026-10-02):
//
//  - A plan for a recipe on a meal that someone coming is anaphylactic to: a
//    separate portion or a substitution, in words, naming the foods it covers.
//    Compare-and-set on its `version`.
//  - A correction of what the recipe's book version holds, when Claude's
//    marks are wrong. The version is never edited; the correction sits beside
//    it. Compare-and-set on its `revision`, and refused when the book has
//    moved on to a newer version.
//  - Prep steps: what to do, and when. A step due before Day 1 becomes a task
//    on the board for the Kitchen in the same transaction (addTaskWithin, the
//    board's own rule); one due on a day on site prints on that day's site
//    sheet. Removing a step cancels its task in the same transaction. No
//    person responsible (the owner).
//
// Every write re-reads and locks the actor's rank and led teams inside its own
// transaction (lockSenderReach) and writes its audit row there. PGlite has ONE
// connection: everything inside a transaction goes through `tx`.

export type MealWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_MEAL_CHECKER =
  "Only a Kitchen lead or a captain can do this on the meal plan.";
export const MEAL_ITEM_GONE =
  "That recipe is no longer on this meal. Reload the page.";
export const PLAN_CHANGED =
  "Someone changed this plan first. Reload the page to see it.";
export const PLAN_NEEDS_WORDS = "Say what exactly the kitchen will do.";
export const ALLERGENS_CHANGED =
  "Someone corrected these allergens first. Reload the page to see them.";
export const RECIPE_NEWER_VERSION =
  "This recipe has a newer version in the book now. Reload the page.";
export const PREP_STEP_GONE = "That prep step is already off. Reload the page.";
export const PREP_NEEDS_WORDS = "Say what to do.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The kitchen's plan for an anaphylaxis on a recipe on a meal. */
export interface AllergenPlan {
  menuItemId: string;
  kind: AllergenPlanKind;
  details: string;
  allergens: KitchenAllergen[];
  version: number;
}

/** A prep step under a recipe on a meal. */
export interface PrepStep {
  id: string;
  menuItemId: string;
  what: string;
  timing: PrepTiming;
  /** YYYY-MM-DD */
  dueDate: string;
  /** It has a task on the board (it is due before Day 1). */
  onBoard: boolean;
}

/** The plans and prep steps of a year's menu. */
export interface MealChecks {
  plans: AllergenPlan[];
  prepSteps: PrepStep[];
}

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
): Promise<MealWriteResult<T>> {
  try {
    return { ok: true, ...(await withTransaction(fn)) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/** The actor's rule, read and locked inside the write's transaction. */
async function lockKitchenActor(
  tx: DbOrTx,
  actorId: string,
  rule: (rank: string, led: readonly string[]) => boolean,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return rule(reachRank(reach), reach ?? []);
}

/** A menu item of this year's menu, locked, with its recipe's title. */
async function lockMenuItem(tx: Tx, itemId: string, cycle: number) {
  if (!UUID.test(itemId)) return null;
  const [item] = await tx
    .select({
      id: schema.kitchenMenuItems.id,
      day: schema.kitchenMenuItems.day,
      meal: schema.kitchenMenuItems.meal,
      recipeId: schema.kitchenMenuItems.recipeId,
    })
    .from(schema.kitchenMenuItems)
    .where(
      and(
        eq(schema.kitchenMenuItems.id, itemId),
        eq(schema.kitchenMenuItems.cycle, cycle),
      ),
    )
    .for("update");
  if (!item || (item.meal !== "breakfast" && item.meal !== "dinner")) {
    return null;
  }
  const [recipe] = await tx
    .select({ title: schema.recipes.title })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, item.recipeId));
  return {
    ...item,
    meal: item.meal as MealOfTheDay,
    title: recipe?.title?.trim() || "Untitled recipe",
  };
}

const isPlanKind = (k: string): k is AllergenPlanKind =>
  (ALLERGEN_PLAN_KINDS as readonly string[]).includes(k);
const isTiming = (t: string): t is PrepTiming =>
  (PREP_TIMINGS as readonly string[]).includes(t);

// --- Reads -------------------------------------------------------------------

/** A year's plans and prep steps, read through `db`. */
export async function readMealChecks(
  db: DbOrTx,
  cycle: number,
): Promise<MealChecks> {
  const [plans, steps] = await Promise.all([
    db
      .select({
        menuItemId: schema.kitchenAllergenPlans.menuItemId,
        kind: schema.kitchenAllergenPlans.kind,
        details: schema.kitchenAllergenPlans.details,
        allergens: schema.kitchenAllergenPlans.allergens,
        version: schema.kitchenAllergenPlans.version,
      })
      .from(schema.kitchenAllergenPlans)
      .innerJoin(
        schema.kitchenMenuItems,
        eq(schema.kitchenMenuItems.id, schema.kitchenAllergenPlans.menuItemId),
      )
      .where(eq(schema.kitchenMenuItems.cycle, cycle)),
    db
      .select({
        id: schema.kitchenPrepSteps.id,
        menuItemId: schema.kitchenPrepSteps.menuItemId,
        what: schema.kitchenPrepSteps.what,
        timing: schema.kitchenPrepSteps.timing,
        dueDate: schema.kitchenPrepSteps.dueDate,
        taskId: schema.kitchenPrepSteps.taskId,
      })
      .from(schema.kitchenPrepSteps)
      .where(eq(schema.kitchenPrepSteps.cycle, cycle))
      .orderBy(
        asc(schema.kitchenPrepSteps.dueDate),
        asc(schema.kitchenPrepSteps.createdAt),
      ),
  ]);
  return {
    plans: plans.flatMap((p) =>
      isPlanKind(p.kind)
        ? [{ ...p, kind: p.kind, allergens: readAllergens(p.allergens) }]
        : [],
    ),
    prepSteps: steps.flatMap(({ taskId, ...s }) =>
      isTiming(s.timing)
        ? [{ ...s, timing: s.timing, onBoard: taskId !== null }]
        : [],
    ),
  };
}

/** This year's plans and prep steps. */
export async function getMealChecks(): Promise<MealChecks> {
  const db = createHttpDb();
  return readMealChecks(db, await currentCycleNumber(db));
}

/**
 * A year's prep steps as the daily site sheet prints them: what, for which
 * recipe and meal, and the day it is due.
 */
export async function listSheetPrepSteps(
  cycle: number,
): Promise<SheetPrepStep[]> {
  const rows = await createHttpDb()
    .select({
      dueDate: schema.kitchenPrepSteps.dueDate,
      what: schema.kitchenPrepSteps.what,
      recipeTitle: schema.recipes.title,
      day: schema.kitchenMenuItems.day,
      meal: schema.kitchenMenuItems.meal,
    })
    .from(schema.kitchenPrepSteps)
    .innerJoin(
      schema.kitchenMenuItems,
      eq(schema.kitchenMenuItems.id, schema.kitchenPrepSteps.menuItemId),
    )
    .innerJoin(
      schema.recipes,
      eq(schema.recipes.id, schema.kitchenMenuItems.recipeId),
    )
    .where(eq(schema.kitchenPrepSteps.cycle, cycle));
  return rows.flatMap((r) =>
    r.meal === "breakfast" || r.meal === "dinner"
      ? [
          {
            ...r,
            meal: r.meal,
            recipeTitle: r.recipeTitle?.trim() || "Untitled recipe",
          },
        ]
      : [],
  );
}

// --- Allergen plans ----------------------------------------------------------

/**
 * Records (or changes) the kitchen's plan for a recipe on a meal that someone
 * coming is anaphylactic to. `expectedVersion` is the plan's version the
 * editor saw (0: none yet).
 */
export async function recordAllergenPlan(input: {
  actorId: string;
  itemId: string;
  kind: AllergenPlanKind;
  details: string;
  allergens: readonly string[];
  expectedVersion: number;
}): Promise<MealWriteResult<{ version: number }>> {
  return write(async (tx) => {
    if (!(await lockKitchenActor(tx, input.actorId, canCheckMenuAllergens))) {
      refuse(NOT_A_MEAL_CHECKER);
    }
    const details = input.details.trim().slice(0, ALLERGEN_PLAN_MAX);
    if (!details) refuse(PLAN_NEEDS_WORDS);
    const kind: AllergenPlanKind = isPlanKind(input.kind)
      ? input.kind
      : "portion";
    const allergens = readAllergens(input.allergens);
    const cycle = await currentCycleNumber(tx);
    const item = await lockMenuItem(tx, input.itemId, cycle);
    if (!item) refuse(MEAL_ITEM_GONE);

    const [current] = await tx
      .select({ version: schema.kitchenAllergenPlans.version })
      .from(schema.kitchenAllergenPlans)
      .where(eq(schema.kitchenAllergenPlans.menuItemId, item.id))
      .for("update");
    if ((current?.version ?? 0) !== input.expectedVersion) refuse(PLAN_CHANGED);
    const values = {
      kind,
      details,
      allergens,
      setByUserId: input.actorId,
      updatedAt: new Date(),
    };
    const written = current
      ? await tx
          .update(schema.kitchenAllergenPlans)
          .set({ ...values, version: current.version + 1 })
          .where(
            and(
              eq(schema.kitchenAllergenPlans.menuItemId, item.id),
              eq(schema.kitchenAllergenPlans.version, input.expectedVersion),
            ),
          )
          .returning({ version: schema.kitchenAllergenPlans.version })
      : await tx
          .insert(schema.kitchenAllergenPlans)
          .values({ menuItemId: item.id, ...values })
          .onConflictDoNothing()
          .returning({ version: schema.kitchenAllergenPlans.version });
    if (written.length === 0) refuse(PLAN_CHANGED);

    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_allergen_plan.recorded",
      target: "kitchen",
      metadata: {
        cycle,
        day: item.day,
        meal: item.meal,
        recipeId: item.recipeId,
        title: item.title,
        kind,
        allergens,
        details,
      },
    });
    return { version: written[0]!.version };
  });
}

// --- Allergen corrections ----------------------------------------------------

/**
 * Corrects what a recipe's book version holds. `versionId` is the version the
 * editor saw (refused once the book has a newer one); `expectedRevision` the
 * correction's revision they saw (0: Claude's marks).
 */
export async function correctRecipeAllergens(input: {
  actorId: string;
  recipeId: string;
  versionId: string;
  allergens: readonly string[];
  expectedRevision: number;
}): Promise<MealWriteResult<{ revision: number }>> {
  return write(async (tx) => {
    if (!(await lockKitchenActor(tx, input.actorId, canCheckMenuAllergens))) {
      refuse(NOT_A_MEAL_CHECKER);
    }
    if (!UUID.test(input.recipeId) || !UUID.test(input.versionId)) {
      refuse(RECIPE_NEWER_VERSION);
    }
    const [recipe] = await tx
      .select({
        title: schema.recipes.title,
        versionId: schema.recipes.acceptedVersionId,
      })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, input.recipeId))
      .for("share");
    if (!recipe || recipe.versionId !== input.versionId) {
      refuse(RECIPE_NEWER_VERSION);
    }
    const allergens = readAllergens(input.allergens);
    const [current] = await tx
      .select({
        revision: schema.recipeAllergenCorrections.revision,
        allergens: schema.recipeAllergenCorrections.allergens,
      })
      .from(schema.recipeAllergenCorrections)
      .where(eq(schema.recipeAllergenCorrections.versionId, input.versionId))
      .for("update");
    if ((current?.revision ?? 0) !== input.expectedRevision) {
      refuse(ALLERGENS_CHANGED);
    }
    const values = {
      allergens,
      setByUserId: input.actorId,
      setAt: new Date(),
    };
    const written = current
      ? await tx
          .update(schema.recipeAllergenCorrections)
          .set({ ...values, revision: current.revision + 1 })
          .where(
            and(
              eq(schema.recipeAllergenCorrections.versionId, input.versionId),
              eq(
                schema.recipeAllergenCorrections.revision,
                input.expectedRevision,
              ),
            ),
          )
          .returning({ revision: schema.recipeAllergenCorrections.revision })
      : await tx
          .insert(schema.recipeAllergenCorrections)
          .values({ versionId: input.versionId, ...values })
          .onConflictDoNothing()
          .returning({ revision: schema.recipeAllergenCorrections.revision });
    if (written.length === 0) refuse(ALLERGENS_CHANGED);

    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_allergens.corrected",
      target: "kitchen",
      metadata: {
        recipeId: input.recipeId,
        versionId: input.versionId,
        title: recipe.title ?? "Untitled recipe",
        allergens,
        from: current ? readAllergens(current.allergens) : null,
      },
    });
    return { revision: written[0]!.revision };
  });
}

// --- Prep steps --------------------------------------------------------------

/**
 * Adds a prep step under a recipe on a meal. Due before Day 1: a Kitchen task
 * on the board with that due date, in this transaction. On site: no task; it
 * prints on that day's site sheet.
 */
export async function addPrepStep(input: {
  actorId: string;
  itemId: string;
  what: string;
  when: PrepTiming;
  date: string | null;
}): Promise<
  MealWriteResult<{ stepId: string; onBoard: boolean; due: string }>
> {
  return write(async (tx) => {
    if (!(await lockKitchenActor(tx, input.actorId, canAddPrepSteps))) {
      refuse(NOT_A_MEAL_CHECKER);
    }
    const what = input.what.trim().slice(0, PREP_WHAT_MAX);
    if (!what) refuse(PREP_NEEDS_WORDS);
    if (!isTiming(input.when)) refuse(PREP_NEEDS_WORDS);
    const cycle = await currentCycleNumber(tx);
    // Day 1 comes from Logistics: read it with a share lock BEFORE the menu
    // item, in the order a Logistics save that moves it takes them (phases,
    // then the steps and their menu items), so the two never deadlock and
    // this step is either re-dated by that save or dated from its new Day 1.
    const plan = await readMealPlan(tx, cycle, { lock: true });
    const item = await lockMenuItem(tx, input.itemId, cycle);
    if (!item) refuse(MEAL_ITEM_GONE);
    const due = prepDueDate({
      firstDay: plan.firstDay,
      day: item.day,
      when: input.when,
      date: input.date,
    });
    if (!due.ok) refuse(due.error);
    const onBoard = prepGoesOnBoard(due.due, plan.firstDay!);

    let taskId: string | null = null;
    if (onBoard) {
      const task = await addTaskWithin(tx, {
        creatorId: input.actorId,
        title: prepTaskTitle(
          item.title,
          mealPlates(plan.days, item.day, item.meal),
          what,
        ),
        description: prepTaskDetails(item.day, item.meal, plan.firstDay),
        team: "kitchen",
        assigneeId: null,
        dueAt: campDayStart(due.due),
      });
      if (!task.ok) refuse(task.error);
      taskId = task.id;
    }
    const [row] = await tx
      .insert(schema.kitchenPrepSteps)
      .values({
        menuItemId: item.id,
        cycle,
        what,
        timing: input.when,
        dueDate: due.due,
        taskId,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.kitchenPrepSteps.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_prep.added",
      target: "kitchen",
      metadata: {
        cycle,
        day: item.day,
        meal: item.meal,
        recipeId: item.recipeId,
        title: item.title,
        what,
        when: input.when,
        due: due.due,
        taskId,
      },
    });
    return { stepId: row!.id, onBoard, due: due.due };
  });
}

/** Takes a prep step off, and its task off the board, together. */
export async function removePrepStep(input: {
  actorId: string;
  stepId: string;
}): Promise<MealWriteResult> {
  return write(async (tx) => {
    if (!(await lockKitchenActor(tx, input.actorId, canAddPrepSteps))) {
      refuse(NOT_A_MEAL_CHECKER);
    }
    if (!UUID.test(input.stepId)) refuse(PREP_STEP_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .delete(schema.kitchenPrepSteps)
      .where(
        and(
          eq(schema.kitchenPrepSteps.id, input.stepId),
          eq(schema.kitchenPrepSteps.cycle, cycle),
        ),
      )
      .returning({
        menuItemId: schema.kitchenPrepSteps.menuItemId,
        what: schema.kitchenPrepSteps.what,
        dueDate: schema.kitchenPrepSteps.dueDate,
        taskId: schema.kitchenPrepSteps.taskId,
      });
    if (!row) refuse(PREP_STEP_GONE);
    if (row.taskId) {
      await tx
        .update(schema.tasks)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(schema.tasks.id, [row.taskId]),
            ne(schema.tasks.status, "cancelled"),
          ),
        );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_prep.removed",
      target: "kitchen",
      metadata: { cycle, ...row },
    });
    return {};
  });
}
