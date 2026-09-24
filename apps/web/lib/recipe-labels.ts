import { CAMP_TIME_ZONE } from "@camp404/core";
import type {
  IngredientCategory,
  RecipeLineUnit,
  RecipeNoteKind,
  RecipeSource,
  RecipeStatus,
} from "@camp404/types";

// The kitchen screens' words for each stored value (#243). A plain module with
// no server imports, so the pages and their client islands share one list.

export const STATUS_LABEL: Record<RecipeStatus, string> = {
  suggested: "Suggested",
  changes_requested: "Changes asked for",
  approved: "Approved",
  queued: "Waiting for Claude",
  analysing: "With Claude",
  proofread: "Draft to check",
  accepted: "In the book",
  rejected: "Rejected",
};

export const STATUS_VARIANT: Record<
  RecipeStatus,
  "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
> = {
  suggested: "warning",
  changes_requested: "outline",
  approved: "default",
  queued: "secondary",
  analysing: "secondary",
  proofread: "default",
  accepted: "success",
  rejected: "destructive",
};

export const SOURCE_LABEL: Record<RecipeSource, string> = {
  url: "Link",
  text: "Pasted text",
  voice: "Dictated",
};

const DATE = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});
const DATE_TIME = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** A day in the camp's time zone, e.g. "24 Sept 2026". */
export function formatDay(date: Date): string {
  return DATE.format(date);
}

/** A moment in the camp's time zone. */
export function formatWhen(date: Date): string {
  return DATE_TIME.format(date);
}

/** "1,200" */
export function formatCount(value: number): string {
  return value.toLocaleString("en-ZA");
}

// --- Reading a recipe ------------------------------------------------------

/** Each shopping category's heading: Noble Notations' CATEGORY_LABELS. */
export const CATEGORY_LABEL: Record<IngredientCategory, string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  fungus: "Mushrooms",
  herb: "Fresh herbs",
  grain: "Grains & flour",
  legume: "Legumes",
  spice: "Spices",
  condiment: "Sauces & condiments",
  fat: "Fats & oils",
  acid: "Vinegars & acids",
  sweetener: "Sweeteners",
  liquid: "Liquids",
  alcohol: "Alcohol",
  additive: "Additives",
  other: "Other",
};

/** Each practical note kind's word. */
export const NOTE_KIND_LABEL: Record<RecipeNoteKind, string> = {
  observation: "Observation",
  substitution: "Substitution",
  warning: "Warning",
  result: "Result",
  idea: "Idea",
  correction: "Correction",
};

/** The units that read as a count, and their plural. */
const PLURAL_UNIT: Partial<Record<RecipeLineUnit, string>> = {
  cup: "cups",
  piece: "pieces",
  clove: "cloves",
  pod: "pods",
  head: "heads",
  bunch: "bunches",
  sprig: "sprigs",
  leaf: "leaves",
  pinch: "pinches",
  bottle: "bottles",
  stalk: "stalks",
  slice: "slices",
  stick: "sticks",
};

/** A quantity to at most two decimals, with no trailing zeros: 2.5, 0.25, 1200. */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * An ingredient amount as the recipe page prints it: "2.5 kg", "8–10 cloves",
 * "1 cup", "3". Null when the line has no amount ("to taste").
 */
export function formatAmount(
  quantity: number | null,
  quantityMax: number | null,
  unit: RecipeLineUnit | null,
): string | null {
  if (quantity === null) return null;
  const range =
    quantityMax !== null && quantityMax !== quantity
      ? `${formatNumber(quantity)}–${formatNumber(quantityMax)}`
      : formatNumber(quantity);
  if (unit === null) return range;
  const plural = PLURAL_UNIT[unit];
  const one = range === "1";
  return `${range} ${plural && !one ? plural : unit}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(minutes / 1_440);
  const hours = Math.round((minutes % 1_440) / 60);
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/**
 * A time as the recipe page prints it: "45 min", "1 h 30 min", "20–25 min".
 * Null when there is none. A time never changes with the plate count.
 */
export function formatDuration(
  minutes: number | null,
  maxMinutes: number | null = null,
): string | null {
  if (minutes === null) return null;
  if (maxMinutes === null || maxMinutes === minutes) {
    return formatMinutes(minutes);
  }
  // Two times under an hour share one unit: "20–25 min".
  return maxMinutes < 60
    ? `${minutes}–${maxMinutes} min`
    : `${formatMinutes(minutes)}–${formatMinutes(maxMinutes)}`;
}

/** "1 plate", "45 plates". */
export function platesLabel(plates: number): string {
  return `${plates} plate${plates === 1 ? "" : "s"}`;
}
