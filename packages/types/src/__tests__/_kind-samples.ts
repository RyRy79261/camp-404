// --- The question-kind exhaustiveness fixture -----------------------------
//
// `Question` is a 14-arm discriminated union, and both `validateOne` and (from
// Wave 3 on) the results engine switch over it. A kind that nobody remembered
// to handle does not announce itself: the switch simply falls through.
//
// This fixture is the mechanical link that makes forgetting impossible. It is
// pinned to the union in TWO independent ways, on purpose:
//
//   1. COMPILE TIME — `KIND_SAMPLES` is a mapped type over `Question["kind"]`,
//      so a fifteenth member of the union makes this file fail to compile with
//      a missing-property error naming the new kind.
//   2. RUN TIME — `QUESTION_KINDS` is read off the zod schema itself
//      (`Question.options`), never hand-listed, and `question-kinds.test.ts`
//      asserts it matches the keys of `KIND_SAMPLES` in both directions. So a
//      kind added to the schema but not to this map fails the suite even where
//      structural typing would have let it slide.
//
// Never replace either link with a hand-maintained array of kind strings. A
// list that has to be remembered is exactly the thing this fixture exists to
// remove.

import { Question, type QuestionnaireResponseValue } from "../questionnaire";

/** Every discriminant value of the `Question` union. */
export type QuestionKind = Question["kind"];

/** The union member carrying a given `kind`. */
export type QuestionOfKind<K extends QuestionKind> = Extract<
  Question,
  { kind: K }
>;

export interface KindSample<K extends QuestionKind> {
  /** A valid question of this kind — parses cleanly under `Question`. */
  question: QuestionOfKind<K>;
  /** An answer `validateOne` must accept for `question`. */
  valid: QuestionnaireResponseValue;
  /**
   * An answer `validateOne` must REJECT for `question`. Never `undefined`,
   * `null` or `""` — those short-circuit as "missing" before the switch is
   * reached, so using one would make the rejection test pass without ever
   * exercising the kind's own arm. `question-kinds.test.ts` asserts this.
   */
  invalid: unknown;
  /** Substring of the error `validateOne` must return for `invalid`. */
  invalidError: string;
}

/**
 * Every question kind the wizard can render, with a sample question and a
 * valid / invalid answer for it.
 *
 * Every sample sets `required: true` — including the kinds whose schema
 * default is `false` — so the shared "a missing answer to a required question
 * is rejected" assertion can run uniformly across all fourteen.
 *
 * The mapped type is the point: adding a member to `Question` without adding
 * an entry here is a compile error.
 */
export const KIND_SAMPLES: { [K in QuestionKind]: KindSample<K> } = {
  slider: {
    question: {
      id: "k_slider",
      kind: "slider",
      prompt: "How many burns?",
      min: 0,
      max: 10,
      step: 1,
      required: true,
    },
    valid: 7,
    invalid: 11,
    invalidError: "between 0 and 10",
  },
  number: {
    question: {
      id: "k_number",
      kind: "number",
      prompt: "How keen on the kitchen?",
      min: 0,
      max: 6,
      required: true,
    },
    valid: 4,
    invalid: 3.5,
    invalidError: "whole number",
  },
  single_select: {
    question: {
      id: "k_single_select",
      kind: "single_select",
      prompt: "Membership tier?",
      options: [
        { value: "full", label: "Full" },
        { value: "build_week_only", label: "Build week only" },
      ],
      required: true,
    },
    valid: "full",
    invalid: "spectator",
    invalidError: "valid option",
  },
  multi_select: {
    question: {
      id: "k_multi_select",
      kind: "multi_select",
      prompt: "Dietary requirements?",
      options: [
        { value: "vegan", label: "Vegan" },
        { value: "gluten_free", label: "Gluten free" },
      ],
      required: true,
    },
    valid: ["vegan"],
    // A bare string, not a list — the shape check fires before the allow-list
    // filter, which silently drops unknown members rather than erroring.
    invalid: "vegan",
    invalidError: "list of choices",
  },
  short_text: {
    question: {
      id: "k_short_text",
      kind: "short_text",
      prompt: "Camp name",
      maxLength: 20,
      required: true,
    },
    valid: "Sparkle",
    invalid: "x".repeat(21),
    invalidError: "Max 20 characters",
  },
  long_text: {
    question: {
      id: "k_long_text",
      kind: "long_text",
      prompt: "Anything we should know?",
      maxLength: 50,
      required: true,
    },
    valid: "Bringing a shade structure and two spare tents.",
    invalid: "x".repeat(51),
    invalidError: "Max 50 characters",
  },
  date: {
    question: {
      id: "k_date",
      kind: "date",
      prompt: "Arrival date?",
      required: true,
    },
    valid: "2026-08-31",
    // Day-first, the format a human types and `<input type="date">` never
    // emits. Rejected on the yyyy-mm-dd shape check.
    invalid: "31/08/2026",
    invalidError: "yyyy-mm-dd",
  },
  scale: {
    question: {
      id: "k_scale",
      kind: "scale",
      prompt: "Cooking competency?",
      steps: [
        { value: "lead", label: "Can run a meal" },
        { value: "hands", label: "Happy to chop" },
        { value: "none", label: "Keep me away" },
      ],
      required: true,
    },
    valid: "hands",
    invalid: "michelin",
    invalidError: "valid level",
  },
  toggle: {
    question: {
      id: "k_toggle",
      kind: "toggle",
      prompt: "Camping in a vehicle?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      required: true,
    },
    valid: "no",
    invalid: "maybe",
    invalidError: "valid option",
  },
  combobox: {
    question: {
      id: "k_combobox",
      kind: "combobox",
      prompt: "Flying in from?",
      options: [
        { value: "nz", label: "New Zealand" },
        { value: "au", label: "Australia" },
      ],
      required: true,
    },
    valid: "nz",
    invalid: "atlantis",
    invalidError: "valid option",
  },
  image: {
    question: {
      id: "k_image",
      kind: "image",
      prompt: "Profile photo",
      required: true,
    },
    valid: "https://blob.example/burner.png",
    // The only thing this arm checks is that the stored value is a string —
    // it is a blob URL the uploader produced, not user-typed text.
    invalid: 42,
    invalidError: "image URL",
  },
  boolean: {
    question: {
      id: "k_boolean",
      kind: "boolean",
      prompt: "Bringing a bike?",
      required: true,
    },
    valid: true,
    // A stringly-typed "yes" is the realistic bug: a form serialiser that
    // forgot to coerce. It must not be quietly accepted as truthy.
    invalid: "yes",
    invalidError: "yes or no",
  },
  email: {
    question: {
      id: "k_email",
      kind: "email",
      prompt: "Email address?",
      required: true,
    },
    valid: "burner@camp404.example",
    invalid: "burner-at-camp404",
    invalidError: "valid email address",
  },
  phone: {
    question: {
      id: "k_phone",
      kind: "phone",
      prompt: "Phone number?",
      required: true,
    },
    valid: "+64 21 555 0100",
    // Six digits — under the 7-digit E.164 floor, but it matches PHONE_RE's
    // character class, so only the digit-count check catches it.
    invalid: "555100",
    invalidError: "valid phone number",
  },
};

/**
 * The kinds the `Question` schema actually declares, read off the zod
 * discriminated union at run time. Deliberately derived rather than written
 * out: this is the value `KIND_SAMPLES` is checked against, so hand-listing it
 * would defeat the whole fixture.
 */
export const QUESTION_KINDS: QuestionKind[] = Question.options.map(
  (option) => option.shape.kind.value,
);

/** The keys of `KIND_SAMPLES`, typed as kinds rather than plain strings. */
export const SAMPLED_KINDS = Object.keys(KIND_SAMPLES) as QuestionKind[];

/** Every sample as a flat list, for table-driven `it.each` blocks. */
export const KIND_SAMPLE_ENTRIES: Array<
  [QuestionKind, KindSample<QuestionKind>]
> = Object.entries(KIND_SAMPLES) as Array<
  [QuestionKind, KindSample<QuestionKind>]
>;
