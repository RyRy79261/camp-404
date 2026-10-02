import { and, eq } from "drizzle-orm";
import { isComingThisYear } from "@camp404/core";
import { readFoodReactions, type FoodReactionEntry } from "@camp404/types";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// The daily site sheet's one read of its own (#249): the Kitchen's allergy
// line. Allergies are SAFETY_VISIBLE (packages/core/src/privacy.ts): readable
// by captains and team leads only. This function does not check who asks; the
// print page gates at team lead before it calls it and records the read
// (auditReadAfterResponse). The shifts, the menu and the programme come from
// their own modules.

/** One member's allergy facts, as the sheet needs them. */
export interface SheetAllergyRow {
  userId: string;
  /** The display name, to print as a first name; never shown in full. */
  name: string | null;
  allergies: string | null;
  isAnaphylactic: boolean;
  /** The dietary pick-list (#245) once saved; null: only the old words. */
  foods: FoodReactionEntry[] | null;
}

/**
 * The allergies of every member who is coming this year (said Yes, or a
 * captain accepted them): approved, real, not erased, with an allergy on the
 * dietary pick-list once they have saved it, otherwise with the old form's
 * allergy words or the severe flag.
 */
export async function listSheetAllergies(
  cycle: number,
): Promise<SheetAllergyRow[]> {
  const rows = await createHttpDb()
    .select({
      userId: schema.users.id,
      name: schema.users.displayName,
      status: schema.campParticipations.status,
      allergies: schema.dietaryRequirements.allergies,
      isAnaphylactic: schema.dietaryRequirements.isAnaphylactic,
      foodReactions: schema.dietaryRequirements.foodReactions,
      foodsSavedAt: schema.dietaryRequirements.foodsSavedAt,
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
  return rows.flatMap((r) => {
    if (!isComingThisYear(r.status)) return [];
    const foods = r.foodsSavedAt ? readFoodReactions(r.foodReactions) : null;
    const allergic = foods
      ? foods.some((f) => f.reaction !== "intolerance")
      : r.isAnaphylactic || (r.allergies ?? "").trim().length > 0;
    if (!allergic) return [];
    return [
      {
        userId: r.userId,
        name: r.name,
        allergies: r.allergies,
        isAnaphylactic: r.isAnaphylactic,
        foods,
      },
    ];
  });
}
