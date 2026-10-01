import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  MAX_RECIPES_PER_MEAL,
  MAX_SNACKS,
  type IngredientCategory,
  type MealOfTheDay,
  type PlateLine,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { lockMealPlanEditor, readMealPlan, type MealPlan } from "./meal-plan";
import * as schema from "./schema";

// The Kitchen's menu (#244) and shopping list (#245), the layouts the owner
// approved on 2026-09-30 (docs/specs/2026-09-28-kitchen-menu-and-shopping.md).
//
//  - The menu: recipes on each meal of this year's meal plan, more than one
//    to a meal. The plates come from the meal plan, never stored here. A
//    recipe is read at its book (accepted) version. A captain or a Kitchen
//    lead adds and removes (canEditMealPlan, re-read and locked inside the
//    write, lockMealPlanEditor), each change audited in the same
//    transaction. A second add of the same recipe to a meal meets the unique
//    index and says so; a removal that finds the row gone says so.
//  - Snacks: the year's short list, a name and an amount as typed, edited by
//    the same people, audited.
//  - The shopping list is worked out on each read (buildShoppingList in
//    @camp404/core), from the menu, the meal plan and the plate counts
//    Claude proofread; nothing about it is stored except the ticks, which are
//    shared by the whole camp and set by any approved member. A tick is a
//    state, not a decision, so two members ticking at once both land.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type KitchenMenuWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_MENU_EDITOR =
  "Only a Kitchen lead or a captain can change the menu.";
export const MENU_RECIPE_NOT_IN_BOOK =
  "That recipe isn't in the recipe book. Reload the page.";
export const MENU_DAY_NOT_ON_PLAN =
  "That day isn't on the meal plan. Reload the page.";
export const MENU_MEAL_HAS_NO_PLATES =
  "Save some plates for that meal first, then add a recipe.";
export const ALREADY_ON_MEAL = "That recipe is already on this meal.";
export const MEAL_IS_FULL = `A meal holds at most ${MAX_RECIPES_PER_MEAL} recipes.`;
export const MENU_ITEM_GONE =
  "That recipe is already off the menu. Reload the page.";
export const NOT_A_SNACK_KEEPER =
  "Only a Kitchen lead or a captain can change the snacks.";
export const TOO_MANY_SNACKS = `The snack list holds at most ${MAX_SNACKS} snacks.`;
export const SNACK_GONE =
  "That snack is already off the list. Reload the page.";
export const NOT_A_TICKER =
  "Only approved camp members can tick the shopping list.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A recipe on one meal of the menu. */
export interface KitchenMenuItem {
  id: string;
  day: number;
  meal: MealOfTheDay;
  position: number;
  recipeId: string;
}

/** What the menu and the list need to know about a recipe on the menu. */
export interface MenuRecipeFacts {
  recipeId: string;
  title: string;
  /** Its book version, or null when it has none (it has left the book). */
  versionId: string | null;
  /** Each ingredient line's shop area, in the version's line order. */
  categories: IngredientCategory[];
  /** Every plate count the version has, with its lines, smallest first. */
  counts: { plates: number; lines: PlateLine[] }[];
  /** Counts Claude is still working on. */
  openPlates: number[];
}

/** A year's menu: the items, and each recipe on it by id. */
export interface KitchenMenu {
  cycle: number;
  items: KitchenMenuItem[];
  recipes: Record<string, MenuRecipeFacts>;
}

export interface KitchenSnack {
  id: string;
  name: string;
  amount: string | null;
}

/** A shopping list tick: the line's key and the amount it was ticked at. */
export interface ShoppingTick {
  key: string;
  amount: string;
}

/** Everything the shopping list is worked out from. */
export interface ShoppingFacts {
  plan: MealPlan;
  menu: KitchenMenu;
  snacks: KitchenSnack[];
  ticks: ShoppingTick[];
}

const isMeal = (meal: string): meal is MealOfTheDay =>
  meal === "breakfast" || meal === "dinner";

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

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<KitchenMenuWriteResult<T>> {
  try {
    return { ok: true, ...(await withTransaction(fn)) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Serialises the writes that count a year's list before adding to it (the
 * menu's recipes per meal, the snacks), so two at once cannot both pass the
 * cap. Held to the end of the transaction.
 */
async function lockKitchenList(
  tx: Tx,
  list: "kitchen_menu_items" | "kitchen_snacks",
  cycle: number,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${list}), ${cycle})`,
  );
}

/** An approved, current member, locked so an approval change waits. */
async function isApprovedMember(tx: Tx, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    )
    .for("share");
  return Boolean(row);
}

// --- Reads -------------------------------------------------------------------

/** A year's menu, read through `db`, with each recipe's book version. */
export async function readKitchenMenu(
  db: DbOrTx,
  cycle: number,
): Promise<KitchenMenu> {
  const rows = await db
    .select({
      id: schema.kitchenMenuItems.id,
      day: schema.kitchenMenuItems.day,
      meal: schema.kitchenMenuItems.meal,
      position: schema.kitchenMenuItems.position,
      recipeId: schema.kitchenMenuItems.recipeId,
    })
    .from(schema.kitchenMenuItems)
    .where(eq(schema.kitchenMenuItems.cycle, cycle))
    .orderBy(
      asc(schema.kitchenMenuItems.day),
      asc(schema.kitchenMenuItems.position),
      asc(schema.kitchenMenuItems.createdAt),
    );
  const items = rows.flatMap((row) =>
    isMeal(row.meal) ? [{ ...row, meal: row.meal }] : [],
  );
  const recipeIds = [...new Set(items.map((i) => i.recipeId))];
  if (recipeIds.length === 0) return { cycle, items, recipes: {} };

  const books = await db
    .select({
      recipeId: schema.recipes.id,
      title: schema.recipes.title,
      versionId: schema.recipeVersions.id,
      body: schema.recipeVersions.body,
    })
    .from(schema.recipes)
    .leftJoin(
      schema.recipeVersions,
      eq(schema.recipeVersions.id, schema.recipes.acceptedVersionId),
    )
    .where(inArray(schema.recipes.id, recipeIds));
  const versionIds = books.flatMap((b) => (b.versionId ? [b.versionId] : []));

  const [counts, open] =
    versionIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              versionId: schema.recipePlateCounts.versionId,
              plates: schema.recipePlateCounts.plates,
              lines: schema.recipePlateCounts.lines,
            })
            .from(schema.recipePlateCounts)
            .where(inArray(schema.recipePlateCounts.versionId, versionIds))
            .orderBy(asc(schema.recipePlateCounts.plates)),
          db
            .select({
              versionId: schema.recipeProofreadRuns.versionId,
              plates: schema.recipeProofreadRuns.plates,
            })
            .from(schema.recipeProofreadRuns)
            .where(
              and(
                inArray(schema.recipeProofreadRuns.versionId, versionIds),
                eq(schema.recipeProofreadRuns.kind, "plates"),
                inArray(schema.recipeProofreadRuns.outcome, [
                  "queued",
                  "running",
                ]),
              ),
            ),
        ]);

  const recipes: Record<string, MenuRecipeFacts> = {};
  for (const book of books) {
    recipes[book.recipeId] = {
      recipeId: book.recipeId,
      title: book.title?.trim() || "Untitled recipe",
      versionId: book.versionId,
      categories: (book.body?.ingredients ?? []).map((l) => l.category),
      counts: counts
        .filter((c) => c.versionId === book.versionId)
        .map((c) => ({ plates: c.plates, lines: c.lines })),
      openPlates: open
        .filter((o) => o.versionId === book.versionId && o.plates !== null)
        .map((o) => o.plates!),
    };
  }
  return { cycle, items, recipes };
}

/** This year's menu (or a given year's). */
export async function getKitchenMenu(cycle?: number): Promise<KitchenMenu> {
  const db = createHttpDb();
  return readKitchenMenu(db, cycle ?? (await currentCycleNumber(db)));
}

/** A recipe in the book, as the menu's recipe picker lists it. */
export interface MenuBookRecipe {
  id: string;
  title: string;
  /** The book version's one-line summary, or null. */
  summary: string | null;
  /** From the first step to the plate, in minutes, or null when not known. */
  totalMinutes: number | null;
  /** Every plate count the book version has, smallest first. */
  readyPlates: number[];
  /** Counts Claude is working on. */
  openPlates: number[];
}

/**
 * Every recipe in the book (it has an accepted version), by name, with what
 * the picker shows: its summary, its time and where its plate counts stand.
 */
export async function listMenuBook(): Promise<MenuBookRecipe[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      versionId: schema.recipeVersions.id,
      summary: sql<string | null>`${schema.recipeVersions.body}->>'summary'`,
      totalMinutes: sql<
        number | null
      >`(${schema.recipeVersions.body}->>'totalTimeMinutes')::int`,
    })
    .from(schema.recipes)
    .innerJoin(
      schema.recipeVersions,
      eq(schema.recipeVersions.id, schema.recipes.acceptedVersionId),
    )
    .orderBy(asc(sql`lower(${schema.recipes.title})`));
  const versionIds = rows.map((r) => r.versionId);
  if (versionIds.length === 0) return [];
  const [counts, open] = await Promise.all([
    db
      .select({
        versionId: schema.recipePlateCounts.versionId,
        plates: schema.recipePlateCounts.plates,
      })
      .from(schema.recipePlateCounts)
      .where(inArray(schema.recipePlateCounts.versionId, versionIds))
      .orderBy(asc(schema.recipePlateCounts.plates)),
    db
      .select({
        versionId: schema.recipeProofreadRuns.versionId,
        plates: schema.recipeProofreadRuns.plates,
      })
      .from(schema.recipeProofreadRuns)
      .where(
        and(
          inArray(schema.recipeProofreadRuns.versionId, versionIds),
          eq(schema.recipeProofreadRuns.kind, "plates"),
          inArray(schema.recipeProofreadRuns.outcome, ["queued", "running"]),
        ),
      ),
  ]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || "Untitled recipe",
    summary: row.summary?.trim() || null,
    totalMinutes:
      typeof row.totalMinutes === "number" ? row.totalMinutes : null,
    readyPlates: counts
      .filter((c) => c.versionId === row.versionId)
      .map((c) => c.plates),
    openPlates: open
      .filter((o) => o.versionId === row.versionId && o.plates !== null)
      .map((o) => o.plates!),
  }));
}

/** A year's snacks, oldest first. */
export async function readSnacks(
  db: DbOrTx,
  cycle: number,
): Promise<KitchenSnack[]> {
  return db
    .select({
      id: schema.kitchenSnacks.id,
      name: schema.kitchenSnacks.name,
      amount: schema.kitchenSnacks.amount,
    })
    .from(schema.kitchenSnacks)
    .where(eq(schema.kitchenSnacks.cycle, cycle))
    .orderBy(asc(schema.kitchenSnacks.createdAt), asc(schema.kitchenSnacks.id));
}

/** This year's snacks (or a given year's). */
export async function getSnacks(cycle?: number): Promise<KitchenSnack[]> {
  const db = createHttpDb();
  return readSnacks(db, cycle ?? (await currentCycleNumber(db)));
}

/** A year's shopping list ticks. */
export async function readShoppingTicks(
  db: DbOrTx,
  cycle: number,
): Promise<ShoppingTick[]> {
  return db
    .select({
      key: schema.kitchenShoppingTicks.itemKey,
      amount: schema.kitchenShoppingTicks.amount,
    })
    .from(schema.kitchenShoppingTicks)
    .where(eq(schema.kitchenShoppingTicks.cycle, cycle));
}

/** Everything this year's shopping list is worked out from, read at once. */
export async function getShoppingFacts(): Promise<ShoppingFacts> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const [plan, menu, snacks, ticks] = await Promise.all([
    readMealPlan(db, cycle),
    readKitchenMenu(db, cycle),
    readSnacks(db, cycle),
    readShoppingTicks(db, cycle),
  ]);
  return { plan, menu, snacks, ticks };
}

// --- Menu writes -------------------------------------------------------------

/**
 * Puts a recipe from the book on a meal of this year's menu, after the ones
 * already there. The day must be on the meal plan and the meal must have
 * plates saved; the recipe must be in the book.
 */
export async function addMenuItem(input: {
  actorId: string;
  day: number;
  meal: MealOfTheDay;
  recipeId: string;
}): Promise<KitchenMenuWriteResult<{ itemId: string }>> {
  return write(async (tx) => {
    if (!(await lockMealPlanEditor(tx, input.actorId))) {
      refuse(NOT_A_MENU_EDITOR);
    }
    if (!isMeal(input.meal) || !Number.isInteger(input.day)) {
      refuse(MENU_DAY_NOT_ON_PLAN);
    }
    if (!UUID.test(input.recipeId)) refuse(MENU_RECIPE_NOT_IN_BOOK);
    const cycle = await currentCycleNumber(tx);
    const plan = await readMealPlan(tx, cycle);
    if (input.day < 1 || input.day > plan.daysOnSite) {
      refuse(MENU_DAY_NOT_ON_PLAN);
    }
    if ((plan.days[input.day - 1]?.[input.meal] ?? 0) <= 0) {
      refuse(MENU_MEAL_HAS_NO_PLATES);
    }
    const [recipe] = await tx
      .select({
        title: schema.recipes.title,
        versionId: schema.recipes.acceptedVersionId,
      })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, input.recipeId))
      .for("share");
    if (!recipe?.versionId) refuse(MENU_RECIPE_NOT_IN_BOOK);

    // Two editors adding to one meal at once would both count the same
    // recipes and both pass the cap: the year's menu is written one at a time.
    await lockKitchenList(tx, "kitchen_menu_items", cycle);
    const onMeal = and(
      eq(schema.kitchenMenuItems.cycle, cycle),
      eq(schema.kitchenMenuItems.day, input.day),
      eq(schema.kitchenMenuItems.meal, input.meal),
    );
    const [held] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        top: sql<number | null>`max(${schema.kitchenMenuItems.position})`,
      })
      .from(schema.kitchenMenuItems)
      .where(onMeal);
    if ((held?.count ?? 0) >= MAX_RECIPES_PER_MEAL) refuse(MEAL_IS_FULL);

    const [row] = await tx
      .insert(schema.kitchenMenuItems)
      .values({
        cycle,
        day: input.day,
        meal: input.meal,
        recipeId: input.recipeId,
        position: (held?.top ?? 0) + 1,
        addedByUserId: input.actorId,
      })
      .onConflictDoNothing({
        target: [
          schema.kitchenMenuItems.cycle,
          schema.kitchenMenuItems.day,
          schema.kitchenMenuItems.meal,
          schema.kitchenMenuItems.recipeId,
        ],
      })
      .returning({ id: schema.kitchenMenuItems.id });
    if (!row) refuse(ALREADY_ON_MEAL);

    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_menu.added",
      target: "kitchen",
      metadata: {
        cycle,
        day: input.day,
        meal: input.meal,
        recipeId: input.recipeId,
        title: recipe.title ?? "Untitled recipe",
      },
    });
    return { itemId: row.id };
  });
}

/** Takes a recipe off a meal of this year's menu. */
export async function removeMenuItem(input: {
  actorId: string;
  itemId: string;
}): Promise<KitchenMenuWriteResult> {
  return write(async (tx) => {
    if (!(await lockMealPlanEditor(tx, input.actorId))) {
      refuse(NOT_A_MENU_EDITOR);
    }
    if (!UUID.test(input.itemId)) refuse(MENU_ITEM_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .delete(schema.kitchenMenuItems)
      .where(
        and(
          eq(schema.kitchenMenuItems.id, input.itemId),
          eq(schema.kitchenMenuItems.cycle, cycle),
        ),
      )
      .returning({
        day: schema.kitchenMenuItems.day,
        meal: schema.kitchenMenuItems.meal,
        recipeId: schema.kitchenMenuItems.recipeId,
      });
    if (!row) refuse(MENU_ITEM_GONE);
    const [recipe] = await tx
      .select({ title: schema.recipes.title })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, row.recipeId));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_menu.removed",
      target: "kitchen",
      metadata: {
        cycle,
        day: row.day,
        meal: row.meal,
        recipeId: row.recipeId,
        title: recipe?.title ?? "Untitled recipe",
      },
    });
    return {};
  });
}

// --- Snack writes ------------------------------------------------------------

/** Adds a snack to this year's list. */
export async function addSnack(input: {
  actorId: string;
  name: string;
  amount: string | null;
}): Promise<KitchenMenuWriteResult<{ snackId: string }>> {
  return write(async (tx) => {
    if (!(await lockMealPlanEditor(tx, input.actorId))) {
      refuse(NOT_A_SNACK_KEEPER);
    }
    const cycle = await currentCycleNumber(tx);
    // As on the menu: the count and the insert must not interleave.
    await lockKitchenList(tx, "kitchen_snacks", cycle);
    const [held] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.kitchenSnacks)
      .where(eq(schema.kitchenSnacks.cycle, cycle));
    if ((held?.count ?? 0) >= MAX_SNACKS) refuse(TOO_MANY_SNACKS);
    const name = input.name.trim();
    const amount = input.amount?.trim() || null;
    const [row] = await tx
      .insert(schema.kitchenSnacks)
      .values({ cycle, name, amount, addedByUserId: input.actorId })
      .returning({ id: schema.kitchenSnacks.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_snack.added",
      target: "kitchen",
      metadata: { cycle, snackId: row!.id, name, amount },
    });
    return { snackId: row!.id };
  });
}

/** Takes a snack off this year's list. */
export async function removeSnack(input: {
  actorId: string;
  snackId: string;
}): Promise<KitchenMenuWriteResult> {
  return write(async (tx) => {
    if (!(await lockMealPlanEditor(tx, input.actorId))) {
      refuse(NOT_A_SNACK_KEEPER);
    }
    if (!UUID.test(input.snackId)) refuse(SNACK_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .delete(schema.kitchenSnacks)
      .where(
        and(
          eq(schema.kitchenSnacks.id, input.snackId),
          eq(schema.kitchenSnacks.cycle, cycle),
        ),
      )
      .returning({
        name: schema.kitchenSnacks.name,
        amount: schema.kitchenSnacks.amount,
      });
    if (!row) refuse(SNACK_GONE);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.kitchen_snack.removed",
      target: "kitchen",
      metadata: { cycle, snackId: input.snackId, ...row },
    });
    return {};
  });
}

// --- Ticks -------------------------------------------------------------------

/**
 * Ticks (or unticks) lines of this year's shopping list for the whole camp.
 * Any approved member may. A tick keeps the amount the member saw.
 */
export async function setShoppingTicks(input: {
  actorId: string;
  lines: readonly ShoppingTick[];
  ticked: boolean;
}): Promise<KitchenMenuWriteResult> {
  return write(async (tx) => {
    if (!(await isApprovedMember(tx, input.actorId))) refuse(NOT_A_TICKER);
    const cycle = await currentCycleNumber(tx);
    // One row per key: the last amount given wins.
    const byKey = new Map(input.lines.map((l) => [l.key, l.amount]));
    if (byKey.size === 0) return {};
    if (!input.ticked) {
      await tx
        .delete(schema.kitchenShoppingTicks)
        .where(
          and(
            eq(schema.kitchenShoppingTicks.cycle, cycle),
            inArray(schema.kitchenShoppingTicks.itemKey, [...byKey.keys()]),
          ),
        );
      return {};
    }
    const now = new Date();
    await tx
      .insert(schema.kitchenShoppingTicks)
      .values(
        [...byKey].map(([itemKey, amount]) => ({
          cycle,
          itemKey,
          amount,
          tickedByUserId: input.actorId,
          tickedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.kitchenShoppingTicks.cycle,
          schema.kitchenShoppingTicks.itemKey,
        ],
        set: {
          amount: sql`excluded.amount`,
          tickedByUserId: sql`excluded.ticked_by_user_id`,
          tickedAt: sql`excluded.ticked_at`,
        },
      });
    return {};
  });
}
