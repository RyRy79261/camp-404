// ===========================================================================
//  DO NOT MODERNISE THIS FILE.
// ===========================================================================
//
// This is a frozen snapshot of a real v1 questionnaire and the response set a
// member submitted against it. Its entire value is that it is OLD. It is a
// regression canary for the persisted shape, not a style exhibit.
//
// Every questionnaire definition and response map already written to the
// database looks like this. They are stored whole as JSONB, so nothing
// migrates them when the schema moves — a definition saved in v1 will still
// be read, validated, diffed and (from Wave 3) aggregated years later, exactly
// as it is written below.
//
// So if a change to `questionnaire.ts` makes this file fail to compile or its
// test fail to pass, that is the fixture WORKING. It is telling you that the
// change is not backwards compatible with rows already in the database, and
// the answer is a migration path or a widened schema — never an edit here.
//
// Specifically, do NOT:
//   * "tidy" a field to a newer name, or drop one that now has a default
//     (a default only fills a field in on the way IN; rows already stored
//     carry the old spelling forever);
//   * re-order pages, questions or options to match a current catalogue;
//   * swap a question to a newer kind that renders more nicely;
//   * refresh the dates, ids, or copy so it "looks current";
//   * regenerate it from whatever the builder emits today.
//
// If you want a fixture that tracks the present shape, add a second one beside
// this (`_frozen-v2.ts`) and leave this one alone. The suite is meant to carry
// both.
//
// Frozen: v1, the pre-builder onboarding questionnaire. Kept verbatim.
// ===========================================================================

import type { Questionnaire, QuestionnaireResponses } from "../questionnaire";

export const FROZEN_V1_QUESTIONNAIRE: Questionnaire = {
  version: "v1",
  pages: [
    {
      id: "welcome",
      kind: "intro",
      heading: "Welcome to Camp 404",
      body: "A few questions so we can plan the year. Nothing here is binding.",
    },
    {
      id: "basics",
      kind: "questions",
      title: "The basics",
      subtitle: "Who we are talking to.",
      questions: [
        {
          id: "playa_name",
          kind: "short_text",
          prompt: "Playa name",
          helper: "Leave it blank if you do not have one yet.",
          maxLength: 40,
          required: false,
        },
        {
          id: "experience",
          kind: "slider",
          prompt: "How many burns have you done?",
          min: 0,
          max: 20,
          step: 1,
          minLabel: "First one",
          maxLabel: "Lost count",
          required: true,
        },
        {
          id: "tier",
          kind: "single_select",
          prompt: "Which membership are you after?",
          options: [
            { value: "full", label: "Full" },
            { value: "build_week_only", label: "Build week only" },
            { value: "strike_only", label: "Strike only" },
          ],
          required: true,
        },
      ],
    },
    {
      id: "contribution",
      kind: "questions",
      title: "What you bring",
      questions: [
        {
          id: "teams",
          kind: "multi_select",
          prompt: "Which teams interest you?",
          options: [
            { value: "kitchen", label: "Kitchen" },
            { value: "build", label: "Build" },
            { value: "power", label: "Power" },
            { value: "sound", label: "Sound" },
          ],
          required: false,
        },
        {
          id: "cooking",
          kind: "scale",
          prompt: "How do you rate your cooking?",
          steps: [
            { value: "lead", label: "I can run a meal for 60" },
            { value: "hands", label: "Happy to be a pair of hands" },
            { value: "none", label: "Keep me away from the stoves" },
          ],
          required: true,
        },
        {
          id: "kitchen_keenness",
          kind: "number",
          prompt: "How keen are you on the kitchen?",
          min: 0,
          max: 6,
          minLabel: "Not for me",
          maxLabel: "Sign me up",
          required: false,
        },
        {
          id: "notes",
          kind: "long_text",
          prompt: "Anything else we should know?",
          placeholder:
            "Allergies, arrival plans, a skill we have not asked about…",
          maxLength: 1000,
          required: false,
        },
      ],
    },
  ],
};

/**
 * A response set submitted against `FROZEN_V1_QUESTIONNAIRE`, exactly as it
 * sits in `burner_profiles.responses` / `questionnaire_responses.answers`.
 * Note what it does NOT contain: `playa_name` and `kitchen_keenness` were left
 * blank, so no key was written at all. An absent key is a real skip, and every
 * consumer has to treat it as one.
 */
export const FROZEN_V1_RESPONSES: QuestionnaireResponses = {
  experience: 3,
  tier: "build_week_only",
  teams: ["kitchen", "power"],
  cooking: "hands",
  notes: "Arriving Thursday of build week with a truck.",
};

/**
 * The human-readable rendering of `FROZEN_V1_RESPONSES`, frozen alongside it.
 * These strings reach members in the edit change log, so a change to any of
 * them is a change to what people have already been shown.
 */
export const FROZEN_V1_DISPLAY: Record<string, string> = {
  playa_name: "—",
  experience: "3",
  tier: "Build week only",
  teams: "Kitchen, Power",
  cooking: "Happy to be a pair of hands",
  kitchen_keenness: "—",
  notes: "Arriving Thursday of build week with a truck.",
};

/** Question ids in questionnaire order. The intro page contributes none. */
export const FROZEN_V1_QUESTION_IDS = [
  "playa_name",
  "experience",
  "tier",
  "teams",
  "cooking",
  "kitchen_keenness",
  "notes",
];
