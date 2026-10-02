import {
  ALLERGEN_LABELS,
  DIETS,
  DIET_LABELS,
  KITCHEN_ALLERGENS,
  type Diet,
  type FoodReactionEntry,
  type KitchenAllergen,
} from "@camp404/types";
import { canEditMealPlan } from "./recipes";

// The dietary cross-check on the meal plan (#245; the owner approved Option A
// of design/kitchen-dietary.html, 2026-10-02). Pure: no DB, no session, no
// next/*.
//
// THE COUNTS. From the dietary forms of the members coming this year: for
// each food, how many are allergic (anaphylaxis included, and said apart),
// how many intolerant; for each diet, how many keep it. Counts only: nothing
// here carries a member's id or name, so nothing that reaches the kitchen
// view can. Seeing WHO goes through the daily site sheet, which records the
// read (auditReadAfterResponse).
//
// THE FLAGS. A recipe on a meal holds allergens: Claude marks them per
// ingredient when it proofreads, and a captain or a Kitchen lead may correct
// the list for the book version. A recipe that holds something someone
// coming is anaphylactic to gets a red flag until a plan is recorded for that
// recipe on that meal (a separate portion or a substitution), and the plan
// must name every such food, so a new anaphylaxis turns it red again. Any
// other clash (an allergy or an intolerance) is an amber line. Diets are
// counted, never matched.

/**
 * Whether someone may read the counts, record a plan and correct a recipe's
 * allergens: a captain or a Kitchen lead, the people who edit the meal plan.
 */
export function canCheckMenuAllergens(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return canEditMealPlan(rank, ledTeams);
}

/** One member's answers, as the counts need them: no id, no name. */
export interface DietaryAnswers {
  foods: readonly FoodReactionEntry[];
  diets: readonly Diet[];
}

export interface AllergyCount {
  food: KitchenAllergen;
  label: string;
  /** Members allergic to it, the anaphylactic ones included. */
  count: number;
  anaphylactic: number;
}

export interface IntoleranceCount {
  food: KitchenAllergen;
  label: string;
  count: number;
}

export interface DietCount {
  diet: Diet;
  label: string;
  count: number;
}

export interface DietaryCounts {
  /** How many members' forms were counted. */
  members: number;
  allergies: AllergyCount[];
  intolerances: IntoleranceCount[];
  preferences: DietCount[];
}

/** Most first; a tie keeps the form's order. */
function byCount<T extends { count: number }>(
  rows: T[],
  order: (row: T) => number,
): T[] {
  return rows.sort((a, b) => b.count - a.count || order(a) - order(b));
}

/** The counts box: per food and per diet, never per person. */
export function dietaryCounts(
  answers: readonly DietaryAnswers[],
): DietaryCounts {
  const allergy = new Map<KitchenAllergen, number>();
  const anaphylaxis = new Map<KitchenAllergen, number>();
  const intolerance = new Map<KitchenAllergen, number>();
  const diet = new Map<Diet, number>();
  const add = <K>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  for (const member of answers) {
    const seen = new Set<KitchenAllergen>();
    for (const { food, reaction } of member.foods) {
      if (seen.has(food)) continue;
      seen.add(food);
      if (reaction === "intolerance") add(intolerance, food);
      else {
        add(allergy, food);
        if (reaction === "anaphylaxis") add(anaphylaxis, food);
      }
    }
    for (const d of new Set(member.diets)) add(diet, d);
  }

  const foodOrder = (row: { food: KitchenAllergen }) =>
    KITCHEN_ALLERGENS.indexOf(row.food);
  return {
    members: answers.length,
    allergies: byCount(
      [...allergy].map(([food, count]) => ({
        food,
        label: ALLERGEN_LABELS[food],
        count,
        anaphylactic: anaphylaxis.get(food) ?? 0,
      })),
      foodOrder,
    ),
    intolerances: byCount(
      [...intolerance].map(([food, count]) => ({
        food,
        label: ALLERGEN_LABELS[food],
        count,
      })),
      foodOrder,
    ),
    preferences: byCount(
      [...diet].map(([d, count]) => ({ diet: d, label: DIET_LABELS[d], count })),
      (row) => DIETS.indexOf(row.diet),
    ),
  };
}

/** One allergen a recipe holds, and the ingredient lines that hold it. */
export interface RecipeAllergen {
  allergen: KitchenAllergen;
  /** The ingredients' names, as the recipe has them; may be empty. */
  from: string[];
}

/**
 * What a recipe's book version holds: the correction a captain or a Kitchen
 * lead made, when there is one, otherwise every allergen Claude marked on its
 * lines. Each allergen once, in the list's order, with the lines that hold it.
 */
export function recipeAllergens(
  lines: readonly { name: string; allergens?: readonly string[] }[],
  correction: readonly KitchenAllergen[] | null,
): RecipeAllergen[] {
  const from = new Map<KitchenAllergen, string[]>();
  for (const line of lines) {
    for (const a of line.allergens ?? []) {
      if (!(KITCHEN_ALLERGENS as readonly string[]).includes(a)) continue;
      const names = from.get(a as KitchenAllergen) ?? [];
      if (!names.includes(line.name)) names.push(line.name);
      from.set(a as KitchenAllergen, names);
    }
  }
  const held = correction
    ? new Set(correction)
    : new Set<KitchenAllergen>(from.keys());
  return KITCHEN_ALLERGENS.filter((a) => held.has(a)).map((allergen) => ({
    allergen,
    from: from.get(allergen) ?? [],
  }));
}

/** Whether Claude marked a version's allergens at all (a newer prompt did). */
export function allergensMarked(
  lines: readonly { allergens?: readonly string[] }[],
): boolean {
  return lines.some((line) => line.allergens !== undefined);
}

/** One line under a recipe on the meal plan. */
export interface AllergenFlag {
  allergen: KitchenAllergen;
  /** "Milk (feta)", or "Eggs" when the ingredient is the food itself. */
  label: string;
  /** "2 allergic, 1 anaphylactic", "4 intolerant". */
  text: string;
}

export interface RecipeFlags {
  /** Foods someone coming is anaphylactic to: a plan is needed. */
  red: AllergenFlag[];
  /** Foods someone coming is allergic or intolerant to. */
  amber: AllergenFlag[];
}

/** "Milk (feta)"; "Eggs" when the only ingredient is called that. */
function flagLabel(held: RecipeAllergen): string {
  const label = ALLERGEN_LABELS[held.allergen];
  const names = held.from.filter(
    (n) => n.trim().toLowerCase() !== label.toLowerCase(),
  );
  return names.length > 0
    ? `${label} (${names.map((n) => n.trim().toLowerCase()).join(", ")})`
    : label;
}

/** The flags under one recipe, from what it holds and the camp's counts. */
export function allergenFlags(
  held: readonly RecipeAllergen[],
  counts: Pick<DietaryCounts, "allergies" | "intolerances">,
): RecipeFlags {
  const red: AllergenFlag[] = [];
  const amber: AllergenFlag[] = [];
  for (const h of held) {
    const allergy = counts.allergies.find((c) => c.food === h.allergen);
    const intolerant =
      counts.intolerances.find((c) => c.food === h.allergen)?.count ?? 0;
    const parts: string[] = [];
    if (allergy) parts.push(`${allergy.count} allergic`);
    if (allergy?.anaphylactic) parts.push(`${allergy.anaphylactic} anaphylactic`);
    if (intolerant) parts.push(`${intolerant} intolerant`);
    if (parts.length === 0) continue;
    const flag = { allergen: h.allergen, label: flagLabel(h), text: parts.join(", ") };
    if (allergy?.anaphylactic) red.push(flag);
    else amber.push(flag);
  }
  return { red, amber };
}

/**
 * Whether a recorded plan covers a recipe's red flags: it must name every
 * food someone coming is anaphylactic to. No red flags needs no plan.
 */
export function planCovers(
  planAllergens: readonly KitchenAllergen[] | null,
  red: readonly Pick<AllergenFlag, "allergen">[],
): boolean {
  if (red.length === 0) return true;
  if (!planAllergens) return false;
  return red.every((r) => planAllergens.includes(r.allergen));
}

/** "peanuts", "peanuts and sesame", "peanuts, sesame and eggs". */
export function foodsInWords(foods: readonly KitchenAllergen[]): string {
  const words = foods.map((f) => ALLERGEN_LABELS[f].toLowerCase());
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
