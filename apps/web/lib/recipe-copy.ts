// The kitchen screens' fixed sentences and paths (#243). A plain module: a
// "use server" file may export only async functions, so the recipe actions
// and the screens that show these words share them from here.

export const RECIPES_PATH = "/kitchen/recipes";

/** The kitchen's meal plan for the year. */
export const MEAL_PLAN_PATH = "/kitchen/meal-plan";

/** A recipe's own page. */
export function recipePath(recipeId: string): string {
  return `${RECIPES_PATH}/${recipeId}`;
}

/** A recipe's History tab. */
export function recipeHistoryPath(recipeId: string): string {
  return `${recipePath(recipeId)}?tab=history`;
}

/** One version of a recipe, on its own page. */
export function recipeVersionPath(recipeId: string, version: number): string {
  return `${recipePath(recipeId)}/versions/${version}`;
}

/** One version of a recipe's source, on its own page. */
export function recipeSourceVersionPath(
  recipeId: string,
  version: number,
): string {
  return `${recipePath(recipeId)}/sources/${version}`;
}

/**
 * A recipe's card to print (#249), at a plate count the recipe has a checked
 * result for. Without a count, the card is the version's own count.
 */
export function recipeCardPath(recipeId: string, plates?: number): string {
  return `/print/kitchen/recipes/${recipeId}${plates ? `?plates=${plates}` : ""}`;
}

/** The Kitchen's A4 prints (#249's prints round, the owner's Option A of each). */
export const SHOPPING_PRINT_PATH = "/print/kitchen/shopping";
export const RECIPE_BOOK_PRINT_PATH = "/print/kitchen/book";
export const PREP_PLAN_PRINT_PATH = "/print/kitchen/prep";

/** Who may print the prep plan: the people who read prep steps. */
export const PREP_PLAN_REFUSAL =
  "The prep plan is for captains and Kitchen leads, who keep the prep steps.";

/** A recipe's source editor. */
export function recipeEditPath(recipeId: string): string {
  return `${recipePath(recipeId)}/edit`;
}

export const DECIDE_REFUSAL =
  "Only a Kitchen lead or a captain can decide recipes.";
export const RETYPE_REFUSAL =
  "Only a Kitchen lead or a captain can retype a recipe.";
export const VERSION_REFUSAL =
  "Only a Kitchen lead or a captain can save a version of a recipe.";
export const RERUN_REQUEST_REFUSAL =
  "Only a Kitchen lead or a captain can ask for a recipe to be proofread again.";
export const RUN_REFUSAL =
  "Only a captain or a Kitchen lead can turn recipes into kitchen recipes with Claude, because each run costs money.";
export const PROOFREAD_NOT_SET_UP =
  "Proofreading is not set up yet: the Anthropic key is missing. Nothing was queued.";
export const CHECK_RECIPE = "Check the recipe and try again.";
export const REVIEW_REFUSAL =
  "Only a Kitchen lead or a captain reviews recipes.";
/** What everyone else reads where the Claude button would be. */
export const RUN_EXPLAINED =
  "A captain or a Kitchen lead turns recipes into kitchen recipes with Claude, because each run costs money.";
export const SOURCE_EDIT_REFUSAL =
  "Only a Kitchen lead or a captain can edit a recipe's source.";
export const MEAL_PLAN_REFUSAL =
  "Only a Kitchen lead or a captain can change the meal plan.";
export const CHECK_MEAL_PLAN = "Check the meal plan and try again.";
/** The button that replaces "Send for proofreading" while Claude waits. */
export const ANSWER_QUESTIONS_LABEL = "Claude needs more details — answer here";
/** A send or a save that never reached the server (the network dropped). */
export const UNREACHABLE = "Could not reach the server. Try again.";

/** The year's shopping list, worked out from the menu (#245). */
export const SHOPPING_LIST_PATH = "/kitchen/shopping";

export const MENU_REFUSAL =
  "Only a Kitchen lead or a captain can change the menu.";
export const SNACK_REFUSAL =
  "Only a Kitchen lead or a captain can change the snacks.";
export const TICK_REFUSAL =
  "Only approved camp members can tick the shopping list.";
export const CHECK_MENU = "Check the menu and try again.";

// #245: prices, the dietary check, plans and prep steps.
export const PRICE_REFUSAL =
  "Only a Kitchen lead or a captain can set shops and prices.";
export const CHECK_PRICE = "Check the shop and the price and try again.";
export const PLAN_REFUSAL =
  "Only a Kitchen lead or a captain can record a plan.";
export const ALLERGENS_REFUSAL =
  "Only a Kitchen lead or a captain can change a recipe's allergens.";
export const PREP_REFUSAL =
  "Only a Kitchen lead or a captain can add prep steps.";
export const CHECK_PREP = "Check the prep step and try again.";
export const DIETARY_FORM_PATH = "/tools/forms/dietary";
export const DIETARY_SAVED = "Dietary needs saved";
export const CHECK_DIETARY = "Check your answers and try again.";
