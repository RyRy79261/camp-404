import { z } from "zod";
import {
  Question,
  QuestionnaireResponses,
  type QuestionnaireResponseValue,
  validateOne,
} from "./questionnaire";

// --- In-app questionnaire builder model ----------------------------------
// A BuilderQuestionnaire is a SEPARATE parallel top-level type from the legacy
// `Questionnaire` (the two never unify — see docs/questionnaire-builder.md §1).
// It is authored in-app and stored whole as JSONB. A page holds an ordered list
// of Blocks; a block is either an input field (wrapping the shared `Question`)
// or a display-only content block. The loader discriminates the two definition
// shapes by `'blocks' in pages[0]`.

// Optional per-field/per-page visibility rule (conditional branching). A single
// declarative condition over an EARLIER field's answer — no scripting, no
// AND/OR in v1. Operator applicability + value typing is documented in §2.1.
export const VisibleIf = z.object({
  fieldId: z.string().min(1),
  op: z.enum([
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "includes",
    "not_includes",
    "is_answered",
    "is_empty",
  ]),
  // Omitted for is_answered / is_empty; scalar for compares; the referenced
  // option value for includes/not_includes.
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type VisibleIf = z.infer<typeof VisibleIf>;

const visibility = { visibleIf: VisibleIf.optional() };

// A question rendered to the respondent — wraps the shared `Question`. The
// block discriminant is `kind: "question"`; the wrapped `question.kind` is
// nested, so it never collides with the content-block kinds.
export const QuestionBlock = z.object({
  kind: z.literal("question"),
  question: Question,
  ...visibility,
});
export type QuestionBlock = z.infer<typeof QuestionBlock>;

export const HeaderBreakBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("header_break"),
  headingText: z.string().min(1),
  eyebrow: z.string().optional(),
  subtext: z.string().optional(),
  // Absent ⇒ "left".
  alignment: z.enum(["left", "center"]).optional(),
  ...visibility,
});
export type HeaderBreakBlock = z.infer<typeof HeaderBreakBlock>;

export const ExplainerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("explainer"),
  bodyText: z.string().min(1),
  style: z.enum(["plain", "note", "callout", "warning"]),
  ...visibility,
});
export type ExplainerBlock = z.infer<typeof ExplainerBlock>;

export const ImageBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("image_block"),
  imageUrl: z.string().min(1),
  caption: z.string().optional(),
  // Required for accessibility (enforced again at publish).
  altText: z.string(),
  sizeFit: z.enum(["fit", "fill", "full-width"]),
  ...visibility,
});
export type ImageBlock = z.infer<typeof ImageBlock>;

export const DividerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("divider"),
  ...visibility,
});
export type DividerBlock = z.infer<typeof DividerBlock>;

export const ContentBlock = z.discriminatedUnion("kind", [
  HeaderBreakBlock,
  ExplainerBlock,
  ImageBlock,
  DividerBlock,
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

export const Block = z.discriminatedUnion("kind", [
  QuestionBlock,
  HeaderBreakBlock,
  ExplainerBlock,
  ImageBlock,
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
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );
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
 * Deep-clone a questionnaire with fresh ids for every page, content block and
 * field, remapping each page- and block-level `visibleIf.fieldId` through the
 * old→new field-id map so the copy's conditional branching keeps referring to
 * ITS OWN fields. Without the remap the copied references dangle: branching
 * mis-renders at runtime and the copy fails the publish "shows-when references
 * an earlier field" check. `nextId` supplies fresh unique ids.
 */
export function regenerateBuilderIds(
  q: BuilderQuestionnaire,
  nextId: () => string,
): BuilderQuestionnaire {
  // Pass 1: assign a new id to every question and record old → new, so a
  // visibleIf referencing any field (even one on a later page) can be remapped.
  const idMap = new Map<string, string>();
  for (const page of q.pages) {
    for (const block of page.blocks) {
      if (block.kind === "question") idMap.set(block.question.id, nextId());
    }
  }
  const remap = (v: VisibleIf | undefined): VisibleIf | undefined =>
    v ? { ...v, fieldId: idMap.get(v.fieldId) ?? v.fieldId } : undefined;
  // Pass 2: rebuild with fresh page/block ids + remapped visibleIf.
  return {
    ...q,
    pages: q.pages.map((page) => ({
      ...page,
      id: nextId(),
      visibleIf: remap(page.visibleIf),
      blocks: page.blocks.map((block) =>
        block.kind === "question"
          ? {
              ...block,
              question: {
                ...block.question,
                id: idMap.get(block.question.id) ?? block.question.id,
              },
              visibleIf: remap(block.visibleIf),
            }
          : { ...block, id: nextId(), visibleIf: remap(block.visibleIf) },
      ),
    })),
  };
}

/**
 * Validate a response map against a builder questionnaire. Visibility-aware:
 * required checks are skipped for fields hidden by an unmet `visibleIf`, and a
 * hidden field's stored value is retained untouched (never pruned). Mirrors the
 * legacy `validateResponses` contract; reuses the per-question `validateOne`.
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
        // Retain any previously-entered value untouched; do not validate.
        if (data[id] !== undefined) responses[id] = data[id];
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
 * Hard publish blockers (member-visible messages). An empty array means the
 * questionnaire is publishable. Enforces structural validity beyond what the
 * Zod schema guarantees: at least one input, no inputs on content pages,
 * earlier-only `visibleIf` references, alt text on images, and that the form is
 * completable (at least one page visible under empty responses).
 */
export function validateBuilderQuestionnaire(
  q: BuilderQuestionnaire,
): string[] {
  const errors: string[] = [];
  if (q.title.trim().length === 0) {
    errors.push("Give the questionnaire a title before publishing.");
  }
  if (q.pages.length === 0) {
    errors.push("A questionnaire needs at least one page.");
  }

  let inputCount = 0;
  const earlier = new Set<string>();

  q.pages.forEach((page, pi) => {
    const pageLabel = page.title.trim() || `Page ${pi + 1}`;
    if (page.blocks.length === 0) {
      errors.push(`${pageLabel} has no blocks.`);
    }
    if (page.visibleIf && !earlier.has(page.visibleIf.fieldId)) {
      errors.push(
        `${pageLabel} shows-when references a field that doesn't come before it.`,
      );
    }
    for (const block of page.blocks) {
      if (block.visibleIf && !earlier.has(block.visibleIf.fieldId)) {
        errors.push(
          `A block on ${pageLabel} shows-when references a field that doesn't come before it.`,
        );
      }
      if (block.kind === "image_block" && block.altText.trim().length === 0) {
        errors.push(`An image on ${pageLabel} is missing alt text.`);
      }
      if (block.kind === "question") {
        inputCount += 1;
        if (page.type === "content") {
          errors.push(
            `${pageLabel} is a content page and can't contain input fields.`,
          );
        }
        const field = block.question;
        if (
          OPTION_KINDS.has(field.kind) &&
          "options" in field &&
          field.options.length < 2
        ) {
          errors.push(`"${field.prompt}" needs at least 2 options.`);
        }
        earlier.add(field.id);
      }
    }
  });

  if (inputCount === 0) {
    errors.push("Add at least one input field.");
  }
  if (q.pages.length > 0 && visiblePages(q, {}).length === 0) {
    errors.push("This questionnaire shows no pages until something is answered.");
  }
  return errors;
}

// --- Structural diff (drives the publish re-submit prompt) ---------------

function fieldMap(q: BuilderQuestionnaire): Map<string, Question> {
  const m = new Map<string, Question>();
  for (const field of flattenBuilderQuestions(q)) m.set(field.id, field);
  return m;
}

function optionValues(q: Question): string[] | null {
  if ("options" in q) return q.options.map((o) => o.value);
  if (q.kind === "scale") return q.steps.map((s) => s.value);
  return null;
}

/**
 * True when changing `prev` field into `next` (same id, same kind) can
 * invalidate a stored answer or change the obligation — i.e. a breaking change.
 */
function breakingParamChange(prev: Question, next: Question): boolean {
  // Removing or renaming an option value is breaking; adding one is not.
  const prevOpts = optionValues(prev);
  const nextOpts = optionValues(next);
  if (prevOpts && nextOpts) {
    const nextSet = new Set(nextOpts);
    if (prevOpts.some((v) => !nextSet.has(v))) return true;
  }
  // Narrowing a text/number bound can invalidate a stored answer.
  if (
    (prev.kind === "short_text" || prev.kind === "long_text") &&
    (next.kind === "short_text" || next.kind === "long_text") &&
    next.maxLength < prev.maxLength
  ) {
    return true;
  }
  if (
    (prev.kind === "slider" || prev.kind === "number") &&
    (next.kind === "slider" || next.kind === "number") &&
    (next.min > prev.min || next.max < prev.max)
  ) {
    return true;
  }
  return false;
}

function sameVisibleIf(a?: VisibleIf, b?: VisibleIf): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.fieldId === b.fieldId && a.op === b.op && a.value === b.value;
}

/** Map of stable element id → its `visibleIf` (page- and block-level). A
 *  question's visibleIf lives on its block but is keyed by the stable
 *  question.id; content blocks key by their own id; pages by page id. */
function visibleIfMap(
  q: BuilderQuestionnaire,
): Map<string, VisibleIf | undefined> {
  const m = new Map<string, VisibleIf | undefined>();
  for (const page of q.pages) {
    m.set(`p:${page.id}`, page.visibleIf);
    for (const block of page.blocks) {
      const key = block.kind === "question" ? block.question.id : block.id;
      m.set(`b:${key}`, block.visibleIf);
    }
  }
  return m;
}

/**
 * Classify the change between two builder questionnaires as `cosmetic` (no
 * version bump, no re-submit) or `breaking` (version bump, re-opens the gate on
 * the next Send). See docs/questionnaire-builder.md §6.1.
 */
export function classifyChange(
  prev: BuilderQuestionnaire,
  next: BuilderQuestionnaire,
): "cosmetic" | "breaking" {
  const a = fieldMap(prev);
  const b = fieldMap(next);
  for (const id of a.keys()) if (!b.has(id)) return "breaking"; // removed
  for (const id of b.keys()) if (!a.has(id)) return "breaking"; // added
  for (const [id, prevField] of a) {
    const nextField = b.get(id)!;
    if (prevField.kind !== nextField.kind) return "breaking";
    if (prevField.required !== nextField.required) return "breaking";
    if (breakingParamChange(prevField, nextField)) return "breaking";
  }
  // Adding, removing, or editing any visibleIf is breaking (spec §6.1): it
  // changes branching, so the gate must re-open rather than patch in place.
  const va = visibleIfMap(prev);
  const vb = visibleIfMap(next);
  for (const [key, cond] of va) {
    if (!sameVisibleIf(cond, vb.get(key))) return "breaking";
  }
  for (const key of vb.keys()) {
    if (!va.has(key)) return "breaking";
  }
  return "cosmetic";
}
