// The kitchen screens' fixed sentences and paths (#243). A plain module: a
// "use server" file may export only async functions, so the recipe actions
// and the screens that show these words share them from here.

export const RECIPES_PATH = "/kitchen/recipes";

/** A recipe's own page. */
export function recipePath(recipeId: string): string {
  return `${RECIPES_PATH}/${recipeId}`;
}

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
export const VARIATION_REFUSAL =
  "Only a Kitchen lead or a captain can start a variation.";
export const RUN_REFUSAL =
  "Only a captain or a Kitchen lead can turn recipes into kitchen recipes with Claude, because each run costs money.";
export const KITCHEN_SETTINGS_REFUSAL =
  "Only a captain can change the kitchen settings.";
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
