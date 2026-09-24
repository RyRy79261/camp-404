// What a member's SAVE does beyond `validateSubmission` (./questionnaire-
// runtime): bound a draft that is not validated, and copy the answers a
// definition marks for the app's own tables. Camp 404's rules, carried onto the
// unified model.
//
// Pure — no I/O, no env.

import {
  PARTICIPATION_INTENTS,
  QuestionnaireResponses,
  isBuilderRole,
  type ParticipationIntent,
  type DietaryMirror,
  type DriverMirror,
  type Questionnaire,
  type RoleMirror,
} from "@camp404/types";
import { allQuestions, visibleQuestions } from "./questionnaire-runtime";

// --- Draft (non-final) saves ---------------------------------------------
// A partial save can't be validated per question — the respondent hasn't
// finished — but it must still be bounded: a server action accepts whatever the
// client posts and the result lands verbatim in a JSONB column. Sized for text
// answers. `.length` on the serialized JSON is UTF-16 units, not bytes —
// deliberately dependency- and Buffer-free so this module stays runtime-neutral.

/** The most answers one draft may carry. */
export const MAX_DRAFT_KEYS = 500;
/** The largest a draft may be, as serialized JSON, in UTF-16 units. */
export const MAX_DRAFT_JSON_LENGTH = 128 * 1024;

/**
 * Bound an unvalidated draft against its definition: structurally parse it,
 * drop every key that is not one of the definition's question ids (content
 * blocks take no answer), and refuse it outright past the key-count /
 * serialized-length caps. Per-question and required checks deliberately do NOT
 * run — a draft may be incomplete and wrong — but nothing outside the
 * definition, and nothing unbounded, reaches storage.
 */
export function boundDraftResponses(
  questionnaire: Questionnaire,
  raw: unknown,
):
  | { ok: true; responses: QuestionnaireResponses }
  | { ok: false; error: string } {
  const parsed = QuestionnaireResponses.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Malformed response payload" };
  }
  const entries = Object.entries(parsed.data);
  if (entries.length > MAX_DRAFT_KEYS) {
    return { ok: false, error: "Too many answers" };
  }
  const allowed = new Set(allQuestions(questionnaire).map((q) => q.id));
  const responses: QuestionnaireResponses = {};
  for (const [key, value] of entries) {
    if (allowed.has(key)) responses[key] = value;
  }
  if (JSON.stringify(responses).length > MAX_DRAFT_JSON_LENGTH) {
    return { ok: false, error: "Answers are too large" };
  }
  return { ok: true, responses };
}

// --- Role mirrors ----------------------------------------------------------
// A captain marks a question with a builder role (BUILDER_ROLES in
// @camp404/types), and a final submit copies the answer into
// dietary_requirements or this year's driver_profiles row, which the roster,
// the export and the "drivers" audience already read. A participation_intent
// answer sets the member's camp_participations row for the send's year.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A date answer ("2027-04-26") as the start of that day in UTC, or null. */
function dayAnswer(value: unknown): Date | null {
  if (typeof value !== "string" || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function intentAnswer(value: unknown): ParticipationIntent | null {
  return (PARTICIPATION_INTENTS as readonly unknown[]).includes(value)
    ? (value as ParticipationIntent)
    : null;
}

function textAnswer(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The domain-table facts a submitted questionnaire carries. Every role question
 * in the definition writes its column: its answer when the member was ASKED it
 * — shown, on the path their answers walk — and empty (null, or false for a
 * yes/no) when it was hidden, branched past or left unanswered, so a member who
 * now says "no allergies" does not keep last year's list. A questionnaire with
 * no role question writes nothing.
 *
 * The one exception is participation_intent: it writes only a Yes, Maybe or
 * No the member was asked and gave. A hidden, unanswered or unknown answer
 * leaves `participation` null, so nothing is written: a missing answer never
 * takes a member's place away.
 */
export function questionnaireRoleMirror(
  definition: Questionnaire,
  responses: QuestionnaireResponses,
): RoleMirror {
  const asked = new Set(
    visibleQuestions(definition, responses).map((q) => q.id),
  );
  const dietary: DietaryMirror = {};
  const driver: DriverMirror = {};
  let participation: RoleMirror["participation"] = null;
  for (const q of allQuestions(definition)) {
    const role = "role" in q ? q.role : undefined;
    if (!isBuilderRole(role)) continue;
    const value = asked.has(q.id) ? responses[q.id] : undefined;
    switch (role) {
      case "dietary_allergies":
        dietary.allergies = textAnswer(value);
        break;
      case "dietary_notes":
        dietary.notes = textAnswer(value);
        break;
      case "dietary_anaphylactic":
        dietary.isAnaphylactic = value === true;
        break;
      case "driving_this_year":
        driver.intendsToDrive = value === true;
        break;
      case "arrival_date":
        driver.arrivalAt = dayAnswer(value);
        break;
      case "departure_date":
        driver.departureAt = dayAnswer(value);
        break;
      case "participation_intent": {
        const intent = intentAnswer(value);
        if (intent) participation = { intent };
        break;
      }
    }
  }
  return {
    dietary: Object.keys(dietary).length > 0 ? dietary : null,
    driver: Object.keys(driver).length > 0 ? driver : null,
    participation,
  };
}
