import { z } from "zod";

// Question kinds the wizard can render. Add more as new shapes are needed;
// each new kind must extend Question (discriminated union) AND the response
// validator below.

export const SliderQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("slider"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  required: z.boolean().default(true),
});
export type SliderQuestion = z.infer<typeof SliderQuestion>;

// Discrete numeric picker — a row of whole-number cells from `min` to `max`
// (board OB-step-06 team interests: 0–6, range configurable). The stored value
// is the chosen integer. Distinct from `slider` (a dragged range) and `scale`
// (string-keyed labelled steps): the value here is a plain number, so it sorts
// and aggregates. Optional min/max end labels ("Not for me" / "Sign me up").
export const NumberQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("number"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  min: z.number().int().default(0),
  max: z.number().int().default(6),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  required: z.boolean().default(true),
});
export type NumberQuestion = z.infer<typeof NumberQuestion>;

export const SingleSelectQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("single_select"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  required: z.boolean().default(true),
});
export type SingleSelectQuestion = z.infer<typeof SingleSelectQuestion>;

export const MultiSelectQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("multi_select"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  required: z.boolean().default(false),
});
export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestion>;

export const ShortTextQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("short_text"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  maxLength: z.number().int().positive().default(120),
  required: z.boolean().default(true),
});
export type ShortTextQuestion = z.infer<typeof ShortTextQuestion>;

export const LongTextQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("long_text"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  maxLength: z.number().int().positive().default(1000),
  required: z.boolean().default(false),
});
export type LongTextQuestion = z.infer<typeof LongTextQuestion>;

// ISO 8601 yyyy-mm-dd. Backed by `<input type="date">`.
export const DateQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("date"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(true),
});
export type DateQuestion = z.infer<typeof DateQuestion>;

// Discrete labelled scale rendered as a vertical full-screen slider on
// mobile (top = highest, bottom = lowest) and a horizontal slider with
// labels on desktop. Used for cooking / hardware competency.
export const ScaleQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("scale"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  // Ordered top → bottom for the vertical mobile layout. The selected
  // value is the option's `value`.
  steps: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  required: z.boolean().default(true),
});
export type ScaleQuestion = z.infer<typeof ScaleQuestion>;

// Segmented control — same data shape as single_select but rendered as a
// horizontal button group rather than a dropdown. Use for small option
// sets (2–4) where the dropdown is overkill and the choices benefit from
// always being visible.
export const ToggleQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("toggle"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  required: z.boolean().default(true),
});
export type ToggleQuestion = z.infer<typeof ToggleQuestion>;

// Combobox — searchable single-select. Same data shape as single_select
// but rendered as a Popover + cmdk filterable list. Use for long lookup
// sets (countries, cities, …) where scrolling a plain Select is hostile.
export const ComboboxQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("combobox"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  placeholder: z.string().optional(),
  searchPlaceholder: z.string().optional(),
  required: z.boolean().default(true),
});
export type ComboboxQuestion = z.infer<typeof ComboboxQuestion>;

// Image upload — the stored value is the public URL of the uploaded image
// (a Vercel Blob URL in production). Rendered as a large circular uploader
// in the wizard. Optional by default; profile photos are never mandatory.
export const ImageQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(false),
});
export type ImageQuestion = z.infer<typeof ImageQuestion>;

export const Question = z.discriminatedUnion("kind", [
  SliderQuestion,
  NumberQuestion,
  SingleSelectQuestion,
  MultiSelectQuestion,
  ShortTextQuestion,
  LongTextQuestion,
  DateQuestion,
  ScaleQuestion,
  ToggleQuestion,
  ComboboxQuestion,
  ImageQuestion,
]);
export type Question = z.infer<typeof Question>;

// Standard page: one or more questions, the wizard validates them and
// advances on Next.
export const QuestionsPage = z.object({
  id: z.string().min(1),
  kind: z.literal("questions"),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  questions: z.array(Question).min(1),
});
export type QuestionsPage = z.infer<typeof QuestionsPage>;

// Full-screen "what's coming next" interstitial. No questions, no
// validation — just a heading + body and a Next button. Rendered at
// full viewport height on mobile, like the scale screens.
export const IntroPage = z.object({
  id: z.string().min(1),
  kind: z.literal("intro"),
  heading: z.string().min(1),
  body: z.string().min(1),
});
export type IntroPage = z.infer<typeof IntroPage>;

export const QuestionnairePage = z.discriminatedUnion("kind", [
  QuestionsPage,
  IntroPage,
]);
export type QuestionnairePage = z.infer<typeof QuestionnairePage>;

export const Questionnaire = z.object({
  version: z.string().min(1),
  pages: z.array(QuestionnairePage).min(1),
});
export type Questionnaire = z.infer<typeof Questionnaire>;

// Responses are a flat map keyed by question id; each value's shape depends
// on the question kind. Stored as JSONB on burner_profiles.responses.
export const QuestionnaireResponseValue = z.union([
  z.number(),
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.null(),
]);
export type QuestionnaireResponseValue = z.infer<
  typeof QuestionnaireResponseValue
>;

export const QuestionnaireResponses = z.record(
  z.string(),
  QuestionnaireResponseValue,
);
export type QuestionnaireResponses = z.infer<typeof QuestionnaireResponses>;

// --- Edit change log -----------------------------------------------------
// One field that changed when a user replayed (re-submitted) a questionnaire
// they had already completed. We deliberately keep no full version history —
// just a running log of *what* changed and *when*. `from` / `to` are the
// human-readable display values (option labels resolved, lists joined), so
// the log renders straight to the user without needing the catalogue.

export const QuestionnaireFieldChange = z.object({
  fieldId: z.string().min(1),
  // The question prompt at edit time, captured so the log stays readable
  // even if the catalogue copy changes later.
  label: z.string(),
  from: z.string(),
  to: z.string(),
});
export type QuestionnaireFieldChange = z.infer<typeof QuestionnaireFieldChange>;

// Flatten a questionnaire's pages into a single ordered list of questions
// (intro pages have none). Useful for diffing and for resolving a field id
// back to its question definition.
export function flattenQuestions(questionnaire: Questionnaire): Question[] {
  const out: Question[] = [];
  for (const page of questionnaire.pages) {
    if (page.kind === "questions") out.push(...page.questions);
  }
  return out;
}

const EMPTY_DISPLAY = "—";

/**
 * Render a stored response value as the string a human would recognise —
 * option labels instead of raw values, lists joined, empty answers as a
 * dash. Falls back to the raw value for unknown options.
 */
export function displayResponseValue(
  question: Question,
  value: QuestionnaireResponseValue | undefined,
): string {
  if (value === undefined || value === null || value === "") {
    return EMPTY_DISPLAY;
  }
  switch (question.kind) {
    case "single_select":
    case "toggle":
    case "combobox": {
      const opt = question.options.find((o) => o.value === value);
      return opt ? opt.label : String(value);
    }
    case "scale": {
      const step = question.steps.find((s) => s.value === value);
      return step ? step.label : String(value);
    }
    case "multi_select": {
      if (!Array.isArray(value) || value.length === 0) return EMPTY_DISPLAY;
      return value
        .map((v) => question.options.find((o) => o.value === v)?.label ?? v)
        .join(", ");
    }
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

function isEmptyValue(v: QuestionnaireResponseValue | undefined): boolean {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );
}

function sameValue(
  a: QuestionnaireResponseValue | undefined,
  b: QuestionnaireResponseValue | undefined,
): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return a === b;
}

/**
 * Compare two response maps against a questionnaire and return the list of
 * fields that changed, in questionnaire order. Multi-selects are compared as
 * sets (re-ordering is not a change); empty/absent answers are treated as
 * equal. Only questions in the catalogue are considered — stale keys from an
 * older version are ignored.
 */
export function diffResponses(
  questionnaire: Questionnaire,
  before: QuestionnaireResponses,
  after: QuestionnaireResponses,
): QuestionnaireFieldChange[] {
  const changes: QuestionnaireFieldChange[] = [];
  for (const q of flattenQuestions(questionnaire)) {
    const b = before[q.id];
    const a = after[q.id];
    if (sameValue(b, a)) continue;
    changes.push({
      fieldId: q.id,
      label: q.prompt,
      from: displayResponseValue(q, b),
      to: displayResponseValue(q, a),
    });
  }
  return changes;
}

/**
 * Validate a response map against a questionnaire definition. Returns the
 * normalised responses on success; throws ZodError-shaped errors otherwise.
 * Unknown response keys are dropped (a question may have been removed in a
 * later version); missing required questions return per-question errors.
 */
export function validateResponses(
  questionnaire: Questionnaire,
  raw: unknown,
):
  | { ok: true; responses: QuestionnaireResponses }
  | { ok: false; errors: Record<string, string> } {
  const parsed = QuestionnaireResponses.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: { _root: "Malformed response payload" } };
  }
  const responses: QuestionnaireResponses = {};
  const errors: Record<string, string> = {};

  for (const page of questionnaire.pages) {
    if (page.kind === "intro") continue;
    for (const q of page.questions) {
      const value = parsed.data[q.id];
      const result = validateOne(q, value);
      if (!result.ok) {
        errors[q.id] = result.error;
        continue;
      }
      if (result.value !== undefined) responses[q.id] = result.value;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, responses };
}

function validateOne(
  q: Question,
  raw: unknown,
):
  | { ok: true; value: QuestionnaireResponseValue | undefined }
  | { ok: false; error: string } {
  const isMissing = raw === undefined || raw === null || raw === "";
  if (isMissing) {
    if ("required" in q && q.required) {
      return { ok: false, error: "This question is required" };
    }
    return { ok: true, value: undefined };
  }

  switch (q.kind) {
    case "slider": {
      if (typeof raw !== "number" || Number.isNaN(raw))
        return { ok: false, error: "Expected a number" };
      if (raw < q.min || raw > q.max)
        return { ok: false, error: `Must be between ${q.min} and ${q.max}` };
      return { ok: true, value: raw };
    }
    case "number": {
      if (typeof raw !== "number" || Number.isNaN(raw))
        return { ok: false, error: "Expected a number" };
      if (!Number.isInteger(raw))
        return { ok: false, error: "Expected a whole number" };
      if (raw < q.min || raw > q.max)
        return { ok: false, error: `Must be between ${q.min} and ${q.max}` };
      return { ok: true, value: raw };
    }
    case "single_select": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a choice" };
      if (!q.options.some((o) => o.value === raw))
        return { ok: false, error: "Not a valid option" };
      return { ok: true, value: raw };
    }
    case "multi_select": {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string"))
        return { ok: false, error: "Expected a list of choices" };
      const allowed = new Set(q.options.map((o) => o.value));
      const filtered = (raw as string[]).filter((v) => allowed.has(v));
      if (q.required && filtered.length === 0)
        return { ok: false, error: "Pick at least one option" };
      return { ok: true, value: filtered };
    }
    case "short_text":
    case "long_text": {
      if (typeof raw !== "string") return { ok: false, error: "Expected text" };
      if (raw.length > q.maxLength)
        return { ok: false, error: `Max ${q.maxLength} characters` };
      return { ok: true, value: raw };
    }
    case "date": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a date" };
      // Strict yyyy-mm-dd: matches what `<input type="date">` produces and
      // what Postgres `date` columns accept directly.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return { ok: false, error: "Use yyyy-mm-dd" };
      const t = Date.parse(raw);
      if (Number.isNaN(t)) return { ok: false, error: "Not a real date" };
      return { ok: true, value: raw };
    }
    case "scale": {
      if (typeof raw !== "string") return { ok: false, error: "Pick a level" };
      if (!q.steps.some((s) => s.value === raw))
        return { ok: false, error: "Not a valid level" };
      return { ok: true, value: raw };
    }
    case "toggle": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a choice" };
      if (!q.options.some((o) => o.value === raw))
        return { ok: false, error: "Not a valid option" };
      return { ok: true, value: raw };
    }
    case "combobox": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a choice" };
      if (!q.options.some((o) => o.value === raw))
        return { ok: false, error: "Not a valid option" };
      return { ok: true, value: raw };
    }
    case "image": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected an image URL" };
      return { ok: true, value: raw };
    }
  }
}
