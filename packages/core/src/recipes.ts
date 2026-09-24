import {
  DEFAULT_PLATES,
  INGREDIENT_CATEGORIES,
  ViewerRank,
  type IngredientCategory,
  type MealPlanDay,
  type RecipeStatus,
} from "@camp404/types";

// Recipes (#243, Kitchen 1): who may act on a recipe, which moves its status
// may make, and how a recipe is arranged on its page. Pure: no DB, no session,
// no next/*.
//
// WHO MAY ACT. Clearance stays global (AGENTS.md): a lead of ANY team stands
// on the `team_lead` rung everywhere, and the rank gate for the kitchen
// screens is captainActionGate at `team_lead`. Team identity decides only who
// may act HERE, the way it decides who a lead may send to in
// canSendToAudience: approving, rejecting, asking for changes, reviewing,
// editing a recipe's source and accepting an older draft belong to a captain
// or a lead of the Kitchen team. Sending a recipe to Claude spends the owner's
// money, and the owner gave it to the same people (decision 2A): a captain or
// a Kitchen lead, with no daily limit (the owner's call, 2026-09-24). The
// same people edit the year's meal plan (canEditMealPlan). A source run that
// succeeds saves its version straight into the book; one that needs more
// hands the recipe back with Claude's questions. Changing the kitchen
// settings stays a captain's alone. All of these fail closed on a rank this
// module does not know.
//
// The write re-reads the actor's rank and led teams inside its own
// transaction and passes those here; it never takes a team list from the
// caller.

/** The team whose leads run the kitchen's recipes. */
export const KITCHEN_TEAM = "kitchen";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may approve, reject or ask for changes on a suggestion, and
 * review, edit its source or accept an older draft: a captain, or a lead of
 * Kitchen.
 * `ledTeams` are the team keys they lead this year.
 */
export function canApproveRecipe(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(KITCHEN_TEAM);
  return false;
}

/**
 * Whether someone may send recipes to Claude, which costs money: a captain,
 * or a lead of Kitchen (the owner's decision 2A), the same people who approve
 * them. `ledTeams` are the team keys they lead this year.
 */
export function canRunProofread(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return canApproveRecipe(rank, ledTeams);
}

/**
 * Whether someone may change the year's meal plan: a captain or a Kitchen
 * lead, the people who send recipes to Claude for its plate counts. Anyone
 * approved reads it.
 */
export function canEditMealPlan(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return canApproveRecipe(rank, ledTeams);
}

/**
 * Whether someone may change the kitchen settings (the largest pot and the
 * burners): captains only,
 * whatever teams they lead.
 */
export function canSetKitchenSettings(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * The moves a recipe's status may make.
 * - A suggestion is approved, rejected, or sent back for changes; the member's
 *   edit makes it a suggestion again.
 * - A captain or a Kitchen lead queues a recipe for proofreading, from
 *   approved, proofread (a re-run) or accepted (a new version); the worker
 *   takes queued to analysing, and on to proofread (an older draft run) or to
 *   accepted (a source run writes its version straight into the book). A
 *   source run that comes back with questions hands the recipe back.
 * - A run that fails, stops, or finds its text no longer cleared hands the
 *   recipe back to where it stood when it was queued: approved, proofread
 *   (still holding the earlier result) or accepted. Nothing is retried.
 * - A proofread recipe (an older draft run) is accepted as a version. No
 *   write moves an approved recipe to accepted directly any more (the hand
 *   editor is gone); the move stays allowed here.
 * An accepted recipe gains later versions without leaving `accepted`, a
 * failed re-run included.
 */
export const RECIPE_TRANSITIONS: Readonly<
  Record<RecipeStatus, readonly RecipeStatus[]>
> = {
  suggested: ["approved", "rejected", "changes_requested"],
  changes_requested: ["suggested"],
  approved: ["queued", "accepted"],
  queued: ["analysing", "approved", "proofread", "accepted"],
  analysing: ["proofread", "approved", "accepted"],
  proofread: ["queued", "accepted"],
  accepted: ["queued"],
  rejected: [],
};

/** Whether a recipe may move from `from` to `to`. */
export function canMoveRecipe(from: RecipeStatus, to: RecipeStatus): boolean {
  // Own keys only: a stored value like "constructor" is no status.
  return Object.hasOwn(RECIPE_TRANSITIONS, from)
    ? RECIPE_TRANSITIONS[from].includes(to)
    : false;
}

// --- Reading a recipe ------------------------------------------------------
// Food does not scale by multiplying (the owner's ruling), so there is no
// scaling maths here: another plate count is proofread by Claude and stored.
// These only arrange a recipe for the page, the way Noble Notations does.

/**
 * A recipe's lines grouped for shopping: one group per category, in
 * INGREDIENT_CATEGORIES order, each line in the order it was written, with
 * its index in the recipe. Empty categories are left out.
 */
export function groupLinesByCategory<
  L extends { category: IngredientCategory },
>(
  lines: readonly L[],
): { category: IngredientCategory; lines: { line: L; index: number }[] }[] {
  return INGREDIENT_CATEGORIES.map((category) => ({
    category,
    lines: lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.category === category),
  })).filter((group) => group.lines.length > 0);
}

/**
 * A recipe's steps grouped by phase, as Noble Notations' recipe page does:
 * consecutive steps with the same phase form one group (a phase that comes
 * back later starts a new group), and the steps are numbered 1, 2, 3 straight
 * through the groups. A step with no phase has the phase null.
 */
export function groupStepsByPhase<S extends { phase: string | null }>(
  steps: readonly S[],
): { phase: string | null; steps: { step: S; number: number }[] }[] {
  const groups: {
    phase: string | null;
    steps: { step: S; number: number }[];
  }[] = [];
  steps.forEach((step, i) => {
    const phase = step.phase?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) last.steps.push({ step, number: i + 1 });
    else groups.push({ phase, steps: [{ step, number: i + 1 }] });
  });
  return groups;
}

/**
 * The plate count offered when Claude writes a recipe: the largest of the
 * breakfast, lunch and dinner counts that is set, or DEFAULT_PLATES.
 */
export function defaultPlates(settings: {
  kitchenPlatesBreakfast: number | null;
  kitchenPlatesLunch: number | null;
  kitchenPlatesDinner: number | null;
}): number {
  const set = [
    settings.kitchenPlatesBreakfast,
    settings.kitchenPlatesLunch,
    settings.kitchenPlatesDinner,
  ].filter((n): n is number => typeof n === "number" && n > 0);
  return set.length > 0 ? Math.max(...set) : DEFAULT_PLATES;
}

// --- The meal plan ---------------------------------------------------------

/**
 * Every distinct plate count in the meal plan, smallest first: the counts a
 * recipe in the book is shown at. A meal of 0 plates is no meal.
 */
export function mealPlanPlateCounts(days: readonly MealPlanDay[]): number[] {
  const counts = new Set<number>();
  for (const day of days) {
    for (const plates of [day.breakfast, day.lunch, day.dinner]) {
      if (Number.isInteger(plates) && plates > 0) counts.add(plates);
    }
  }
  return [...counts].sort((a, b) => a - b);
}

/**
 * The largest count at each meal over the days on site, or null for a meal
 * that is 0 every day, in the shape defaultPlates and the prompts read.
 */
export function mealPlanPeaks(days: readonly MealPlanDay[]): {
  kitchenPlatesBreakfast: number | null;
  kitchenPlatesLunch: number | null;
  kitchenPlatesDinner: number | null;
} {
  const peak = (meal: keyof MealPlanDay): number | null => {
    const top = Math.max(0, ...days.map((d) => d[meal]));
    return top > 0 ? top : null;
  };
  return {
    kitchenPlatesBreakfast: peak("breakfast"),
    kitchenPlatesLunch: peak("lunch"),
    kitchenPlatesDinner: peak("dinner"),
  };
}
