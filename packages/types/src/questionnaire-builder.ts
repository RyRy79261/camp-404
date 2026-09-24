import { z } from "zod";
import {
  attendedYearOptions,
  DividerBlock,
  ExplainerBlock,
  HeaderBreakBlock,
  OTHER_PREFIX,
  Question,
  QuestionnaireResponses,
  type QuestionnaireResponseValue,
  VisibleIf,
  validateOne,
} from "./questionnaire";
import {
  hasParticipationOptions,
  participationOptionsMessage,
} from "./builder-roles";

// --- In-app questionnaire builder model ----------------------------------
// A BuilderQuestionnaire is the shape Camp 404's in-app builder authors and
// stores whole as JSONB (`questionnaire_definitions` / `questionnaire_versions`
// rows, which are never rewritten). A page holds an ordered list of Blocks; a
// block is either an input field (wrapping the shared `Question`) or a
// display-only content block. The loader discriminates the two stored
// definition shapes by `'blocks' in pages[0]`.
//
// It is a separate top-level type from the unified `Questionnaire`
// (./questionnaire), and converts into it losslessly: `fromBuilderQuestionnaire`
// and `parseStoredDefinition` in ./questionnaire-legacy.

// Optional per-field/per-page visibility rule (conditional branching): the
// `VisibleIf` grammar, which lives with the unified model in ./questionnaire
// (where questions, pages and content blocks carry it too). Operator
// applicability + value typing is documented in §2.1.
const visibility = { visibleIf: VisibleIf.optional() };

// --- What a builder question may be ---------------------------------------
// The shared `Question` grew into the unified model (AB's kinds and fields
// beside Camp 404's). The builder's STORED shape did not: its renderer, palette
// and publish checks know Camp 404's fourteen kinds and fields, and rows
// already in `questionnaire_definitions` hold nothing else. So a builder
// question parses exactly as it did before the model grew:
//
//   * a kind outside BUILDER_QUESTION_KINDS is refused, as the old union
//     refused it — never stored, so never rendered as a blank card;
//   * a numeric text format (`number` / `integer`) is refused, as the old
//     `TextFormat` enum refused it;
//   * a field only the unified model knows (AB's display modes, "Other…" label,
//     shuffles, selection and length bounds, option images and `goTo`, and a
//     question-level `visibleIf`, which in this shape belongs on the block) is
//     stripped, as zod stripped it when the schema did not declare it.
//
// Converting to the unified model is `fromBuilderQuestionnaire`
// (./questionnaire-legacy).

/** The question kinds a builder definition holds. */
export const BUILDER_QUESTION_KINDS = [
  "slider",
  "number",
  "single_select",
  "multi_select",
  "short_text",
  "long_text",
  "date",
  "scale",
  "toggle",
  "combobox",
  "image",
  "boolean",
  "email",
  "phone",
] as const satisfies readonly Question["kind"][];
export type BuilderQuestionKind = (typeof BUILDER_QUESTION_KINDS)[number];

export function isBuilderQuestionKind(
  kind: string,
): kind is BuilderQuestionKind {
  return (BUILDER_QUESTION_KINDS as readonly string[]).includes(kind);
}

function omitKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const out = { ...value };
  for (const key of keys) delete out[key];
  return out;
}

/** A parsed question reduced to the fields the builder shape declares. */
function toBuilderFields(q: Question): Question {
  switch (q.kind) {
    case "single_select":
      return {
        ...omitKeys(q, [
          "visibleIf",
          "display",
          "otherLabel",
          "shuffleOptions",
        ]),
        options: q.options.map(({ value, label }) => ({ value, label })),
      };
    case "multi_select":
      return {
        ...omitKeys(q, [
          "visibleIf",
          "display",
          "otherLabel",
          "shuffleOptions",
          "minSelections",
          "maxSelections",
        ]),
        options: q.options.map(({ value, label }) => ({ value, label })),
      };
    case "short_text":
      return omitKeys(q, ["visibleIf", "minLength", "min", "max"]);
    case "long_text":
      return omitKeys(q, ["visibleIf", "minLength"]);
    default:
      return omitKeys(q, ["visibleIf"]) as Question;
  }
}

export const BuilderQuestion = Question.refine(
  (q) => isBuilderQuestionKind(q.kind),
  { message: "This kind of question can't be used in the builder" },
)
  .refine(
    (q) =>
      q.kind !== "short_text" ||
      (q.format !== "number" && q.format !== "integer"),
    { message: "This text format can't be used in the builder" },
  )
  .transform(toBuilderFields);

// A question rendered to the respondent — wraps the shared `Question`. The
// block discriminant is `kind: "question"`; the wrapped `question.kind` is
// nested, so it never collides with the content-block kinds.
export const QuestionBlock = z.object({
  kind: z.literal("question"),
  question: BuilderQuestion,
  ...visibility,
});
export type QuestionBlock = z.infer<typeof QuestionBlock>;

// `HeaderBreakBlock`, `ExplainerBlock` and `DividerBlock` are the unified
// model's (./questionnaire): the same shapes, shared rather than duplicated.
// The image block differs from the unified `ImageBlock` (`imageUrl`/`altText`
// and a required `sizeFit` here; `url`/`alt` there), so the builder keeps its
// own under a builder-prefixed name. `fromBuilderQuestionnaire`
// (./questionnaire-legacy) maps one onto the other.

export const BuilderImageBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("image_block"),
  // May be empty while drafting; publish requires an allowed URL
  // (isAllowedBuilderImageUrl, checked in validateBuilderQuestionnaire).
  imageUrl: z.string(),
  caption: z.string().optional(),
  // Required for accessibility (enforced again at publish).
  altText: z.string(),
  sizeFit: z.enum(["fit", "fill", "full-width"]),
  ...visibility,
});
export type BuilderImageBlock = z.infer<typeof BuilderImageBlock>;

export const BuilderContentBlock = z.discriminatedUnion("kind", [
  HeaderBreakBlock,
  ExplainerBlock,
  BuilderImageBlock,
  DividerBlock,
]);
export type BuilderContentBlock = z.infer<typeof BuilderContentBlock>;

export const Block = z.discriminatedUnion("kind", [
  QuestionBlock,
  HeaderBreakBlock,
  ExplainerBlock,
  BuilderImageBlock,
  DividerBlock,
]);
export type Block = z.infer<typeof Block>;

export const BuilderPage = z.object({
  id: z.string().min(1),
  // Declarative label affecting respondent chrome/progress copy. Input fields
  // may only live on a "question" page (enforced at publish).
  type: z.enum(["question", "content"]),
  title: z.string(),
  intro: z.string().optional(),
  // Absent ⇒ false. On a content page = "must press Continue".
  requiredToContinue: z.boolean().optional(),
  blocks: z.array(Block),
  ...visibility,
});
export type BuilderPage = z.infer<typeof BuilderPage>;

export const BuilderQuestionnaire = z.object({
  version: z.string().min(1),
  title: z.string(),
  pages: z.array(BuilderPage).min(1),
});
export type BuilderQuestionnaire = z.infer<typeof BuilderQuestionnaire>;

// Heuristic that tells a stored builder definition from a legacy one at read
// time (the loader uses this before parsing). Builder pages carry `blocks`;
// legacy pages carry `questions`/`kind`.
export function isBuilderDefinition(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const pages = (value as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return false;
  const first = pages[0];
  return (
    typeof first === "object" && first !== null && "blocks" in (first as object)
  );
}

// --- Shared helpers ------------------------------------------------------

/** The wrapped questions on a page, in order (content blocks excluded). */
export function getQuestionBlocks(page: BuilderPage): Question[] {
  const out: Question[] = [];
  for (const block of page.blocks) {
    if (block.kind === "question") out.push(block.question);
  }
  return out;
}

/** Every input field in the questionnaire, in document order. */
export function flattenBuilderQuestions(q: BuilderQuestionnaire): Question[] {
  return q.pages.flatMap(getQuestionBlocks);
}

function isEmpty(v: QuestionnaireResponseValue | undefined): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  // A grid answer ({ rowId: columnValue[] }) is empty when no row has a pick.
  if (typeof v === "object") {
    return !Object.values(v).some((picks) => picks.length > 0);
  }
  return false;
}

/**
 * Evaluate a visibility condition against a response map. An unanswered
 * referenced field makes a comparison evaluate false (hide), except the
 * answeredness operators. Used by both the runner and the validator so they
 * agree on what is shown.
 */
export function evalVisibleIf(
  cond: VisibleIf,
  responses: QuestionnaireResponses,
): boolean {
  const v = responses[cond.fieldId];
  switch (cond.op) {
    case "is_answered":
      return !isEmpty(v);
    case "is_empty":
      return isEmpty(v);
    default:
      break;
  }
  if (isEmpty(v)) return false;
  switch (cond.op) {
    case "eq":
      return v === cond.value;
    case "ne":
      return v !== cond.value;
    case "gt":
      return typeof v === "number" && v > Number(cond.value);
    case "gte":
      return typeof v === "number" && v >= Number(cond.value);
    case "lt":
      return typeof v === "number" && v < Number(cond.value);
    case "lte":
      return typeof v === "number" && v <= Number(cond.value);
    case "includes":
      return Array.isArray(v) && v.includes(cond.value as string);
    case "not_includes":
      return !(Array.isArray(v) && v.includes(cond.value as string));
    default:
      return true;
  }
}

export type VisibleIfOp = VisibleIf["op"];

const ANSWEREDNESS_OPS: readonly VisibleIfOp[] = ["is_answered", "is_empty"];

/**
 * The operators a condition may use on the field it references (spec §2.1).
 * A choice compares against one of the field's option values; a yes/no field
 * against true or false; a number, slider, linear scale or rating against a
 * number; a multi-pick (options or attended years) by what it includes. Any
 * field can be tested for being answered or empty — and that is all a text,
 * date, time, link, image or grid answer offers.
 */
export function visibleIfOpsFor(field: Question): readonly VisibleIfOp[] {
  switch (field.kind) {
    case "single_select":
    case "combobox":
    case "toggle":
    case "scale":
    case "boolean":
      return ["eq", "ne", ...ANSWEREDNESS_OPS];
    case "multi_select":
    case "years":
      return ["includes", "not_includes", ...ANSWEREDNESS_OPS];
    case "number":
    case "slider":
    case "linear_scale":
    case "rating":
      return ["eq", "ne", "gt", "gte", "lt", "lte", ...ANSWEREDNESS_OPS];
    default:
      return ANSWEREDNESS_OPS;
  }
}

/** The option/step values a question offers, or null for the kinds with none. */
export function choiceValues(field: Question): string[] | null {
  if ("options" in field) return field.options.map((o) => o.value);
  if (field.kind === "scale") return field.steps.map((s) => s.value);
  if (field.kind === "years") {
    return attendedYearOptions()
      .filter((option) => !option.disabled)
      .map((option) => String(option.year));
  }
  return null;
}

/** The kinds whose answer is a number a condition can compare against. */
export type NumericAnswerQuestion = Extract<
  Question,
  { kind: "number" | "slider" | "linear_scale" | "rating" }
>;

/**
 * Whether a number is an answer a numeric question can give: inside its range,
 * a whole number for a number row, a linear scale or a rating, and on a step
 * for a slider. A condition on any other number can never match, so the page
 * or block it hides would never show.
 */
export function numberFits(field: NumericAnswerQuestion, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  if (field.kind === "rating") {
    return Number.isInteger(n) && n >= 1 && n <= field.steps;
  }
  if (n < field.min || n > field.max) return false;
  if (field.kind !== "slider") return Number.isInteger(n);
  // Steps count from min. The tolerance absorbs float error such as 0.1 * 3.
  const steps = (n - field.min) / field.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * Why a condition does not fit the field it references, or null when it does:
 * the field must exist, the operator must suit its kind, and the value must be
 * one the field can hold. The builder's editor and the publish check share it.
 */
export function visibleIfProblem(
  cond: VisibleIf,
  field: Question | undefined,
): "missing_field" | "wrong_operator" | "wrong_value" | null {
  if (!field) return "missing_field";
  if (!visibleIfOpsFor(field).includes(cond.op)) return "wrong_operator";
  if (cond.op === "is_answered" || cond.op === "is_empty") return null;
  const v = cond.value;
  if (field.kind === "boolean") {
    return typeof v === "boolean" ? null : "wrong_value";
  }
  const choices = choiceValues(field);
  if (choices) {
    return typeof v === "string" && choices.includes(v) ? null : "wrong_value";
  }
  if (
    field.kind === "number" ||
    field.kind === "slider" ||
    field.kind === "linear_scale" ||
    field.kind === "rating"
  ) {
    return typeof v === "number" && numberFits(field, v) ? null : "wrong_value";
  }
  return "wrong_value";
}

function isVisible(
  visibleIf: VisibleIf | undefined,
  responses: QuestionnaireResponses,
): boolean {
  return visibleIf ? evalVisibleIf(visibleIf, responses) : true;
}

/** The pages a respondent currently sees, given their answers so far. */
export function visiblePages(
  q: BuilderQuestionnaire,
  responses: QuestionnaireResponses,
): BuilderPage[] {
  return q.pages.filter((p) => isVisible(p.visibleIf, responses));
}

/**
 * Validate a response map against a builder questionnaire. Visibility-aware:
 * required checks are skipped for fields hidden by an unmet `visibleIf`, and a
 * hidden field's value is retained if it is a legal answer for that field
 * (never pruned merely for being hidden, never trusted merely for being
 * hidden). Mirrors the legacy `validateResponses` contract; reuses the
 * per-question `validateOne`.
 */
export function validateBuilderResponses(
  q: BuilderQuestionnaire,
  raw: unknown,
):
  | { ok: true; responses: QuestionnaireResponses }
  | { ok: false; errors: Record<string, string> } {
  const parsed = QuestionnaireResponses.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: { _root: "Malformed response payload" } };
  }
  const data = parsed.data;
  const responses: QuestionnaireResponses = {};
  const errors: Record<string, string> = {};

  for (const page of q.pages) {
    const pageVisible = isVisible(page.visibleIf, data);
    for (const block of page.blocks) {
      if (block.kind !== "question") continue;
      const id = block.question.id;
      const hidden = !pageVisible || !isVisible(block.visibleIf, data);
      if (hidden) {
        // Spec §5.1: a hidden field's value is RETAINED (re-showing the field
        // restores what was typed) and never *required*. Retention is not a
        // free pass though — `data` is the CLIENT payload, so without a type
        // check a hand-made request could write arbitrary data under any
        // hidden question's id straight into the responses JSONB. Reuse
        // `validateOne` and keep the value only if it is a legal answer for
        // this field; a failure here is silent (missing ⇒ nothing to retain,
        // invalid ⇒ dropped), never a submit-blocking error.
        const retained = validateOne(block.question, data[id]);
        if (retained.ok && retained.value !== undefined) {
          responses[id] = retained.value;
        }
        continue;
      }
      const result = validateOne(block.question, data[id]);
      if (!result.ok) {
        errors[id] = result.error;
        continue;
      }
      if (result.value !== undefined) responses[id] = result.value;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, responses };
}

// --- Publish-time validity ----------------------------------------------

// Defence-in-depth: duplicates the schema's options.min(2) guarantee on parsed
// input. `toggle` is omitted — it isn't authorable in the builder palette.
const OPTION_KINDS = new Set(["single_select", "multi_select", "combobox"]);

/**
 * Ranges a respondent could never satisfy. Returns member-visible messages.
 * `slider` and `number` are the only kinds carrying a numeric range; both are
 * refused when the maximum is not above the minimum (a slider with nothing to
 * drag, a cell row with a single cell), and a slider is refused when its step
 * strides past the whole range so no value but the minimum is reachable.
 */
function rangeErrors(field: Question): string[] {
  const out: string[] = [];
  if (field.kind !== "slider" && field.kind !== "number") return out;
  if (field.max <= field.min) {
    out.push(
      `"${field.prompt}" needs a maximum above its minimum (currently ${field.min}–${field.max}).`,
    );
    return out;
  }
  if (field.kind === "slider" && field.step > field.max - field.min) {
    out.push(
      `"${field.prompt}" has a step of ${field.step}, larger than its ${field.min}–${field.max} range.`,
    );
  }
  return out;
}

// --- Size limits and image hosts --------------------------------------------
// A definition is stored whole and rendered to every member, and team leads can
// author one too. So the server bounds its size, and only renders images the
// app hosts: a link to any other site would make every member's browser call
// it (a tracking pixel), and it could change after a captain looked at it.

export const BUILDER_LIMITS = {
  /** The questionnaire's own title. */
  titleLength: 200,
  pages: 50,
  blocksPerPage: 100,
  optionsPerQuestion: 100,
  /** Any single piece of authored text: a prompt, an option, an explainer. */
  textLength: 5_000,
  /** The whole definition, as stored JSON, in characters. */
  totalLength: 250_000,
} as const;

// An HTTPS link into a Vercel Blob public store: a subdomain of
// public.blob.vercel-storage.com, no user info, no port, no backslash or space.
// A regex rather than URL: this package is runtime-neutral and has no DOM or
// Node types.
const BLOB_URL =
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.public\.blob\.vercel-storage\.com(\/[^\s\\]*)?$/i;

/**
 * Whether an image block may show this URL to members: an HTTPS link into the
 * app's Vercel Blob store, or a path on the app itself. Anything else is
 * refused.
 */
export function isAllowedBuilderImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    // "//host" and "/\\host" both leave the app in a browser.
    return !trimmed.startsWith("//") && !/[\\\s]/.test(trimmed);
  }
  return BLOB_URL.test(trimmed);
}

const IMAGE_HOST_ERROR = (where: string) =>
  `An image on ${where} links to another website. Only images stored by Camp 404 can be shown.`;

/** A condition's publish blockers, worded for the author. */
function visibleIfErrors(
  cond: VisibleIf,
  earlier: ReadonlyMap<string, Question>,
  where: string,
): Array<{ code: BuilderDefinitionIssueCode; message: string }> {
  const field = earlier.get(cond.fieldId);
  switch (visibleIfProblem(cond, field)) {
    case null:
      return [];
    case "missing_field":
      return [
        {
          code: "dangling_visible_if",
          message: `${where} shows-when references a field that doesn't come before it.`,
        },
      ];
    case "wrong_operator":
      return [
        {
          code: "visible_if_wrong_operator",
          message: `${where} shows-when uses a condition that doesn't fit "${field!.prompt}".`,
        },
      ];
    case "wrong_value":
      return [
        {
          code: "visible_if_wrong_value",
          message: `${where} shows-when compares "${field!.prompt}" with an answer it can't have.`,
        },
      ];
  }
}

/** What is wrong, as a stable code the canvas can act on. */
export type BuilderDefinitionIssueCode =
  | "missing_title"
  | "no_pages"
  | "empty_page"
  | "dangling_visible_if"
  | "visible_if_wrong_operator"
  | "visible_if_wrong_value"
  | "image_alt_missing"
  | "image_missing"
  | "image_host"
  | "input_on_content_page"
  | "duplicate_id"
  | "too_few_options"
  | "duplicate_option_value"
  | "reserved_option_value"
  | "invalid_range"
  | "duplicate_role"
  | "participation_options"
  | "no_inputs"
  | "no_visible_page";

/**
 * One publish blocker, with where it is: the page, and the block (a question
 * block's id is its question's id). Neither is set for a questionnaire-wide
 * problem (no title, no inputs, nothing visible).
 */
export interface BuilderDefinitionIssue {
  code: BuilderDefinitionIssueCode;
  message: string;
  pageId?: string;
  blockId?: string;
}

/**
 * Hard publish blockers (member-visible messages), as a flat list of
 * sentences. See builderQuestionnaireIssues for the same list with codes and
 * locations.
 */
export function validateBuilderQuestionnaire(
  q: BuilderQuestionnaire,
): string[] {
  return builderQuestionnaireIssues(q).map((issue) => issue.message);
}

/**
 * Hard publish blockers, each with a code and the page and block it belongs
 * to, so the builder can show a problem on the block that has it. An empty
 * list means the questionnaire is publishable. Beyond what the Zod schema
 * guarantees: at least one input, no inputs on content pages, unique ids,
 * conditions that fit an earlier field, satisfiable numeric ranges, distinct
 * option values and none on the reserved `other:` prefix, alt text and an
 * allowed picture on images, one question per role, and a form that shows at
 * least one page under empty responses.
 */
export function builderQuestionnaireIssues(
  q: BuilderQuestionnaire,
): BuilderDefinitionIssue[] {
  const errors: BuilderDefinitionIssue[] = [];
  const add = (
    code: BuilderDefinitionIssueCode,
    message: string,
    at: { pageId?: string; blockId?: string } = {},
  ) => errors.push({ code, message, ...at });
  if (q.title.trim().length === 0) {
    add("missing_title", "Give the questionnaire a title before publishing.");
  }
  if (q.pages.length === 0) {
    add("no_pages", "A questionnaire needs at least one page.");
  }

  let inputCount = 0;
  // Every input field seen so far, by id: a condition may reference only these.
  const earlier = new Map<string, Question>();
  // A role the app copies somewhere (allergies, arrival day…) may sit on one
  // question only, or two answers would race for one column. Emergency
  // contact roles repeat by design: the Nth of each makes contact N.
  const roleOwners = new Map<string, string>();
  // Pages, content blocks and questions share ONE flat id namespace, and a
  // duplicate is a publish blocker for two reasons — the second is the one
  // that hides:
  //   1. Two question blocks with the same id collapse onto a single response
  //      key, so one field silently overwrites the other's answer.
  //   2. `earlier` (the shows-when forward-reference check) is keyed by that
  //      same id, so the SECOND block's `visibleIf` reference passes
  //      spuriously — a dangling condition gets accepted because its twin
  //      already seeded the set. Rejecting the duplicate closes both.
  // Content-block and page ids join the namespace because `classifyChange`
  // (@camp404/core) keys its visibleIf map by them: a collision there can read a branching
  // edit as cosmetic and skip the re-submit gate.
  const seen = new Map<string, string>();
  const claimId = (
    id: string,
    where: string,
    at: { pageId: string; blockId?: string },
  ) => {
    const first = seen.get(id);
    if (first !== undefined) {
      add(
        "duplicate_id",
        `The id "${id}" is used twice (${first} and ${where}) — ids must be unique so answers stay attached to the right question.`,
        at,
      );
      return;
    }
    seen.set(id, where);
  };

  q.pages.forEach((page, pi) => {
    const pageLabel = page.title.trim() || `Page ${pi + 1}`;
    const onPage = { pageId: page.id };
    claimId(page.id, pageLabel, onPage);
    if (page.blocks.length === 0) {
      add("empty_page", `${pageLabel} has no blocks.`, onPage);
    }
    if (page.visibleIf) {
      for (const issue of visibleIfErrors(page.visibleIf, earlier, pageLabel)) {
        add(issue.code, issue.message, onPage);
      }
    }
    for (const block of page.blocks) {
      const at = {
        pageId: page.id,
        blockId: block.kind === "question" ? block.question.id : block.id,
      };
      if (block.visibleIf) {
        for (const issue of visibleIfErrors(
          block.visibleIf,
          earlier,
          `A block on ${pageLabel}`,
        )) {
          add(issue.code, issue.message, at);
        }
      }
      if (block.kind === "image_block" && block.altText.trim().length === 0) {
        add(
          "image_alt_missing",
          `An image on ${pageLabel} is missing alt text.`,
          at,
        );
      }
      if (block.kind === "image_block") {
        if (block.imageUrl.trim().length === 0) {
          add(
            "image_missing",
            `An image on ${pageLabel} has no picture yet.`,
            at,
          );
        } else if (!isAllowedBuilderImageUrl(block.imageUrl)) {
          add("image_host", IMAGE_HOST_ERROR(pageLabel), at);
        }
      }
      if (block.kind !== "question") {
        claimId(block.id, `a ${block.kind} block on ${pageLabel}`, at);
        continue;
      }
      inputCount += 1;
      if (page.type === "content") {
        add(
          "input_on_content_page",
          `${pageLabel} is a content page and can't contain input fields.`,
          at,
        );
      }
      const field = block.question;
      claimId(field.id, `"${field.prompt}" on ${pageLabel}`, at);
      if (
        OPTION_KINDS.has(field.kind) &&
        "options" in field &&
        field.options.length < 2
      ) {
        add(
          "too_few_options",
          `"${field.prompt}" needs at least 2 options.`,
          at,
        );
      }
      // Two options with one value store the same answer, so a member's pick
      // cannot be told apart, and results count them as one.
      const values = choiceValues(field) ?? [];
      const repeated = values.find((v, i) => values.indexOf(v) !== i);
      if (repeated !== undefined) {
        add(
          "duplicate_option_value",
          `"${field.prompt}" has two options with the value "${repeated}". Each option needs its own value.`,
          at,
        );
      }
      // The `other:` prefix is reserved for in-band free-text answers. An
      // authored option value on it would be indistinguishable from something
      // a respondent typed — so it is refused at definition time, which is
      // what lets every reader trust the encoding.
      if (choiceValues(field)?.some((v) => v.startsWith(OTHER_PREFIX))) {
        add(
          "reserved_option_value",
          `"${field.prompt}" has an option value starting with "${OTHER_PREFIX}", which is reserved for free-text "Other" answers.`,
          at,
        );
      }
      for (const message of rangeErrors(field)) {
        add("invalid_range", message, at);
      }
      earlier.set(field.id, field);
      if (
        field.kind === "single_select" &&
        field.role === "participation_intent" &&
        !hasParticipationOptions(field)
      ) {
        add(
          "participation_options",
          participationOptionsMessage(field.prompt),
          at,
        );
      }
      const role = "role" in field ? field.role : undefined;
      if (role && !role.startsWith("emergency_contact_")) {
        const owner = roleOwners.get(role);
        if (owner !== undefined) {
          add(
            "duplicate_role",
            `"${owner}" and "${field.prompt}" are both marked for the same use. Mark only one.`,
            at,
          );
        } else {
          roleOwners.set(role, field.prompt);
        }
      }
    }
  });

  if (inputCount === 0) {
    add("no_inputs", "Add at least one input field.");
  }
  if (q.pages.length > 0 && visiblePages(q, {}).length === 0) {
    add(
      "no_visible_page",
      "This questionnaire shows no pages until something is answered.",
    );
  }
  return errors;
}
