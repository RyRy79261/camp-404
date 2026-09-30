import { z } from "zod";
import { MEAL_PLAN_MAX_DAYS, MEALS_OF_THE_DAY } from "./recipe";

// The Kitchen's menu (#244) and shopping list (#245), the layouts the owner
// approved on 2026-09-30 (docs/specs/2026-09-28-kitchen-menu-and-shopping.md):
// recipes sit inside the meal plan table, more than one to a meal; the
// shopping list is worked out from them, grouped by shop area, and its ticks
// are shared by the whole camp. Snacks are their own short list (a name and
// an amount), added into the shopping list.

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const RowId = z.guid();

/** The most recipes one meal holds: a main, sides, a sauce, with room over. */
export const MAX_RECIPES_PER_MEAL = 6;

export const AddMenuItemInput = z.object({
  day: z
    .number()
    .int()
    .min(1, "Pick a day on the meal plan.")
    .max(MEAL_PLAN_MAX_DAYS, "Pick a day on the meal plan."),
  meal: z.enum(MEALS_OF_THE_DAY),
  recipeId: RowId,
});
export type AddMenuItemInput = z.infer<typeof AddMenuItemInput>;

export const RemoveMenuItemInput = z.object({ itemId: RowId });
export type RemoveMenuItemInput = z.infer<typeof RemoveMenuItemInput>;

/** The most snacks on a year's list. */
export const MAX_SNACKS = 100;
export const SNACK_NAME_MAX = 120;
export const SNACK_AMOUNT_MAX = 60;

/** A snack: what it is and, if known, how much ("6 packets", "2 crates"). */
export const AddSnackInput = z.object({
  name: z
    .string({ error: "Name the snack." })
    .trim()
    .min(1, "Name the snack.")
    .max(SNACK_NAME_MAX, `Keep the name under ${SNACK_NAME_MAX} characters.`),
  amount: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .max(
        SNACK_AMOUNT_MAX,
        `Keep the amount under ${SNACK_AMOUNT_MAX} characters.`,
      )
      .nullable()
      .default(null),
  ),
});
export type AddSnackInput = z.infer<typeof AddSnackInput>;

export const RemoveSnackInput = z.object({ snackId: RowId });
export type RemoveSnackInput = z.infer<typeof RemoveSnackInput>;

/** The most lines one press ticks: a whole shop area. */
export const MAX_TICKS_AT_ONCE = 300;
export const SHOPPING_KEY_MAX = 300;
export const SHOPPING_AMOUNT_MAX = 120;

/**
 * Ticking (or unticking) shopping list lines. Each line is named by its key
 * and the amount the ticker saw, so a tick given for 2 kg does not read as
 * bought once the list needs 3 kg.
 */
export const SetShoppingTicksInput = z.object({
  lines: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(SHOPPING_KEY_MAX),
        amount: z.string().max(SHOPPING_AMOUNT_MAX),
      }),
    )
    .min(1, "Pick a line to tick.")
    .max(MAX_TICKS_AT_ONCE),
  ticked: z.boolean(),
});
export type SetShoppingTicksInput = z.infer<typeof SetShoppingTicksInput>;
