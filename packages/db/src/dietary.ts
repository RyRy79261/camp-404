import { and, eq } from "drizzle-orm";
import {
  canCheckMenuAllergens,
  dietaryCounts,
  isComingThisYear,
  type DietaryCounts,
} from "@camp404/core";
import {
  readDiets,
  readFoodReactions,
  type Diet,
  type FoodReactionEntry,
} from "@camp404/types";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The dietary pick-list (#245; the owner's answer, 2026-10-02) and the counts
// the meal plan shows. dietary_requirements is SAFETY_VISIBLE data
// (packages/core/src/privacy.ts): the member, captains and team leads.
//
//  - A member reads and saves only their own row here. The old form's free
//    words (allergies, the anaphylactic flag, notes) are read back to them,
//    never changed and never converted.
//  - The meal plan's counts are worked out HERE, on the server, and only the
//    counts leave this module: no member's id or name is in what it returns.
//    It answers null to anyone but a captain or a Kitchen lead (checked here,
//    not in the page). Seeing who has what goes through the daily site sheet,
//    which records each read.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the old (free-text) form holds, when it holds anything. */
export interface OldDietaryAnswer {
  allergies: string | null;
  isAnaphylactic: boolean;
  notes: string | null;
}

/** A member's own dietary needs. */
export interface MyDietary {
  foods: FoodReactionEntry[];
  diets: Diet[];
  /** When the pick-list was last saved; null: never. */
  savedAt: Date | null;
  /** The old form's words, or null when it says nothing. */
  old: OldDietaryAnswer | null;
}

/** The `version` a row first written by the pick-list carries. */
export const DIETARY_PICK_LIST_VERSION = "dietary-pick-list@1";

export const DIETARY_NOT_A_MEMBER =
  "Only a camp member can save dietary needs.";

function oldAnswer(row: {
  allergies: string | null;
  isAnaphylactic: boolean;
  notes: string | null;
}): OldDietaryAnswer | null {
  const allergies = row.allergies?.trim() || null;
  const notes = row.notes?.trim() || null;
  if (!allergies && !notes && !row.isAnaphylactic) return null;
  return { allergies, isAnaphylactic: row.isAnaphylactic, notes };
}

/** A member's own dietary needs: the pick-list and the old form's words. */
export async function getMyDietary(userId: string): Promise<MyDietary> {
  const empty: MyDietary = { foods: [], diets: [], savedAt: null, old: null };
  if (!UUID.test(userId)) return empty;
  const [row] = await createHttpDb()
    .select()
    .from(schema.dietaryRequirements)
    .where(eq(schema.dietaryRequirements.userId, userId))
    .limit(1);
  if (!row) return empty;
  return {
    foods: readFoodReactions(row.foodReactions),
    diets: readDiets(row.diets),
    savedAt: row.foodsSavedAt,
    old: oldAnswer(row),
  };
}

/**
 * Saves a member's own pick-list: the foods and how each affects them, and
 * their diets. Touches nothing else on the row (the old form's words stay).
 */
export async function saveMyDietary(input: {
  userId: string;
  foods: readonly FoodReactionEntry[];
  diets: readonly Diet[];
}): Promise<{ ok: true; savedAt: Date } | { ok: false; error: string }> {
  if (!UUID.test(input.userId))
    return { ok: false, error: DIETARY_NOT_A_MEMBER };
  const db = createHttpDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, input.userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    );
  if (!user) return { ok: false, error: DIETARY_NOT_A_MEMBER };
  const foods = readFoodReactions(input.foods);
  const diets = readDiets(input.diets);
  const now = new Date();
  await db
    .insert(schema.dietaryRequirements)
    .values({
      userId: input.userId,
      version: DIETARY_PICK_LIST_VERSION,
      foodReactions: foods,
      diets,
      foodsSavedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.dietaryRequirements.userId,
      set: { foodReactions: foods, diets, foodsSavedAt: now, updatedAt: now },
    });
  return { ok: true, savedAt: now };
}

/** The meal plan's dietary box: counts only. */
export interface MenuDietary {
  counts: DietaryCounts;
  /**
   * Members coming whose old form has words or the anaphylactic flag but
   * who have not saved the pick-list: they are not in the counts.
   */
  oldOnly: number;
}

/**
 * Counts from the dietary forms of the members coming this year (said Yes,
 * or a captain accepted them; approved, real, not erased), for a captain or
 * a Kitchen lead; null for anyone else. Nothing in it names anyone.
 */
export async function getMenuDietaryFor(
  viewerId: string,
): Promise<MenuDietary | null> {
  if (!UUID.test(viewerId)) return null;
  const db = createHttpDb();
  const reach = await lockSenderReach(db, viewerId);
  if (!canCheckMenuAllergens(reachRank(reach), reach ?? [])) return null;
  const cycle = await currentCycleNumber(db);
  const rows = await db
    .select({
      status: schema.campParticipations.status,
      foodReactions: schema.dietaryRequirements.foodReactions,
      diets: schema.dietaryRequirements.diets,
      foodsSavedAt: schema.dietaryRequirements.foodsSavedAt,
      allergies: schema.dietaryRequirements.allergies,
      isAnaphylactic: schema.dietaryRequirements.isAnaphylactic,
      notes: schema.dietaryRequirements.notes,
    })
    .from(schema.dietaryRequirements)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.dietaryRequirements.userId),
    )
    .innerJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  return menuDietary(rows);
}

/** The counts from rows already read (the test store shares this). */
export function menuDietary(
  rows: readonly {
    status: string | null;
    foodReactions: unknown;
    diets: unknown;
    foodsSavedAt: Date | null;
    allergies: string | null;
    isAnaphylactic: boolean;
    notes: string | null;
  }[],
): MenuDietary {
  const coming = rows.filter((r) =>
    isComingThisYear(r.status as Parameters<typeof isComingThisYear>[0]),
  );
  const saved = coming.filter((r) => r.foodsSavedAt !== null);
  return {
    counts: dietaryCounts(
      saved.map((r) => ({
        foods: readFoodReactions(r.foodReactions),
        diets: readDiets(r.diets),
      })),
    ),
    oldOnly: coming.filter(
      (r) => r.foodsSavedAt === null && oldAnswer(r) !== null,
    ).length,
  };
}
