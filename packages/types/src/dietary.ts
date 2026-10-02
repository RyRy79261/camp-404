import { z } from "zod";

// Dietary needs as a pick-list (#245; the owner's answer, 2026-10-02): each
// member picks the foods they react to and says how (an allergy, an
// intolerance or anaphylaxis), and picks their diet. The same food words name
// a recipe's allergens, which Claude marks per ingredient when it proofreads,
// so the meal plan can check one against the other without reading anyone's
// free text. The old form's free words stay where they were
// (dietary_requirements.allergies / notes) and are shown back to the member
// to pick again; nothing guesses them into this shape.

/** The foods a member can pick and a recipe can hold, in the form's order. */
export const KITCHEN_ALLERGENS = [
  "milk",
  "eggs",
  "gluten",
  "peanuts",
  "tree_nuts",
  "soy",
  "fish",
  "shellfish",
  "molluscs",
  "sesame",
  "mustard",
  "celery",
  "lupin",
  "sulphites",
  "onion_garlic",
  "nightshades",
] as const;
export const KitchenAllergen = z.enum(KITCHEN_ALLERGENS);
export type KitchenAllergen = z.infer<typeof KitchenAllergen>;

/** Each food as people read it. */
export const ALLERGEN_LABELS: Record<KitchenAllergen, string> = {
  milk: "Milk",
  eggs: "Eggs",
  gluten: "Gluten",
  peanuts: "Peanuts",
  tree_nuts: "Tree nuts",
  soy: "Soy",
  fish: "Fish",
  shellfish: "Shellfish",
  molluscs: "Molluscs",
  sesame: "Sesame",
  mustard: "Mustard",
  celery: "Celery",
  lupin: "Lupin",
  sulphites: "Sulphites",
  onion_garlic: "Onion and garlic",
  nightshades: "Nightshades",
};

/** What a food does to a member. Anaphylaxis is the hard stop. */
export const FOOD_REACTIONS = ["allergy", "intolerance", "anaphylaxis"] as const;
export const FoodReaction = z.enum(FOOD_REACTIONS);
export type FoodReaction = z.infer<typeof FoodReaction>;

export const FOOD_REACTION_LABELS: Record<FoodReaction, string> = {
  allergy: "Allergy",
  intolerance: "Intolerance",
  anaphylaxis: "Anaphylaxis",
};

/** Diet choices: counted on the meal plan, never matched to a recipe. */
export const DIETS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "halal",
  "kosher",
] as const;
export const Diet = z.enum(DIETS);
export type Diet = z.infer<typeof Diet>;

export const DIET_LABELS: Record<Diet, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  halal: "Halal",
  kosher: "Kosher",
};

/** One food a member reacts to. */
export const FoodReactionEntry = z.object({
  food: KitchenAllergen,
  reaction: FoodReaction,
});
export type FoodReactionEntry = z.infer<typeof FoodReactionEntry>;

/** A member saving their own dietary needs. */
export const SaveDietaryInput = z.object({
  foods: z
    .array(FoodReactionEntry)
    .max(KITCHEN_ALLERGENS.length)
    .refine(
      (foods) => new Set(foods.map((f) => f.food)).size === foods.length,
      "Pick each food once.",
    ),
  diets: z
    .array(Diet)
    .max(DIETS.length)
    .refine((d) => new Set(d).size === d.length, "Pick each diet once."),
});
export type SaveDietaryInput = z.infer<typeof SaveDietaryInput>;

/**
 * Stored food reactions as they come out of a jsonb column: anything that is
 * not a known food with a known reaction is dropped, and a food listed twice
 * keeps its first entry. Never throws, so an odd row cannot break a page.
 */
export function readFoodReactions(value: unknown): FoodReactionEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FoodReactionEntry[] = [];
  for (const item of value) {
    const parsed = FoodReactionEntry.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.food)) continue;
    seen.add(parsed.data.food);
    out.push(parsed.data);
  }
  return out;
}

/** Stored diets as they come out of a jsonb column: known ones, once each. */
export function readDiets(value: unknown): Diet[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((d): d is Diet => Diet.safeParse(d).success),
    ),
  ];
}

/** Stored allergens (a recipe's correction): known ones, once each, in order. */
export function readAllergens(value: unknown): KitchenAllergen[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(
    value.filter((a): a is KitchenAllergen => KitchenAllergen.safeParse(a).success),
  );
  return KITCHEN_ALLERGENS.filter((a) => set.has(a));
}
