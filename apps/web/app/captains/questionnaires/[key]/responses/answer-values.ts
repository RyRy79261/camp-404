import { displayOrphanedAnswer } from "@camp404/core";
import {
  displayResponseValue,
  type Question,
  type QuestionnaireResponses,
  type QuestionnaireResponseValue,
} from "@camp404/types";
import type { Respondent } from "../metrics/results-data";

// The COLUMN MODEL for the answers table: which fields get a column, and what
// one member's answer reads as in a cell.
//
// It owns no label logic of its own. A live question renders through
// `displayResponseValue` (@camp404/types) and an orphaned one through
// `displayOrphanedAnswer` (@camp404/core) — the same two functions the CSV
// export and the response viewer call, so the table, the download and the
// per-member page can never disagree about what somebody said.
//
// The CSV grid is NOT built here. It comes from `buildQuestionnaireCsvExport`
// in @camp404/core, which adds the year and the answered-version columns this
// screen shows as page furniture.

/** A column of the answers table: a current question, or an orphaned answer. */
export interface AnswerColumn {
  /** The response-map key. */
  id: string;
  label: string;
  /** Null when the questionnaire no longer has this question. */
  question: Question | null;
}

function isEmpty(value: QuestionnaireResponseValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * The columns to print: every current question in document order, then every
 * field the answers still carry that the questionnaire no longer asks.
 *
 * The second half is the point. A published questionnaire can be edited, so
 * removing a question does not remove the answers people already gave it — and
 * a definition-driven column list alone would drop them silently. They get a
 * column, marked as removed.
 */
export function answerColumns(
  questions: Question[],
  respondents: Respondent[],
): AnswerColumn[] {
  const columns: AnswerColumn[] = questions.map((q) => ({
    id: q.id,
    label: q.prompt,
    question: q,
  }));
  const known = new Set(questions.map((q) => q.id));
  const orphans = new Set<string>();
  for (const r of respondents) {
    for (const [fieldId, value] of Object.entries(r.responses)) {
      if (!known.has(fieldId) && !isEmpty(value)) orphans.add(fieldId);
    }
  }
  for (const fieldId of [...orphans].sort()) {
    columns.push({
      id: fieldId,
      label: `${fieldId} (removed)`,
      question: null,
    });
  }
  return columns;
}

/**
 * One member's answer in one column, as text. Empty string for no answer, so
 * the caller decides how a blank reads (a dash on screen, nothing in a CSV).
 *
 * An orphaned answer is printed from the raw stored value: there is no question
 * left to resolve option labels against, and the raw value is still the truth
 * about what they chose.
 */
export function formatAnswer(
  column: AnswerColumn,
  responses: QuestionnaireResponses,
): string {
  const value = responses[column.id];
  if (isEmpty(value)) return "";
  if (column.question) return displayResponseValue(column.question, value);
  // No question left to resolve option labels against, so the raw stored value
  // is the truth about what they chose. Shared with the CSV rather than
  // re-derived, so a captain reading the download and a captain reading the
  // table see the same string.
  return displayOrphanedAnswer(value);
}
