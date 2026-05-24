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

export const Question = z.discriminatedUnion("kind", [
  SliderQuestion,
  SingleSelectQuestion,
  MultiSelectQuestion,
  ShortTextQuestion,
  LongTextQuestion,
  DateQuestion,
  ScaleQuestion,
  ToggleQuestion,
]);
export type Question = z.infer<typeof Question>;

export const QuestionnairePage = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  questions: z.array(Question).min(1),
});
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

/**
 * Validate a response map against a questionnaire definition. Returns the
 * normalised responses on success; throws ZodError-shaped errors otherwise.
 * Unknown response keys are dropped (a question may have been removed in a
 * later version); missing required questions return per-question errors.
 */
export function validateResponses(
  questionnaire: Questionnaire,
  raw: unknown,
): { ok: true; responses: QuestionnaireResponses }
  | { ok: false; errors: Record<string, string> } {
  const parsed = QuestionnaireResponses.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: { _root: "Malformed response payload" } };
  }
  const responses: QuestionnaireResponses = {};
  const errors: Record<string, string> = {};

  for (const page of questionnaire.pages) {
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
      if (typeof raw !== "string")
        return { ok: false, error: "Expected text" };
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
      if (typeof raw !== "string")
        return { ok: false, error: "Pick a level" };
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
  }
}
