import { z } from "zod";

// --- The unified questionnaire model ------------------------------------
// AfrikaBurn's questionnaire engine ("AB") began as a port of this one and was
// refined separately. This file is AB's `questionnaire.ts` as the base, with
// its export names kept, extended ADDITIVELY so everything Camp 404 can express
// is representable too:
//
//   * Camp 404's question kinds (`slider`, `number`, `scale`, `toggle`,
//     `combobox`, `image`) and fields (`shortLabel`, `role`,
//     `enableDictation`) alongside AB's (`linear_scale`, `rating`, `time`,
//     `file_link`, the grids, `years`, display modes, "Other…", shuffles,
//     selection bounds, numeric text formats, option images, `goTo`);
//   * Camp 404's `visibleIf` grammar on questions pages, questions and content
//     blocks, beside AB's `goTo` / page `next` / SUBMIT_TARGET branching;
//   * Camp 404's content blocks (`header_break`, `explainer`, `divider`) beside
//     AB's `info_block` and `image_block`;
//   * a lenient DRAFT schema: a half-built definition must save, so the rules
//     AB wrote as `min(1)` on a page title, a page's block list and an image
//     block's url/alt are publish-time issues instead (see
//     `validateQuestionnaireDefinition` in @camp404/core).
//
// Every field added here is optional (or defaulted only on a kind that never
// existed before), so a definition written before this model still parses and
// round-trips to identical JSON. The in-app builder's stored shape
// (`BuilderQuestionnaire`, ./questionnaire-builder) converts losslessly into
// this one (./questionnaire-legacy).
//
// Lenient formats — no new deps (see the date/phone handling rule). Email is
// RFC-lite; phone accepts +, spaces, dashes, parens and is digit-bounded
// (7–15, the E.164 range) without pulling in a phone library.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALNUM_RE = /^[a-z0-9 ]+$/i;

/** Reserved branch target meaning "end the questionnaire here, go to submit".
 * Page ids may never equal it (enforced by validateQuestionnaireDefinition). */
export const SUBMIT_TARGET = "__submit__";

// --- Text-format presets -------------------------------------------------
// A CLOSED enum, deliberately: an author-supplied regex would be a ReDoS
// surface in a field a captain can type into. Every pattern above is anchored
// at both ends and uses a single non-backtracking character class, so a
// pathological answer costs one linear pass.
//
// `number` / `integer` are AB's numeric presets: the answer stays a STRING
// (a short text that must read as a number, bounded by the question's
// `min`/`max`). Camp 404's builder palette still offers the `number` KIND
// instead — a real number that sorts and aggregates — and does not surface
// these two; the engine supports both so neither app loses a feature.
export const TextFormat = z.enum([
  "text",
  "email",
  "url",
  "phone",
  "number",
  "integer",
  "alphanumeric",
  "telegram",
]);
export type TextFormat = z.infer<typeof TextFormat>;

/**
 * A Telegram username as Telegram allows it: 5 to 32 characters of letters,
 * digits and underscores, starting with a letter. The leading `@` people type
 * is optional. Returns the bare username (no `@`), or null when it is not one.
 * The roster shows it as `@name` and links it to t.me/name.
 */
const TELEGRAM_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
export function telegramUsername(raw: string): string | null {
  const name = raw.trim().replace(/^@/, "");
  return TELEGRAM_RE.test(name) ? name : null;
}

/** Bounds a numeric text format checks against (a short text's `min`/`max`). */
export interface TextFormatBounds {
  min?: number;
  max?: number;
}

/**
 * Check a raw text answer against a format preset. Returns the member-visible
 * error, or `null` when the value passes (or when there is no format to
 * check). Operates on the TRIMMED value — surrounding whitespace is never the
 * thing a respondent got wrong — but the stored value is left untouched.
 *
 * Emptiness is NOT this function's business: `validateOne` decides missing vs
 * present (and required vs optional) before it is called. A whitespace-only
 * answer under a real format therefore fails the format, which is correct —
 * "   " is not an email address, and not a number either.
 */
export function checkTextFormat(
  format: TextFormat | undefined,
  raw: string,
  bounds: TextFormatBounds = {},
): string | null {
  if (format === undefined || format === "text") return null;
  const value = raw.trim();
  switch (format) {
    case "email":
      return EMAIL_RE.test(value) ? null : "Enter a valid email address";
    case "url":
      return URL_RE.test(value)
        ? null
        : "Enter a link starting with http:// or https://";
    case "phone": {
      const digits = value.replace(/\D/g, "");
      const ok =
        PHONE_RE.test(value) && digits.length >= 7 && digits.length <= 15;
      return ok ? null : "Enter a valid phone number";
    }
    case "alphanumeric":
      return ALNUM_RE.test(value) ? null : "Letters and numbers only";
    case "telegram":
      return telegramUsername(value) !== null
        ? null
        : "Enter a Telegram username, like @nova_reyes: 5 to 32 letters, numbers or _";
    case "number":
    case "integer": {
      const n = Number(value);
      if (value === "" || Number.isNaN(n)) return "Enter a number";
      if (format === "integer" && !Number.isInteger(n))
        return "Enter a whole number";
      if (bounds.min != null && n < bounds.min)
        return `Must be at least ${bounds.min}`;
      if (bounds.max != null && n > bounds.max)
        return `Must be at most ${bounds.max}`;
      return null;
    }
    default: {
      // Exhaustiveness guard — a new format member without an arm above is a
      // compile error here rather than a silently-accepted answer.
      const _exhaustive: never = format;
      throw new Error(`Unhandled text format: ${String(_exhaustive)}`);
    }
  }
}

// --- "Other…" free-text answers -----------------------------------------
// Encoded IN BAND: the stored value is `other:<text>`. Keeping it in the same
// flat response map (rather than a companion key) means the choice kinds need
// NO change to the responses JSONB — no migration, no second lookup, and every
// existing reader keeps working on a plain string.
//
// The prefix is reserved: definition validation refuses to publish a
// definition whose option values start with it, so a stored `other:` value can
// only ever mean "the respondent typed this".
export const OTHER_PREFIX = "other:";

/**
 * True when a stored value is an in-band "Other…" answer.
 *
 * Accepts `unknown` (AB's takes a string) so a caller holding any response
 * value can ask. Deliberately NOT a `value is string` type predicate: a
 * predicate narrows the ELSE branch too, so `if (isOtherAnswer(v)) … else …`
 * would leave every ordinary-answer path believing `v` can no longer be a
 * string — which is exactly wrong for the option-label lookups that follow it.
 */
export function isOtherAnswer(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(OTHER_PREFIX);
}

/**
 * The text the respondent typed, with the reserved prefix stripped. A value
 * that is not an "Other…" answer comes back unchanged (Camp 404's contract,
 * which its renderers rely on; AB returns "" there).
 */
export function otherAnswerText(value: string): string {
  return isOtherAnswer(value) ? value.slice(OTHER_PREFIX.length) : value;
}

/** Encode typed free text as an "Other…" answer. */
export function toOtherAnswer(text: string): string {
  return `${OTHER_PREFIX}${text}`;
}

// --- Conditional visibility (Camp 404's `visibleIf` grammar) -------------
// A single declarative condition over an EARLIER field's answer — no scripting,
// no AND/OR. It sits beside AB's `goTo`/`next` branching: `goTo` routes a
// respondent between pages, `visibleIf` hides a page, a question or a content
// block in place. The runtime honours both.

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

/**
 * A few words that name a question where the full prompt is too long: the
 * My forms change log ("Driving" for "Will you be driving a car to the
 * burn?"). Optional; readers fall back to the prompt (questionLabel).
 */
export const SHORT_LABEL_MAX_LENGTH = 40;
const ShortLabel = z
  .string()
  .trim()
  .min(1)
  .max(SHORT_LABEL_MAX_LENGTH)
  .optional();

// Camp 404's additions to EVERY question kind: a short label for lists, and a
// visibility condition. Spread last into each AB schema below, so each one
// reads as AB's field list plus these.
const camp404QuestionFields = {
  shortLabel: ShortLabel,
  visibleIf: VisibleIf.optional(),
};

// What an answer is FOR, when the app does something with it beyond storing it.
// Code keys its mirrors and routes on the role, never on a question id, so a
// renamed or re-authored question keeps working. A role may sit only on a
// kind that can hold its value (see each schema below).
export const QUESTION_ROLES = [
  "profile_photo",
  "bio",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  // The member's Telegram username, mirrored onto users.telegram_handle (the
  // roster's handle), since the camp talks on Telegram.
  "telegram_handle",
  // Builder questionnaires: copied into dietary_requirements / driver_profiles
  // on submit, so a camp-authored Dietary or Transport questionnaire feeds the
  // roster, the export and the drivers audience (see BUILDER_ROLES in
  // ./builder-roles).
  "dietary_allergies",
  "dietary_anaphylactic",
  "dietary_notes",
  "driving_this_year",
  "arrival_date",
  "departure_date",
] as const;
export type QuestionRole = (typeof QUESTION_ROLES)[number];

/** How a choice question renders. `dropdown` is the long-option-list variant
 * of single choice; `image_grid` is multiple-choice-with-images. */
export const ChoiceDisplay = z.enum(["radio", "dropdown", "image_grid"]);
export type ChoiceDisplay = z.infer<typeof ChoiceDisplay>;

export const MultiChoiceDisplay = z.enum(["checkbox", "image_grid"]);
export type MultiChoiceDisplay = z.infer<typeof MultiChoiceDisplay>;

/** One selectable option. `imageUrl` powers multiple-choice-with-images;
 * `goTo` is the per-option branch target (single choice only). */
export const QuestionOption = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  imageUrl: z.string().min(1).optional(),
  imageAlt: z.string().optional(),
  goTo: z.string().min(1).optional(),
});
export type QuestionOption = z.infer<typeof QuestionOption>;

// A plain labelled value: the options of `toggle` / `combobox` and the steps of
// `scale` (Camp 404 kinds, which carry no images and never branch).
const LabelledValue = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const SingleSelectQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("single_select"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z.array(QuestionOption).min(2),
  required: z.boolean().default(true),
  // Builder v2 additions.
  display: ChoiceDisplay.optional(),
  // Opt-in "Other…" free text. Absent/false ⇒ the respondent may only pick a
  // listed option. When on, the stored value may be `other:<typed text>` (see
  // OTHER_PREFIX) — still one string in the same flat response map.
  allowOther: z.boolean().optional(),
  otherLabel: z.string().optional(),
  shuffleOptions: z.boolean().optional(),
  ...camp404QuestionFields,
});
export type SingleSelectQuestion = z.infer<typeof SingleSelectQuestion>;

export const MultiSelectQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("multi_select"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  options: z.array(QuestionOption).min(2),
  required: z.boolean().default(false),
  // Builder v2 additions.
  display: MultiChoiceDisplay.optional(),
  // Opt-in "Other…" free text — one `other:<typed text>` entry alongside the
  // picked option values.
  allowOther: z.boolean().optional(),
  otherLabel: z.string().optional(),
  shuffleOptions: z.boolean().optional(),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().optional(),
  ...camp404QuestionFields,
});
export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestion>;

export const ShortTextQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("short_text"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().default(120),
  required: z.boolean().default(true),
  // Builder v2 response validation. `format` applies a preset check on top of
  // the length bounds (short_text ONLY — `long_text` is a paragraph and is
  // never format-checked); `min`/`max` bound the numeric value when format is
  // number/integer.
  minLength: z.number().int().nonnegative().optional(),
  format: TextFormat.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  ...camp404QuestionFields,
  role: z
    .enum([
      "emergency_contact_name",
      "emergency_contact_relationship",
      "dietary_allergies",
      "dietary_notes",
      "telegram_handle",
    ])
    .optional(),
});
export type ShortTextQuestion = z.infer<typeof ShortTextQuestion>;

export const LongTextQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("long_text"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().default(1000),
  required: z.boolean().default(false),
  minLength: z.number().int().nonnegative().optional(),
  ...camp404QuestionFields,
  // Opt-in voice dictation (the Groq transcription path). Absent/false ⇒ the
  // dictate affordance is hidden; shown only where the author enabled it.
  enableDictation: z.boolean().optional(),
  role: z.enum(["bio", "dietary_allergies", "dietary_notes"]).optional(),
});
export type LongTextQuestion = z.infer<typeof LongTextQuestion>;

// ISO 8601 yyyy-mm-dd. Backed by `<input type="date">`.
export const DateQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("date"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
  role: z.enum(["arrival_date", "departure_date"]).optional(),
});
export type DateQuestion = z.infer<typeof DateQuestion>;

// On/off boolean — rendered as a switch. The stored value is a real boolean.
// Distinct from `toggle`, which is a string-keyed segmented control over 2–4
// options. Optional by default; an untouched required boolean is treated as
// missing (the runner stores a value only after an explicit toggle).
export const BooleanQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("boolean"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(false),
  ...camp404QuestionFields,
  role: z.enum(["dietary_anaphylactic", "driving_this_year"]).optional(),
});
export type BooleanQuestion = z.infer<typeof BooleanQuestion>;

// Email address — a single-line text answer validated against EMAIL_RE.
export const EmailQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("email"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
});
export type EmailQuestion = z.infer<typeof EmailQuestion>;

// Phone number — a single-line text answer validated leniently against
// PHONE_RE (7–15 digits, optional +/spacing). No phone library.
export const PhoneQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("phone"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
  role: z.literal("emergency_contact_phone").optional(),
});
export type PhoneQuestion = z.infer<typeof PhoneQuestion>;

// --- Attended-years ---------------------------------------------------------
// AfrikaBurn has run every year from 2007 to 2026 EXCEPT 2020 and 2021 (no
// burn — the pandemic years). The years-attended field is a multi-select over
// this range; 2020/2021 are offered disabled in the UI and REJECTED here at the
// boundary, because the questionnaire validator is the enforcement point.
export const ATTENDED_YEAR_MIN = 2007;
export const ATTENDED_YEAR_MAX = 2026;
export const NO_BURN_YEARS: readonly number[] = [2020, 2021];

/** True when `year` is a real AfrikaBurn edition year (in range, burn held). */
export function isValidAttendedYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= ATTENDED_YEAR_MIN &&
    year <= ATTENDED_YEAR_MAX &&
    !NO_BURN_YEARS.includes(year)
  );
}

/** Newest-first option list for the years-attended toggle grid. Disabled
 * entries (2020/2021) render with a "no burn" hint. */
export function attendedYearOptions(): { year: number; disabled: boolean }[] {
  const out: { year: number; disabled: boolean }[] = [];
  for (let y = ATTENDED_YEAR_MAX; y >= ATTENDED_YEAR_MIN; y--) {
    out.push({ year: y, disabled: NO_BURN_YEARS.includes(y) });
  }
  return out;
}

// Multi-select of specific AfrikaBurn years attended. The response value is an
// array of year strings (fitting QuestionnaireResponseValue's `string[]`).
export const YearsQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("years"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(false),
  ...camp404QuestionFields,
});
export type YearsQuestion = z.infer<typeof YearsQuestion>;

// --- Builder v2 question kinds ------------------------------------------

// Linear scale — `min` is 0 or 1, `max` is 2–10, with optional end labels
// ("Not at all" … "Completely"). The response value is the chosen integer.
export const LinearScaleQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("linear_scale"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  min: z.union([z.literal(0), z.literal(1)]),
  max: z.number().int().min(2).max(10),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
});
export type LinearScaleQuestion = z.infer<typeof LinearScaleQuestion>;

// Star rating — 3–10 steps, glyph is a render hint only. The response value is
// the chosen integer, 1..steps.
export const RatingQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("rating"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  steps: z.number().int().min(3).max(10),
  glyph: z.enum(["star", "heart", "number"]).optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
});
export type RatingQuestion = z.infer<typeof RatingQuestion>;

// Time of day, 24h `HH:MM`. Backed by `<input type="time">`.
export const TimeQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("time"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
});
export type TimeQuestion = z.infer<typeof TimeQuestion>;

// File upload rendered as a LINK: the respondent pastes a URL to a file they
// host (Drive, Dropbox, …) rather than uploading. The stored value is a URL
// either way, so an upload affordance can land later without changing the kind.
export const FileLinkQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("file_link"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  ...camp404QuestionFields,
});
export type FileLinkQuestion = z.infer<typeof FileLinkQuestion>;

// --- Grid question kinds (Google-Forms parity) ---------------------------
// A grid is ONE question with named rows and shared columns. The response value
// is a per-row map `{ [rowId]: columnValue[] }` — one entry per answered row.
// `multi_choice_grid` allows one column per row (radio); `checkbox_grid` allows
// any number of columns per row (checkboxes). Rows carry an `id` (it keys the
// response map, allocated once like a question id and never re-derived);
// columns carry a `value` (the stored answer) plus a display `label`.

export const GridRow = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type GridRow = z.infer<typeof GridRow>;

export const GridColumn = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});
export type GridColumn = z.infer<typeof GridColumn>;

// Multiple-choice grid — exactly one column may be chosen per row. `required`
// (default true, matching Google Forms) means EVERY row must be answered.
export const MultiChoiceGridQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("multi_choice_grid"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  rows: z.array(GridRow).min(1),
  columns: z.array(GridColumn).min(1),
  required: z.boolean().default(true),
  ...camp404QuestionFields,
});
export type MultiChoiceGridQuestion = z.infer<typeof MultiChoiceGridQuestion>;

// Checkbox grid — any number of columns may be chosen per row. `required`
// (default false) means every row must carry at least one selection.
export const CheckboxGridQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("checkbox_grid"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  rows: z.array(GridRow).min(1),
  columns: z.array(GridColumn).min(1),
  required: z.boolean().default(false),
  ...camp404QuestionFields,
});
export type CheckboxGridQuestion = z.infer<typeof CheckboxGridQuestion>;

// --- Camp 404 question kinds ---------------------------------------------
// As Camp 404 declared them, plus the `visibleIf` every kind now carries.

export const SliderQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("slider"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  shortLabel: ShortLabel,
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  // Render variant: "continuous" = a dragged slider; "segmented" = a row of
  // discrete whole-number cells to tap (the builder "Scale" palette card).
  // Same numeric value + validation either way. Absent ⇒ "continuous".
  display: z.enum(["continuous", "segmented"]).optional(),
  required: z.boolean().default(true),
  visibleIf: VisibleIf.optional(),
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
  shortLabel: ShortLabel,
  min: z.number().int().default(0),
  max: z.number().int().default(6),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  required: z.boolean().default(true),
  visibleIf: VisibleIf.optional(),
});
export type NumberQuestion = z.infer<typeof NumberQuestion>;

// Discrete labelled scale rendered as a vertical full-screen slider on
// mobile (top = highest, bottom = lowest) and a horizontal slider with
// labels on desktop. Used for cooking / hardware competency.
export const ScaleQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("scale"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  shortLabel: ShortLabel,
  // Ordered top → bottom for the vertical mobile layout. The selected
  // value is the option's `value`.
  steps: z.array(LabelledValue).min(2),
  required: z.boolean().default(true),
  visibleIf: VisibleIf.optional(),
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
  shortLabel: ShortLabel,
  options: z.array(LabelledValue).min(2),
  required: z.boolean().default(true),
  visibleIf: VisibleIf.optional(),
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
  shortLabel: ShortLabel,
  options: z.array(LabelledValue).min(2),
  placeholder: z.string().optional(),
  searchPlaceholder: z.string().optional(),
  required: z.boolean().default(true),
  visibleIf: VisibleIf.optional(),
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
  shortLabel: ShortLabel,
  // The member's own profile photo: uploads through the avatar route and is
  // mirrored onto users.profile_image_url.
  role: z.literal("profile_photo").optional(),
  required: z.boolean().default(false),
  visibleIf: VisibleIf.optional(),
});
export type ImageQuestion = z.infer<typeof ImageQuestion>;

export const Question = z.discriminatedUnion("kind", [
  SingleSelectQuestion,
  MultiSelectQuestion,
  ShortTextQuestion,
  LongTextQuestion,
  DateQuestion,
  BooleanQuestion,
  EmailQuestion,
  PhoneQuestion,
  YearsQuestion,
  LinearScaleQuestion,
  RatingQuestion,
  TimeQuestion,
  FileLinkQuestion,
  MultiChoiceGridQuestion,
  CheckboxGridQuestion,
  SliderQuestion,
  NumberQuestion,
  ScaleQuestion,
  ToggleQuestion,
  ComboboxQuestion,
  ImageQuestion,
]);
export type Question = z.infer<typeof Question>;

// --- Content blocks ------------------------------------------------------
// Blocks sit in a page's block list alongside questions but take NO answer —
// they never appear in the response map and never gate completion.

// Section header / info text: standalone copy, "just there for information".
export const InfoBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("info_block"),
  heading: z.string().optional(),
  body: z.string().min(1),
  visibleIf: VisibleIf.optional(),
});
export type InfoBlock = z.infer<typeof InfoBlock>;

// Standalone image. `url` and `alt` may be empty while DRAFTING (AB's schema
// required both); publishing requires an allowed picture and alt text
// (`isAllowedBuilderImageUrl`, checked by validateQuestionnaireDefinition), so
// the runner is never inaccessible and never loads a third-party pixel.
export const ImageBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("image_block"),
  url: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  // Absent ⇒ "fit".
  sizeFit: z.enum(["fit", "fill", "full-width"]).optional(),
  visibleIf: VisibleIf.optional(),
});
export type ImageBlock = z.infer<typeof ImageBlock>;

// A section break inside a page: a heading with optional eyebrow and subtext.
export const HeaderBreakBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("header_break"),
  headingText: z.string().min(1),
  eyebrow: z.string().optional(),
  subtext: z.string().optional(),
  // Absent ⇒ "left".
  alignment: z.enum(["left", "center"]).optional(),
  visibleIf: VisibleIf.optional(),
});
export type HeaderBreakBlock = z.infer<typeof HeaderBreakBlock>;

// Body copy with a presentational style (a note, a callout, a warning).
export const ExplainerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("explainer"),
  bodyText: z.string().min(1),
  style: z.enum(["plain", "note", "callout", "warning"]),
  visibleIf: VisibleIf.optional(),
});
export type ExplainerBlock = z.infer<typeof ExplainerBlock>;

export const DividerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("divider"),
  visibleIf: VisibleIf.optional(),
});
export type DividerBlock = z.infer<typeof DividerBlock>;

export const ContentBlock = z.discriminatedUnion("kind", [
  InfoBlock,
  ImageBlock,
  HeaderBreakBlock,
  ExplainerBlock,
  DividerBlock,
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

/** Anything that can sit in a page's block list — a question or a content
 * block. Definitions that predate content blocks contain only questions, so
 * widening the page's `questions` array to this union is backward compatible. */
export const PageBlock = z.union([Question, ContentBlock]);
export type PageBlock = z.infer<typeof PageBlock>;

/** Every question kind, read off the schema — never hand-listed, so a kind
 * added to `Question` is answerable the moment it exists. */
export const QUESTION_KINDS: readonly Question["kind"][] = Question.options.map(
  (option) => option.shape.kind.value,
);

const ANSWERABLE_KINDS: ReadonlySet<string> = new Set(QUESTION_KINDS);

/** True when a block takes an answer (i.e. is a Question, not a content
 * block). The one place the answerable/decorative line is drawn. */
export function isAnswerableBlock(block: PageBlock): block is Question {
  return ANSWERABLE_KINDS.has(block.kind);
}

// The result every questionnaire SAVE action returns — shared by the onboarding,
// replay, and builder wizards (so a reusable wizard never couples to one route's
// action module). `errors` is keyed by question id, plus the reserved
// `_form`/`_root` keys for page-level failures.
export type SaveResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

// Standard page — ALSO a builder "section": one page per section, a page break
// between them, validated on Next. `questions` holds blocks (questions +
// content blocks); older definitions hold questions only.
//
//   * `next` overrides the default fall-through to the following page (a page
//     id or SUBMIT_TARGET); `shuffleQuestions` randomises block order.
//   * `visibleIf` hides the whole page; a hidden page is skipped and routes by
//     its fall-through.
//   * `requiredToContinue` / `pageType` carry Camp 404's builder page chrome:
//     "must press Continue" and "this is a content page" (a content page may
//     not hold inputs — a publish-time rule). Absent ⇒ false / "question".
//
// `title` and `questions` are lenient so a draft saves; an empty title or an
// empty page is a publish-time issue, not a parse failure.
export const QuestionsPage = z.object({
  id: z.string().min(1),
  kind: z.literal("questions"),
  title: z.string(),
  subtitle: z.string().optional(),
  questions: z.array(PageBlock),
  next: z.string().min(1).optional(),
  shuffleQuestions: z.boolean().optional(),
  visibleIf: VisibleIf.optional(),
  requiredToContinue: z.boolean().optional(),
  pageType: z.enum(["question", "content"]).optional(),
});
export type QuestionsPage = z.infer<typeof QuestionsPage>;

// Full-screen "what's coming next" interstitial. No questions, no
// validation — just a heading + body and a Next button.
export const IntroPage = z.object({
  id: z.string().min(1),
  kind: z.literal("intro"),
  heading: z.string().min(1),
  body: z.string().min(1),
  next: z.string().min(1).optional(),
});
export type IntroPage = z.infer<typeof IntroPage>;

export const QuestionnairePage = z.discriminatedUnion("kind", [
  QuestionsPage,
  IntroPage,
]);
export type QuestionnairePage = z.infer<typeof QuestionnairePage>;

export const Questionnaire = z.object({
  version: z.string().min(1),
  // Optional: code questionnaires have none; builder-authored ones do.
  title: z.string().optional(),
  pages: z.array(QuestionnairePage).min(1),
});
export type Questionnaire = z.infer<typeof Questionnaire>;

// A grid answer: `{ [rowId]: columnValue[] }`. Nested inside the flat response
// map (keyed by the grid question's id) so grids need no schema change — it is
// JSONB either way. An empty map / all-empty rows means "unanswered".
export const GridAnswer = z.record(z.string(), z.array(z.string()));
export type GridAnswer = z.infer<typeof GridAnswer>;

// Responses are a flat map keyed by question id; each value's shape depends
// on the question kind. Stored as JSONB.
export const QuestionnaireResponseValue = z.union([
  z.number(),
  z.string(),
  z.array(z.string()),
  z.boolean(),
  GridAnswer,
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
  // The question's short label (or its prompt) at edit time, captured so the
  // log stays readable even if the catalogue copy changes later.
  label: z.string(),
  from: z.string(),
  to: z.string(),
});
export type QuestionnaireFieldChange = z.infer<typeof QuestionnaireFieldChange>;

/** What to call a question in a list: its short label, else its prompt. */
export function questionLabel(question: Question): string {
  return question.shortLabel ?? question.prompt;
}

/** Flatten a questionnaire's pages into a single ordered list of ANSWERABLE
 * questions. Intro pages and content blocks are skipped — they take no answer,
 * so they never count towards question counts or completion. */
export function flattenQuestions(questionnaire: Questionnaire): Question[] {
  const out: Question[] = [];
  for (const page of questionnaire.pages) {
    if (page.kind === "questions") out.push(...pageQuestions(page));
  }
  return out;
}

/** The answerable questions on one page, in order. */
export function pageQuestions(page: QuestionnairePage): Question[] {
  if (page.kind !== "questions") return [];
  return page.questions.filter(isAnswerableBlock);
}

/** Every block on one page, in order (questions + content blocks). */
export function pageBlocks(page: QuestionnairePage): PageBlock[] {
  return page.kind === "questions" ? [...page.questions] : [];
}

const EMPTY_DISPLAY = "—";

/**
 * Render one in-band "Other…" answer. Without this the `default:` arm below
 * would print the storage encoding — `other:pizza` — straight to a captain.
 */
function otherDisplay(value: string): string {
  const text = otherAnswerText(value).trim();
  return `Other: ${text === "" ? EMPTY_DISPLAY : text}`;
}

/** A grid answer, or null when the value is not a `{ rowId: string[] }` map. */
function asGridAnswer(value: unknown): GridAnswer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as GridAnswer;
}

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
  // An `other:` value can reach any string-answered choice kind (a definition
  // is editable after publish, so `allowOther` can be turned off or a field
  // morphed under a stored answer). Decode it before the per-kind arms rather
  // than in one of them, so no path can fall through to `default:` and print
  // the raw encoding.
  if (typeof value === "string" && isOtherAnswer(value)) {
    return otherDisplay(value);
  }
  switch (question.kind) {
    case "single_select":
    case "toggle":
    case "combobox": {
      const opt = question.options.find((o) => o.value === value);
      return opt ? opt.label : unlistedDisplay(value);
    }
    case "scale": {
      const step = question.steps.find((s) => s.value === value);
      return step ? step.label : unlistedDisplay(value);
    }
    case "years":
      return Array.isArray(value) && value.length === 0
        ? EMPTY_DISPLAY
        : plainDisplay(value);
    case "multi_select": {
      if (!Array.isArray(value) || value.length === 0) return EMPTY_DISPLAY;
      return value
        .map((v) =>
          isOtherAnswer(v)
            ? otherDisplay(v)
            : (question.options.find((o) => o.value === v)?.label ?? v),
        )
        .join(", ");
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "multi_choice_grid":
    case "checkbox_grid": {
      const grid = asGridAnswer(value);
      if (!grid) return plainDisplay(value);
      const columnLabel = (v: string) =>
        question.columns.find((c) => c.value === v)?.label ?? v;
      const rows = question.rows
        .filter((row) => (grid[row.id] ?? []).length > 0)
        .map(
          (row) =>
            `${row.label}: ${(grid[row.id] ?? []).map(columnLabel).join(", ")}`,
        );
      return rows.length > 0 ? rows.join("; ") : EMPTY_DISPLAY;
    }
    default:
      return plainDisplay(value);
  }
}

/**
 * The kind-agnostic rendering: a scalar as itself, a list joined, and a map
 * (a grid answer under a kind that is not a grid any more) as `key: values`
 * rather than "[object Object]".
 */
function plainDisplay(value: QuestionnaireResponseValue): string {
  if (Array.isArray(value)) return value.join(", ");
  const grid = asGridAnswer(value);
  if (grid) {
    return Object.entries(grid)
      .map(([key, picks]) => `${key}: ${picks.join(", ")}`)
      .join("; ");
  }
  return String(value);
}

/** A value no option or step declares, shown as it is stored. */
function unlistedDisplay(value: QuestionnaireResponseValue): string {
  return asGridAnswer(value) ? plainDisplay(value) : String(value);
}

function isEmptyValue(v: QuestionnaireResponseValue | undefined): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  const grid = asGridAnswer(v);
  if (grid) return !Object.values(grid).some((picks) => picks.length > 0);
  return false;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sameValue(
  a: QuestionnaireResponseValue | undefined,
  b: QuestionnaireResponseValue | undefined,
): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return sameList(a, b);
  const ga = asGridAnswer(a);
  const gb = asGridAnswer(b);
  if (ga && gb) {
    // Rows compare as sets of picks; a row with no picks is no row at all.
    const rows = new Set([...Object.keys(ga), ...Object.keys(gb)]);
    return [...rows].every((row) => sameList(ga[row] ?? [], gb[row] ?? []));
  }
  return a === b;
}

/**
 * Compare two response maps against a questionnaire and return the list of
 * fields that changed, in questionnaire order. Multi-selects are compared as
 * sets (re-ordering is not a change), grids row by row; empty/absent answers
 * are treated as equal. Only questions in the catalogue are considered — stale
 * keys from an older version are ignored.
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
      label: questionLabel(q),
      from: displayResponseValue(q, b),
      to: displayResponseValue(q, a),
    });
  }
  return changes;
}

/**
 * Validate a response map against a questionnaire definition. Returns the
 * normalised responses on success; per-question errors otherwise. Unknown
 * response keys are dropped (a question may have been removed in a later
 * version); missing required questions return per-question errors.
 *
 * Visibility-BLIND: every question in the definition is validated. The
 * branch- and `visibleIf`-aware submit check is `validateSubmission` in
 * @camp404/core.
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
    for (const q of pageQuestions(page)) {
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

export function validateOne(
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
    case "boolean": {
      if (typeof raw !== "boolean")
        return { ok: false, error: "Expected yes or no" };
      return { ok: true, value: raw };
    }
    case "email": {
      if (typeof raw !== "string") return { ok: false, error: "Expected text" };
      if (!EMAIL_RE.test(raw))
        return { ok: false, error: "Enter a valid email address" };
      return { ok: true, value: raw };
    }
    case "phone": {
      if (typeof raw !== "string") return { ok: false, error: "Expected text" };
      const digits = raw.replace(/\D/g, "");
      if (!PHONE_RE.test(raw) || digits.length < 7 || digits.length > 15)
        return { ok: false, error: "Enter a valid phone number" };
      return { ok: true, value: raw };
    }
    case "single_select": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a choice" };
      if (isOtherAnswer(raw)) {
        // An `other:` value from a field that never offered "Other…" is not a
        // near-miss to be salvaged — it is a payload for an option that does
        // not exist, so it gets the same refusal as any unlisted value.
        if (!q.allowOther) return { ok: false, error: "Not a valid option" };
        if (otherAnswerText(raw).trim() === "")
          return { ok: false, error: "Tell us what your 'other' answer is" };
        return { ok: true, value: raw };
      }
      if (!q.options.some((o) => o.value === raw))
        return { ok: false, error: "Not a valid option" };
      return { ok: true, value: raw };
    }
    case "multi_select": {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string"))
        return { ok: false, error: "Expected a list of choices" };
      const allowed = new Set(q.options.map((o) => o.value));
      // Unknown values are DROPPED here rather than erroring (an option may
      // have been removed since the answer was given). A disallowed or empty
      // `other:` entry drops the same way (Camp 404's rule; AB refuses an empty
      // one); if that empties a required answer the required check below
      // still catches it.
      const filtered = (raw as string[]).filter((v) =>
        isOtherAnswer(v)
          ? q.allowOther === true && otherAnswerText(v).trim() !== ""
          : allowed.has(v),
      );
      if (q.required && filtered.length === 0)
        return { ok: false, error: "Pick at least one option" };
      // min/maxSelections only bind once something is picked — an empty answer
      // on an OPTIONAL question stays a valid skip.
      if (
        filtered.length > 0 &&
        q.minSelections != null &&
        filtered.length < q.minSelections
      )
        return { ok: false, error: `Pick at least ${q.minSelections} options` };
      if (q.maxSelections != null && filtered.length > q.maxSelections)
        return { ok: false, error: `Pick at most ${q.maxSelections} options` };
      return { ok: true, value: filtered };
    }
    case "linear_scale": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (typeof raw === "boolean" || !Number.isInteger(n))
        return { ok: false, error: "Pick a value on the scale" };
      if (n < q.min || n > q.max)
        return {
          ok: false,
          error: `Pick a value between ${q.min} and ${q.max}`,
        };
      return { ok: true, value: n };
    }
    case "rating": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (typeof raw === "boolean" || !Number.isInteger(n))
        return { ok: false, error: "Pick a rating" };
      if (n < 1 || n > q.steps)
        return { ok: false, error: `Pick a rating between 1 and ${q.steps}` };
      return { ok: true, value: n };
    }
    case "time": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a time" };
      if (!TIME_RE.test(raw)) return { ok: false, error: "Use 24-hour hh:mm" };
      return { ok: true, value: raw };
    }
    case "file_link": {
      if (typeof raw !== "string")
        return { ok: false, error: "Expected a link" };
      if (!URL_RE.test(raw.trim()))
        return {
          ok: false,
          error: "Enter a link starting with http:// or https://",
        };
      return { ok: true, value: raw.trim() };
    }
    case "multi_choice_grid":
    case "checkbox_grid": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        return { ok: false, error: "Expected a grid of answers" };
      const incoming = raw as Record<string, unknown>;
      const columnValues = new Set(q.columns.map((c) => c.value));
      const single = q.kind === "multi_choice_grid";
      const value: GridAnswer = {};
      // Iterate the DEFINITION's rows so unknown/extra row keys are dropped and
      // the answer is normalised to known rows and known columns only.
      for (const row of q.rows) {
        const cell = incoming[row.id];
        if (cell === undefined || cell === null) continue;
        if (!Array.isArray(cell) || cell.some((v) => typeof v !== "string"))
          return { ok: false, error: `Malformed answer for "${row.label}"` };
        const picks: string[] = [];
        for (const v of cell as string[]) {
          if (columnValues.has(v) && !picks.includes(v)) picks.push(v);
        }
        if (single && picks.length > 1)
          return { ok: false, error: `Pick one column for "${row.label}"` };
        if (picks.length > 0) value[row.id] = picks;
      }
      const answeredRows = Object.keys(value).length;
      if (q.required) {
        const missing = q.rows.find((r) => (value[r.id] ?? []).length === 0);
        if (missing)
          return {
            ok: false,
            error: `Answer every row — "${missing.label}" is missing`,
          };
      }
      // An optional grid left entirely blank is a valid skip.
      if (answeredRows === 0) return { ok: true, value: undefined };
      return { ok: true, value };
    }
    case "years": {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string"))
        return { ok: false, error: "Expected a list of years" };
      const seen = new Set<string>();
      const years: string[] = [];
      for (const s of raw as string[]) {
        if (!/^\d{4}$/.test(s) || !isValidAttendedYear(Number(s)))
          return { ok: false, error: `${s} isn't a valid AfrikaBurn year` };
        if (!seen.has(s)) {
          seen.add(s);
          years.push(s);
        }
      }
      if (q.required && years.length === 0)
        return { ok: false, error: "Pick at least one year" };
      return { ok: true, value: years };
    }
    case "short_text":
    case "long_text": {
      if (typeof raw !== "string") return { ok: false, error: "Expected text" };
      if (raw.length > q.maxLength)
        return { ok: false, error: `Max ${q.maxLength} characters` };
      if (q.minLength != null && raw.length < q.minLength)
        return { ok: false, error: `At least ${q.minLength} characters` };
      // Narrowed on purpose: `long_text` shares this arm but has no `format`,
      // and a paragraph is never format-checked.
      if (q.kind === "short_text") {
        const formatError = checkTextFormat(q.format, raw, {
          min: q.min,
          max: q.max,
        });
        if (formatError) return { ok: false, error: formatError };
      }
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
    case "toggle":
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
    default: {
      // Exhaustiveness guard: a new member of the `Question` union without a
      // case above is a compile error here. The declared return type is a
      // union of object shapes, so without this arm a new kind would fall off
      // the end, return `undefined`, and be read by every caller as "no error"
      // — a validator that silently accepts anything. Throwing names the kind.
      const _exhaustive: never = q;
      throw new Error(
        `Unhandled question kind: ${String((_exhaustive as Question).kind)}`,
      );
    }
  }
}
