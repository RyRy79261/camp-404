import { z } from "zod";
import { DietaryTag } from "./member";

// Recipes (#243, Kitchen 1). Anyone suggests a recipe; a Kitchen lead or a
// captain approves it; only a captain sends it to Claude to be proofread,
// because each run costs the owner money; a Kitchen lead or a captain then
// accepts the proofread text as a version of the recipe.
//
//   suggested ──> approved ──> queued ──> analysing ──> proofread ──> accepted
//      │  ▲          │                        │             │            │
//      │  └── changes_requested               └─> approved  └─> queued <─┘
//      └──> rejected └──> accepted (a version written by hand)
//
// The allowed moves live in @camp404/core (RECIPE_TRANSITIONS). Who may make
// them is the server's rule, never this shape's.

export const RECIPE_STATUSES = [
  "suggested",
  "changes_requested",
  "approved",
  "queued",
  "analysing",
  "proofread",
  "accepted",
  "rejected",
] as const;
export const RecipeStatus = z.enum(RECIPE_STATUSES);
export type RecipeStatus = z.infer<typeof RecipeStatus>;

export const RecipeSource = z.enum(["url", "text", "voice"]);
export type RecipeSource = z.infer<typeof RecipeSource>;

// --- The recipe, in Noble Notations' shape ------------------------------------
// A version of a recipe is ONE body with the field names Noble Notations'
// create_recipe takes (title, summary, servings as `plates`, ingredients,
// steps with a phase and the lines each step uses, notes), so sending a recipe
// there later is mostly a copy. Every write checks it with this schema, and it
// is also the tool schema Claude answers through, so each field says what it
// is for. Change the shape and PROMPT_VERSIONS.recipeImport must be bumped.

/**
 * Where an ingredient sits on the shopping list, in shop order: Noble
 * Notations' CATEGORY_ORDER. Noble Notations keeps the category on the
 * ingredient record, so a push there has to set it on each ingredient too.
 */
export const INGREDIENT_CATEGORIES = [
  "produce",
  "protein",
  "dairy",
  "fungus",
  "herb",
  "grain",
  "legume",
  "spice",
  "condiment",
  "fat",
  "acid",
  "sweetener",
  "liquid",
  "alcohol",
  "additive",
  "other",
] as const;
export const IngredientCategory = z.enum(INGREDIENT_CATEGORIES);
export type IngredientCategory = z.infer<typeof IngredientCategory>;

/**
 * The units a line may be written in: the metric part of Noble Notations'
 * canonical units. oz, lb and fl oz are refused, so a recipe is never half
 * imperial.
 */
export const RECIPE_LINE_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "piece",
  "clove",
  "pod",
  "head",
  "bunch",
  "sprig",
  "leaf",
  "pinch",
  "bottle",
  "stalk",
  "slice",
  "stick",
] as const;
export const RecipeLineUnit = z.enum(RECIPE_LINE_UNITS);
export type RecipeLineUnit = z.infer<typeof RecipeLineUnit>;

/**
 * The kinds of note a recipe carries: Noble Notations' kinds without science
 * and research. This is an MVP of the recipe alone; food science waits.
 */
export const RECIPE_NOTE_KINDS = [
  "observation",
  "substitution",
  "warning",
  "result",
  "idea",
  "correction",
] as const;
export const RecipeNoteKind = z.enum(RECIPE_NOTE_KINDS);
export type RecipeNoteKind = z.infer<typeof RecipeNoteKind>;

/** The most plates one recipe or one plate count is written for. */
export const MAX_PLATES = 500;

/** A number of plates: a whole number from 1 to 500. */
export const PlateCount = z
  .number({ error: "Give the number of plates." })
  .int("Use a whole number of plates.")
  .min(1, "Cook for at least 1 plate.")
  .max(MAX_PLATES, `Cook for at most ${MAX_PLATES} plates.`);
export type PlateCount = z.infer<typeof PlateCount>;

/** The camp's meals; mornings usually feed more plates than evenings. */
export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

/** The plate count offered when no meal has one set. */
export const DEFAULT_PLATES = 40;

/** A week, in minutes: the longest a step or a recipe may say it takes. */
const MAX_MINUTES = 10_080;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .nullable()
    .default(null);

const minutes = () =>
  z
    .number({ error: "Enter a number of minutes." })
    .int("Use whole minutes.")
    .nonnegative("Minutes cannot be below 0.")
    .max(MAX_MINUTES, `Keep it under a week (${MAX_MINUTES} minutes).`)
    .nullable()
    .default(null);

const amount = () =>
  z
    .number({ error: "Enter a number." })
    .nonnegative("An amount cannot be below 0.")
    .max(100_000, "Keep an amount under 100000.")
    .nullable()
    .default(null);

export const RecipeLine = z
  .object({
    component: nullableText(120).describe(
      'The part of the dish this line belongs to, such as "Marinade" or "To serve". Null when the recipe has no parts.',
    ),
    name: z
      .string()
      .trim()
      .min(1, "Name the ingredient.")
      .max(200, "Keep the ingredient's name under 200 characters.")
      .describe(
        'The ingredient, named plainly: "Red lentils", "Garlic". No amount or preparation in the name.',
      ),
    category: IngredientCategory.describe(
      "Where it sits on the shopping list.",
    ),
    quantity: amount().describe(
      "The amount for the recipe's plates, in `unit`. The lower end of a range. Null for 'to taste'.",
    ),
    quantityMax: amount().describe(
      "The upper end when the amount is a range (4–5 cloves); otherwise null.",
    ),
    unit: RecipeLineUnit.nullable()
      .default(null)
      .describe("The unit of the amount; null for a bare count or none."),
    preparation: nullableText(200).describe(
      'How it is cut or readied: "finely chopped", "soaked overnight".',
    ),
    note: nullableText(500).describe(
      "A short note on this line, such as what to buy. Null when there is none.",
    ),
    optional: z
      .boolean()
      .default(false)
      .describe("True when the dish works without it."),
  })
  .superRefine((line, ctx) => {
    if (line.quantityMax === null) return;
    if (line.quantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "A range needs its lower amount in quantity.",
      });
    } else if (line.quantityMax < line.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["quantityMax"],
        message: "The upper amount cannot be below the lower one.",
      });
    }
  });
export type RecipeLine = z.infer<typeof RecipeLine>;

export const RecipeStep = z
  .object({
    phase: nullableText(60).describe(
      'A short stage name that groups steps: "Prep", "Marinate", "Cook", "Serve". Null when the recipe has no stages.',
    ),
    instruction: z
      .string()
      .trim()
      .min(1, "Write what to do in this step.")
      .max(600, "Keep a step under 600 characters. Split a long one in two.")
      .describe("One instruction, in plain English, in cooking order."),
    uses: z
      .array(
        z
          .string()
          .trim()
          .max(322, "Keep each ingredient name under 322 characters."),
      )
      .max(40, "A step can use at most 40 ingredient lines.")
      .default([])
      .describe(
        'The ingredient lines this step handles, each by its exact name. When two lines share a name, write the line\'s component, a colon and the name: "To serve: Rice".',
      ),
    durationMinutes: minutes().describe(
      "How long the step takes, when the recipe says or clearly implies it.",
    ),
    durationMaxMinutes: minutes().describe(
      "The upper end when the time is a range; otherwise null.",
    ),
    temperatureC: z
      .number({ error: "Enter a number." })
      .min(-40, "Use a temperature from -40 to 350 °C.")
      .max(350, "Use a temperature from -40 to 350 °C.")
      .nullable()
      .default(null)
      .describe("The heat in °C, when the recipe gives one."),
    equipment: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Name the equipment, or remove it.")
          .max(80, "Keep each piece of equipment under 80 characters."),
      )
      .max(10, "List at most 10 pieces of equipment for a step.")
      .default([])
      .describe("The equipment the step needs, when the recipe names it."),
    note: nullableText(500).describe("A short practical tip for this step."),
  })
  .superRefine((step, ctx) => {
    if (step.durationMaxMinutes === null) return;
    if (step.durationMinutes === null) {
      ctx.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "A time range needs its shorter time in durationMinutes.",
      });
    } else if (step.durationMaxMinutes < step.durationMinutes) {
      ctx.addIssue({
        code: "custom",
        path: ["durationMaxMinutes"],
        message: "The longer time cannot be below the shorter one.",
      });
    }
  });
export type RecipeStep = z.infer<typeof RecipeStep>;

export const RecipeNote = z.object({
  kind: RecipeNoteKind.describe(
    "What kind of practical note: a warning, a substitution, a make-ahead idea, and so on.",
  ),
  title: nullableText(120).describe("A few words, or null."),
  body: z
    .string()
    .trim()
    .min(1, "Write the note, or remove it.")
    .max(2_000, "Keep a note under 2000 characters.")
    .describe("The note itself."),
});
export type RecipeNote = z.infer<typeof RecipeNote>;

// --- Which line a step means --------------------------------------------------

const lower = (text: string) => text.trim().toLowerCase();

/**
 * Split a `uses` name that names a component: "To serve: Rice" gives
 * { component: "To serve", name: "Rice" }. The split is on the LAST colon, as
 * in Noble Notations (splitQualifiedUse): a component is free text and may end
 * in one ("For the boil:"), and an ingredient name holds none. Null for a bare
 * name.
 */
export function splitQualifiedUse(
  used: string,
): { component: string; name: string } | null {
  const trimmed = used.trim();
  const colon = trimmed.lastIndexOf(":");
  if (colon < 0) return null;
  const component = trimmed.slice(0, colon).trim();
  const name = trimmed.slice(colon + 1).trim();
  if (!component || !name) return null;
  return { component, name };
}

type LineRef = Pick<RecipeLine, "component" | "name">;

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

/**
 * The line a step's `uses` name points at, or why it points at none. A bare
 * name that fits exactly one line resolves to it; otherwise the name is read
 * as "Component: Name". `stepNumber` (1-based) starts the sentence.
 */
export function resolveUse(
  lines: readonly LineRef[],
  used: string,
  stepNumber?: number,
): number | { error: string } {
  const subject =
    stepNumber === undefined
      ? `"${used.trim()}"`
      : `Step ${stepNumber} uses "${used.trim()}"`;
  const bare: number[] = [];
  lines.forEach((line, i) => {
    if (lower(line.name) === lower(used)) bare.push(i);
  });
  if (bare.length === 1) return bare[0]!;

  if (bare.length > 1) {
    // Offer the spelling of each line a component tells apart.
    const spellings = bare
      .map((i) => lines[i]!)
      .filter(
        (line) =>
          line.component &&
          !line.name.includes(":") &&
          bare.filter(
            (j) => lower(lines[j]!.component ?? "") === lower(line.component!),
          ).length === 1,
      )
      .map((line) => `"${line.component!.trim()}: ${line.name.trim()}"`);
    const fix =
      spellings.length === 0
        ? " Give each of those lines a component, and write it in front of the name."
        : ` Write ${spellings.join(" or ")}.` +
          (spellings.length < bare.length
            ? " Give the other line a component to point at it."
            : "");
    return {
      error: `${subject}, which fits ${countWord(bare.length)} lines.${fix}`,
    };
  }

  const qualifier = splitQualifiedUse(used);
  if (qualifier) {
    const matches: number[] = [];
    lines.forEach((line, i) => {
      if (
        line.component &&
        lower(line.component) === lower(qualifier.component) &&
        lower(line.name) === lower(qualifier.name)
      ) {
        matches.push(i);
      }
    });
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      return {
        error: `${subject}, which fits ${countWord(matches.length)} lines. Two lines cannot share a component and a name.`,
      };
    }
    const components = [
      ...new Map(
        lines
          .filter((l) => l.component?.trim())
          .map((l) => [lower(l.component!), l.component!.trim()]),
      ).values(),
    ];
    const known =
      components.length === 0
        ? "No line has a component. Write the name alone."
        : `The components are: ${components.join(", ")}. Write one of those, or the name alone.`;
    return {
      error: `${subject}. No line has the component "${qualifier.component}" with the name "${qualifier.name}". ${known}`,
    };
  }

  return {
    error: `${subject}, which is not in the ingredient list. Add it to the ingredients, or take it out of the step.`,
  };
}

/**
 * How a step names line `index`: its bare name, or "Component: Name" when
 * another line shares the name and this one has a component.
 */
export function useLabel(lines: readonly LineRef[], index: number): string {
  const line = lines[index];
  if (!line) return "";
  const shared = lines.some(
    (other, i) => i !== index && lower(other.name) === lower(line.name),
  );
  return shared && line.component?.trim()
    ? `${line.component.trim()}: ${line.name.trim()}`
    : line.name.trim();
}

function checkRecipe(
  recipe: {
    ingredients: readonly LineRef[];
    steps: readonly { uses: readonly string[] }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seen = new Map<string, number>();
  recipe.ingredients.forEach((line, i) => {
    const key = `${lower(line.component ?? "")}\u0000${lower(line.name)}`;
    const first = seen.get(key);
    if (first !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ingredients", i, "name"],
        message: `Ingredient ${i + 1} repeats ingredient ${first + 1} ("${useLabel(recipe.ingredients, first)}"). Join the two lines, or give one a different component.`,
      });
    } else {
      seen.set(key, i);
    }
  });
  recipe.steps.forEach((step, s) => {
    step.uses.forEach((used, u) => {
      const resolved = resolveUse(recipe.ingredients, used, s + 1);
      if (typeof resolved !== "number") {
        ctx.addIssue({
          code: "custom",
          path: ["steps", s, "uses", u],
          message: resolved.error,
        });
      }
    });
  });
}

/** One version of a recipe: the whole recipe, for exactly `plates` plates. */
export const KitchenRecipe = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the recipe a name.")
      .max(120, "Keep the name under 120 characters.")
      .describe("The dish's name, as a cook would say it."),
    summary: nullableText(600).describe(
      "One or two sentences on what the dish is. Null when there is nothing to say.",
    ),
    plates: PlateCount.describe(
      "The number of plates every amount in the recipe is for.",
    ),
    totalTimeMinutes: minutes().describe(
      "From the first step to the plate, when the recipe says or clearly implies it.",
    ),
    activeTimeMinutes: minutes().describe(
      "The hands-on part of the total time, when known.",
    ),
    ingredients: z
      .array(RecipeLine)
      .min(1, "Add at least one ingredient.")
      .max(80, "A recipe can have at most 80 ingredient lines.")
      .describe("Every ingredient line, in the order the recipe lists them."),
    steps: z
      .array(RecipeStep)
      .min(1, "Add at least one step.")
      .max(60, "A recipe can have at most 60 steps.")
      .describe("The method, one instruction per step, in cooking order."),
    notes: z
      .array(RecipeNote)
      .max(20, "A recipe can have at most 20 notes.")
      .default([])
      .describe(
        "Practical notes for the cook, shown under the recipe: warnings, substitutions, make-ahead tips. No food science.",
      ),
  })
  .superRefine(checkRecipe);
export type KitchenRecipe = z.infer<typeof KitchenRecipe>;
export type KitchenRecipeInput = z.input<typeof KitchenRecipe>;

/** What changed from the pasted text, and what Claude had to guess. */
export const DraftReport = z.object({
  changed: z
    .array(z.string().trim().min(1).max(300))
    .max(30)
    .describe("Short lines on what was changed from the original, and why."),
  unsure: z
    .array(z.string().trim().min(1).max(300))
    .max(30)
    .describe("Short lines on every amount or detail that was guessed."),
});
export type DraftReport = z.infer<typeof DraftReport>;

/** What Claude answers when it turns pasted text into a recipe. */
export const RecipeDraft = z.object({
  recipe: KitchenRecipe,
  report: DraftReport,
});
export type RecipeDraft = z.infer<typeof RecipeDraft>;

// --- A recipe proofread for another number of plates ------------------------
// Food does not scale by multiplying, so each plate count is proofread on its
// own and stored (recipe_plate_counts). The lines keep the recipe's order and
// names; only the amounts, units and notes change.

export const PlateLine = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("The line's name, as the recipe has it."),
  quantity: z
    .number()
    .nonnegative()
    .max(100_000)
    .nullable()
    .describe(
      "The amount for the plates asked for, in `unit`. The lower end of a range. Null when the recipe gives none.",
    ),
  quantityMax: z
    .number()
    .nonnegative()
    .max(100_000)
    .nullable()
    .describe("The upper end when the amount is a range; otherwise null."),
  unit: RecipeLineUnit.nullable().describe(
    "The line's unit, or a bigger one that reads better (1200 g as 1.2 kg).",
  ),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .describe(
      'Something the cook must know at this count, such as "3 x 400 ml tins"; otherwise null.',
    ),
});
export type PlateLine = z.infer<typeof PlateLine>;

export const PlateProofread = z.object({
  lines: z
    .array(PlateLine)
    .min(1)
    .max(80)
    .describe(
      "One line per ingredient line of the recipe, in the same order, with the same name.",
    ),
  /** How many pots the count needs, when the kitchen's size is known. */
  pots: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullable()
    .describe(
      "How many of the kitchen's largest pots this count needs; null when the pot size is unknown.",
    ),
  notes: z
    .array(z.string().trim().min(1).max(300))
    .max(6)
    .describe(
      "At most 6 short, practical notes for this count. No food science.",
    ),
  report: DraftReport,
});
export type PlateProofread = z.infer<typeof PlateProofread>;

/**
 * Why a plate-count answer does not fit the recipe, or null when it does: the
 * same number of lines, in the same order, with the same names.
 */
export function checkPlateLines(
  recipe: Pick<KitchenRecipe, "ingredients">,
  result: Pick<PlateProofread, "lines">,
): string | null {
  const want = recipe.ingredients;
  const got = result.lines;
  if (got.length !== want.length) {
    return `The answer has ${got.length} ingredient line${got.length === 1 ? "" : "s"}, and the recipe has ${want.length}.`;
  }
  for (let i = 0; i < want.length; i += 1) {
    if (lower(got[i]!.name) !== lower(want[i]!.name)) {
      return `Line ${i + 1} should be "${want[i]!.name}", not "${got[i]!.name}".`;
    }
  }
  return null;
}

/**
 * A name for pasted text: its first non-empty line, with markdown marks
 * (headings, bullets, bold, links) stripped, at most 120 characters. Empty
 * when the text has no words.
 */
export function titleFromText(text: string): string {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*(?:#{1,6}\s*|>\s*|[-*+]\s+|\d+[.)]\s+)*/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|\*|_|`|~~)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line) return line.slice(0, 120).trim();
  }
  return "";
}

// --- What people type ------------------------------------------------------

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const RowId = z.guid();

/** A blank form field is no answer, not an empty string. */
const optionalText = (max: number, message?: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, message).optional(),
  );

export const RECIPE_TEXT_MAX = 20_000;

/** A recipe link. Only https: the server never fetches it, but people open it. */
export const RecipeUrl = z.url({
  protocol: /^https$/,
  error: "Use a link that starts with https://.",
});

/** Text that is only a link: the server never opens links, so it is no recipe. */
export const LINK_ONLY_TEXT = /^\s*https?:\/\/\S+\s*$/i;

export const SuggestRecipeInput = z.object({
  /** Optional: a blank name takes the text's first line. */
  title: optionalText(120, "Keep the name under 120 characters."),
  /** The pasted recipe, or the transcript of a dictated one. */
  text: z
    .string({ error: "Paste the recipe." })
    .trim()
    .min(1, "Paste the recipe.")
    .max(
      RECIPE_TEXT_MAX,
      `Keep the recipe under ${RECIPE_TEXT_MAX} characters.`,
    )
    .refine(
      (text) => !LINK_ONLY_TEXT.test(text),
      "Paste the recipe itself. Claude does not open links, so put the link in the link box.",
    ),
  source: z.enum(["text", "voice"]),
  /** Where the recipe came from, kept for reference. Never opened. */
  url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    RecipeUrl.max(2_000).optional(),
  ),
  /** Why it suits the camp. Never sent to Anthropic. */
  suitabilityNote: optionalText(1_000, "Keep the note under 1000 characters."),
  /**
   * The submitter agreed that a captain or a Kitchen lead may send this text
   * to Claude.
   */
  aiConsent: z.boolean(),
});
export type SuggestRecipeInput = z.infer<typeof SuggestRecipeInput>;

/** The submitter's edit after a reviewer asked for changes. */
export const ResubmitRecipeInput = z.object({
  recipeId: RowId,
  title: z.string().trim().min(1, "Give the recipe a name.").max(120),
  text: optionalText(
    RECIPE_TEXT_MAX,
    `Keep the recipe under ${RECIPE_TEXT_MAX} characters.`,
  ),
  /** Why it suits the camp. Never sent to Anthropic. */
  suitabilityNote: optionalText(1_000, "Keep the note under 1000 characters."),
  /**
   * The submitter agrees again that a captain or a Kitchen lead may send
   * this text to Claude.
   * New words need a new tick: an earlier one (or a reviewer's retype) does
   * not cover them.
   */
  aiConsent: z.boolean(),
});
export type ResubmitRecipeInput = z.infer<typeof ResubmitRecipeInput>;

/** A Kitchen lead or a captain retypes (or pastes in) the working text. */
export const RetypeRecipeTextInput = z.object({
  recipeId: RowId,
  text: z
    .string()
    .trim()
    .min(1, "Paste the recipe text.")
    .max(
      RECIPE_TEXT_MAX,
      `Keep the recipe under ${RECIPE_TEXT_MAX} characters.`,
    ),
});
export type RetypeRecipeTextInput = z.infer<typeof RetypeRecipeTextInput>;

/** A variation of an accepted recipe, such as a gluten-free one. */
export const StartVariationInput = z.object({
  recipeId: RowId,
  title: z.string().trim().min(1, "Give the variation a name.").max(120),
});
export type StartVariationInput = z.infer<typeof StartVariationInput>;

export const RECIPE_LESSON_MAX = 2_000;

/** What the cooks learned making a recipe. */
export const AddLessonInput = z.object({
  recipeId: RowId,
  body: z
    .string()
    .trim()
    .min(1, "Write what the kitchen learned.")
    .max(
      RECIPE_LESSON_MAX,
      `Keep the lesson under ${RECIPE_LESSON_MAX} characters.`,
    ),
});
export type AddLessonInput = z.infer<typeof AddLessonInput>;

/** A Kitchen lead's or a captain's decision on a suggestion. */
export const DecideRecipeInput = z.discriminatedUnion("decision", [
  z.object({ recipeId: RowId, decision: z.literal("approve") }),
  z.object({
    recipeId: RowId,
    decision: z.literal("reject"),
    reason: z.string().trim().min(1, "Say why it is rejected.").max(500),
  }),
  z.object({
    recipeId: RowId,
    decision: z.literal("request_changes"),
    note: z.string().trim().min(1, "Say what should change.").max(1_000),
  }),
]);
export type DecideRecipeInput = z.infer<typeof DecideRecipeInput>;

/** The most recipes one press of Run proofreading can send. */
export const MAX_PROOFREAD_BATCH = 10;

export const QueueProofreadInput = z.object({
  recipeIds: z
    .array(RowId)
    .min(1, "Pick a recipe to proofread.")
    .max(
      MAX_PROOFREAD_BATCH,
      `Proofread at most ${MAX_PROOFREAD_BATCH} recipes at a time.`,
    )
    .refine(
      (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
      "Each recipe can be picked once.",
    ),
  /** The captain's note for a re-run, sent to Claude with the text. */
  note: optionalText(1_000, "Keep the note under 1000 characters."),
  /** The plates Claude writes the recipe for. */
  plates: PlateCount,
});
export type QueueProofreadInput = z.infer<typeof QueueProofreadInput>;

/**
 * A Kitchen lead asks a captain to run proofreading again, saying what should
 * change. It costs nothing; a captain decides whether to run it.
 */
export const RequestRerunInput = z.object({
  recipeId: RowId,
  note: z
    .string()
    .trim()
    .min(1, "Say what Claude should do differently.")
    .max(1_000, "Keep the note under 1000 characters."),
});
export type RequestRerunInput = z.infer<typeof RequestRerunInput>;

/**
 * Accepting the recipe an older run wrote, exactly as it wrote it. There is
 * no recipe in it: nobody edits the structured recipe by hand, so the write
 * reads the draft from the run itself, and a recipe sent from the browser is
 * dropped.
 */
export const AcceptProofreadInput = z.object({
  recipeId: RowId,
  runId: RowId,
  /** Why it is accepted as it is; defaults on the server. */
  reason: optionalText(500, "Keep the reason under 500 characters."),
});
export type AcceptProofreadInput = z.infer<typeof AcceptProofreadInput>;

/**
 * A captain asks Claude to proofread an accepted version for another number
 * of plates. A count that already has a result is not run again unless
 * `rerun` says so.
 */
export const QueuePlateProofreadInput = z.object({
  recipeId: RowId,
  versionId: RowId,
  plates: PlateCount,
  rerun: z.boolean().default(false),
});
export type QueuePlateProofreadInput = z.infer<typeof QueuePlateProofreadInput>;

/** The kitchen's camp settings, and the bounds the database also holds. */
export const KITCHEN_SETTING_LIMITS = {
  recipeProofreadDailyCap: { min: 0, max: 50, default: 5 },
  kitchenLargestPotLitres: { min: 1, max: 500 },
  kitchenBurnerCount: { min: 1, max: 20 },
  kitchenPlatesBreakfast: { min: 1, max: MAX_PLATES },
  kitchenPlatesLunch: { min: 1, max: MAX_PLATES },
  kitchenPlatesDinner: { min: 1, max: MAX_PLATES },
} as const;

const L = KITCHEN_SETTING_LIMITS;

export const KitchenSettingsInput = z.object({
  /**
   * Proofreading runs a day; 0 turns proofreading off. A silent cost guard:
   * no screen shows or sets it, so Camp settings leaves it out and the write
   * keeps the stored value when it is absent.
   */
  recipeProofreadDailyCap: z
    .number()
    .int()
    .min(L.recipeProofreadDailyCap.min, "The daily limit cannot be below 0.")
    .max(
      L.recipeProofreadDailyCap.max,
      `The daily limit is at most ${L.recipeProofreadDailyCap.max}.`,
    )
    .optional(),
  kitchenLargestPotLitres: z
    .number()
    .int()
    .min(L.kitchenLargestPotLitres.min, "A pot holds at least 1 litre.")
    .max(
      L.kitchenLargestPotLitres.max,
      `A pot holds at most ${L.kitchenLargestPotLitres.max} litres.`,
    )
    .nullable(),
  kitchenBurnerCount: z
    .number()
    .int()
    .min(L.kitchenBurnerCount.min, "Count at least 1 burner.")
    .max(
      L.kitchenBurnerCount.max,
      `Count at most ${L.kitchenBurnerCount.max} burners.`,
    )
    .nullable(),
  /** Plates at each meal; mornings usually feed more than evenings. */
  kitchenPlatesBreakfast: PlateCount.nullable(),
  kitchenPlatesLunch: PlateCount.nullable(),
  kitchenPlatesDinner: PlateCount.nullable(),
});
export type KitchenSettingsInput = z.infer<typeof KitchenSettingsInput>;

// --- Legacy ----------------------------------------------------------------
// The first recipe design (the normalisation prompt and recipes.normalised).
// Kept because recipeNormalisationPrompt still names NormalisedRecipe.

export const Ingredient = z.object({
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  aisle: z.string().optional(),
});

export const NormalisedRecipe = z.object({
  title: z.string(),
  servings: z.number().int().positive(),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  dietaryTags: z.array(DietaryTag),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  complementaryDishes: z.array(z.string()).default([]),
});
export type NormalisedRecipe = z.infer<typeof NormalisedRecipe>;
