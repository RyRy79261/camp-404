import { z } from "zod";
import { DraftReport, KitchenRecipe, PlateCount } from "./recipe";

// A recipe's source (#243, Kitchen): the text a Kitchen lead or a captain
// edits and sends to Claude, kept as versions in recipe_sources. It is stored
// as Tiptap JSON, one document per section (ingredients, equipment, steps,
// notes). Markdown is only a typing shortcut in the editor: Claude receives
// Markdown-like text built from the JSON (sourceText in @camp404/core).
//
// The editor offers paragraphs, three heading levels, bullet and numbered
// lists, bold, italic and line breaks. The server accepts exactly those and
// refuses any other node or mark, so a pasted table or a crafted request
// cannot store something the editor would not draw.

/** A mark on a piece of text: bold or italic, nothing else. */
export type SourceMark = { type: "bold" | "italic" };

export type SourceText = {
  type: "text";
  text: string;
  marks?: SourceMark[];
};
export type SourceHardBreak = { type: "hardBreak" };
export type SourceInline = SourceText | SourceHardBreak;

export type SourceParagraph = { type: "paragraph"; content?: SourceInline[] };
export type SourceHeading = {
  type: "heading";
  attrs: { level: 1 | 2 | 3 };
  content?: SourceInline[];
};
export type SourceListItem = { type: "listItem"; content?: SourceBlock[] };
export type SourceBulletList = {
  type: "bulletList";
  content?: SourceListItem[];
};
export type SourceOrderedList = {
  type: "orderedList";
  attrs?: { start?: number };
  content?: SourceListItem[];
};
export type SourceBlock =
  | SourceParagraph
  | SourceHeading
  | SourceBulletList
  | SourceOrderedList;
export type SourceDoc = { type: "doc"; content?: SourceBlock[] };

/** The most characters one section may take as JSON. */
export const SOURCE_SECTION_MAX = 100_000;

// z.object strips keys it does not name, so an attribute the editor adds
// (orderedList's `type`, a mark's attrs) is dropped rather than stored.
const Mark: z.ZodType<SourceMark> = z.object({
  type: z.enum(["bold", "italic"]),
});

const Inline: z.ZodType<SourceInline> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().min(1),
    marks: z.array(Mark).max(2).optional(),
  }),
  z.object({ type: z.literal("hardBreak") }),
]);

const Block: z.ZodType<SourceBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("paragraph"),
      content: z.array(Inline).optional(),
    }),
    z.object({
      type: z.literal("heading"),
      attrs: z.object({
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
      content: z.array(Inline).optional(),
    }),
    z.object({
      type: z.literal("bulletList"),
      content: z.array(ListItem).optional(),
    }),
    z.object({
      type: z.literal("orderedList"),
      attrs: z
        .object({ start: z.number().int().min(0).max(10_000).optional() })
        .optional(),
      content: z.array(ListItem).optional(),
    }),
  ]),
);

const ListItem: z.ZodType<SourceListItem> = z.lazy(() =>
  z.object({
    type: z.literal("listItem"),
    content: z.array(Block).optional(),
  }),
);

/** One section of a recipe's source, as a Tiptap document. */
export const SourceDoc: z.ZodType<SourceDoc> = z
  .object({
    type: z.literal("doc"),
    content: z.array(Block).optional(),
  })
  .refine(
    (doc) => JSON.stringify(doc).length <= SOURCE_SECTION_MAX,
    "This section is too long. Split the recipe, or cut some text.",
  );

/** The sections of a source, in the order the editor and Claude read them. */
export const SOURCE_SECTIONS = [
  "ingredients",
  "equipment",
  "steps",
  "notes",
] as const;
export type SourceSection = (typeof SOURCE_SECTIONS)[number];

export const RecipeSourceSections = z.object({
  ingredients: SourceDoc,
  equipment: SourceDoc,
  steps: SourceDoc,
  notes: SourceDoc,
});
export type RecipeSourceSections = z.infer<typeof RecipeSourceSections>;

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const RowId = z.guid();

/**
 * "Send for proofreading": the source as the editor holds it. The server
 * saves a new version when it differs from `basedOnSourceId`'s, then queues
 * the run, in one transaction.
 */
export const SendSourceInput = z.object({
  recipeId: RowId,
  /** The version the editor opened; null when the recipe had none. */
  basedOnSourceId: RowId.nullable(),
  /** How many the source says it serves; null when it does not say. */
  serves: PlateCount.nullable(),
  sections: RecipeSourceSections,
});
export type SendSourceInput = z.infer<typeof SendSourceInput>;

export const PROOFREAD_ANSWER_MAX = 2_000;

/** A reviewer's answer to the questions Claude asked about a source. */
export const AnswerQuestionsInput = z.object({
  recipeId: RowId,
  runId: RowId,
  answer: z
    .string({ error: "Write your answer." })
    .trim()
    .min(1, "Write your answer.")
    .max(
      PROOFREAD_ANSWER_MAX,
      `Keep the answer under ${PROOFREAD_ANSWER_MAX} characters.`,
    ),
});
export type AnswerQuestionsInput = z.infer<typeof AnswerQuestionsInput>;

/** The longest "What should change?" an adjust run carries to Claude. */
export const ADJUST_INSTRUCTION_MAX = 2_000;
export const ADJUST_INSTRUCTION_NEEDED = "Say what should change.";
export const ADJUST_INSTRUCTION_TOO_LONG = `Keep it under ${ADJUST_INSTRUCTION_MAX} characters.`;

/**
 * "Adjust with Claude": Claude writes the recipe's next version from one of
 * its versions (`versionId`) and what the reviewer says should change.
 */
export const AdjustVersionInput = z.object({
  recipeId: RowId,
  versionId: RowId,
  instruction: z
    .string({ error: ADJUST_INSTRUCTION_NEEDED })
    .trim()
    .min(1, ADJUST_INSTRUCTION_NEEDED)
    .max(ADJUST_INSTRUCTION_MAX, ADJUST_INSTRUCTION_TOO_LONG),
});
export type AdjustVersionInput = z.infer<typeof AdjustVersionInput>;

/** Every round of questions and answers a run carries to Claude, in order. */
export const ProofreadExchange = z.array(
  z.object({
    questions: z.array(z.string()),
    answer: z.string(),
  }),
);
export type ProofreadExchange = z.infer<typeof ProofreadExchange>;

/**
 * What Claude answers when it proofreads a source: either the questions it
 * needs answered first, or the recipe with a report and notes on how it was
 * scaled. One object, because a tool's input schema must be an object.
 */
export const SourceProofread = z
  .object({
    needsInfo: z
      .boolean()
      .describe(
        "True when the source leaves out something you cannot safely guess, such as an amount for the whole dish or what an ingredient is. Then ask, and write no recipe.",
      ),
    questions: z
      .array(z.string().trim().min(1).max(300))
      .max(5)
      .default([])
      .describe(
        "When needsInfo is true: at most 5 short, plain questions for the Kitchen lead, one thing each. Empty otherwise.",
      ),
    recipe: KitchenRecipe.nullable()
      .default(null)
      .describe(
        "When needsInfo is false: the whole recipe, written for the plates asked for. Null when you ask questions.",
      ),
    report: DraftReport.nullable()
      .default(null)
      .describe(
        "When needsInfo is false: what you changed from the source, and what you had to guess. Null when you ask questions.",
      ),
    scalingNotes: z
      .array(z.string().trim().min(1).max(500))
      .max(12)
      .default([])
      .describe(
        "When needsInfo is false: at least one short line on how the recipe was scaled from what the source serves to the plates asked for, for the cooks to read.",
      ),
  })
  .superRefine((answer, ctx) => {
    if (answer.needsInfo) {
      if (answer.questions.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["questions"],
          message: "Ask at least one question, or write the recipe.",
        });
      }
      if (answer.recipe !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["recipe"],
          message: "Write no recipe while you ask questions.",
        });
      }
      return;
    }
    if (answer.recipe === null) {
      ctx.addIssue({
        code: "custom",
        path: ["recipe"],
        message: "Write the recipe, or ask a question.",
      });
    }
    if (answer.report === null) {
      ctx.addIssue({
        code: "custom",
        path: ["report"],
        message: "Say what changed and what was guessed.",
      });
    }
    if (answer.scalingNotes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["scalingNotes"],
        message: "Say at least once how the recipe was scaled.",
      });
    }
  });
export type SourceProofread = z.infer<typeof SourceProofread>;
export type SourceProofreadInput = z.input<typeof SourceProofread>;
