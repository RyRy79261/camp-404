import { z } from "zod";
import { KITCHEN_ALLERGENS, KitchenAllergen } from "./dietary";
import { Currency } from "./money";
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

// --- Prices and shops (#245, the owner's Option A, 2026-10-02) ---------------
// A captain or a Kitchen lead gives a shopping line a shop and a price for the
// whole amount on the line, and says whether the price is an estimate or what
// was paid. Rands only, in whole cents (Currency, @camp404/core money.ts).

export const PRICE_KINDS = ["estimate", "paid"] as const;
export const PriceKind = z.enum(PRICE_KINDS);
export type PriceKind = z.infer<typeof PriceKind>;

export const SHOP_NAME_MAX = 80;
/** R 10 000 000: far above any one line of a camp's food. */
export const MAX_LINE_PRICE_CENTS = 1_000_000_000;

export const SetShoppingPriceInput = z.object({
  key: z.string().trim().min(1).max(SHOPPING_KEY_MAX),
  shop: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .max(SHOP_NAME_MAX, `Keep the shop under ${SHOP_NAME_MAX} characters.`)
      .nullable(),
  ),
  amountCents: z
    .number({ error: "Type the price in rands, like 96,00." })
    .int("Type the price in rands, like 96,00.")
    .min(0, "A price cannot be below R0.")
    .max(MAX_LINE_PRICE_CENTS, "That price is too large.")
    .nullable(),
  kind: PriceKind,
  currency: Currency,
  /** The line's version the editor saw; 0 when it had no shop or price. */
  expectedVersion: z.number().int().min(0),
});
export type SetShoppingPriceInput = z.infer<typeof SetShoppingPriceInput>;

// --- The dietary cross-check on the meal plan --------------------------------

export const ALLERGEN_PLAN_KINDS = ["portion", "substitution"] as const;
export const AllergenPlanKind = z.enum(ALLERGEN_PLAN_KINDS);
export type AllergenPlanKind = z.infer<typeof AllergenPlanKind>;

export const ALLERGEN_PLAN_MAX = 500;

/** A plan for a recipe on a meal that someone coming is anaphylactic to. */
export const RecordAllergenPlanInput = z.object({
  itemId: RowId,
  kind: AllergenPlanKind,
  details: z
    .string({ error: "Say what exactly the kitchen will do." })
    .trim()
    .min(1, "Say what exactly the kitchen will do.")
    .max(
      ALLERGEN_PLAN_MAX,
      `Keep the plan under ${ALLERGEN_PLAN_MAX} characters.`,
    ),
  /** The anaphylaxis foods the plan covers, as the editor saw them. */
  allergens: z.array(KitchenAllergen).min(1).max(KITCHEN_ALLERGENS.length),
  /** The plan's version the editor saw; 0 when there was none. */
  expectedVersion: z.number().int().min(0),
});
export type RecordAllergenPlanInput = z.infer<typeof RecordAllergenPlanInput>;

/** A captain or a Kitchen lead correcting what a recipe's book version holds. */
export const CorrectRecipeAllergensInput = z.object({
  recipeId: RowId,
  /** The book version the editor saw. */
  versionId: RowId,
  allergens: z
    .array(KitchenAllergen)
    .max(KITCHEN_ALLERGENS.length)
    .refine((a) => new Set(a).size === a.length, "Pick each food once."),
  /** The correction's revision the editor saw; 0 when there was none. */
  expectedRevision: z.number().int().min(0),
});
export type CorrectRecipeAllergensInput = z.infer<
  typeof CorrectRecipeAllergensInput
>;

// --- Prep steps --------------------------------------------------------------
// "+ Prep step" under a recipe on the meal plan: what to do, and when. A step
// due before the camp leaves goes on the task board for the Kitchen; one due
// on a day on site prints on that day's site sheet (no internet on site).

export const PREP_TIMINGS = ["day_before", "same_day", "before_leaving"] as const;
export const PrepTiming = z.enum(PREP_TIMINGS);
export type PrepTiming = z.infer<typeof PrepTiming>;

export const PREP_WHAT_MAX = 160;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const AddPrepStepInput = z
  .object({
    itemId: RowId,
    what: z
      .string({ error: "Say what to do." })
      .trim()
      .min(1, "Say what to do.")
      .max(PREP_WHAT_MAX, `Keep it under ${PREP_WHAT_MAX} characters.`),
    when: PrepTiming,
    /** The date, for "before we leave" only. */
    date: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z
        .string()
        .regex(ISO_DAY, "Pick the date.")
        .refine(
          (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
          "Pick the date.",
        )
        .nullable()
        .default(null),
    ),
  })
  .refine((s) => s.when !== "before_leaving" || s.date !== null, {
    message: "Pick the date.",
    path: ["date"],
  });
export type AddPrepStepInput = z.infer<typeof AddPrepStepInput>;

export const RemovePrepStepInput = z.object({ stepId: RowId });
export type RemovePrepStepInput = z.infer<typeof RemovePrepStepInput>;
