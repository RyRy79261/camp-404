import {
  displayResponseValue,
  type Question,
  type QuestionnaireResponses,
  type QuestionnaireResponseValue,
} from "@camp404/types";

import { csvFilenamePart, toCsvFile, CSV_MIME, type CsvCell } from "./csv";

// The questionnaire half of the CSV export: turn a set of respondents into the
// rectangle ./csv serialises. All the spreadsheet mechanics (BOM, CRLF, quote
// doubling, formula neutralisation) live there; nothing in this file re-does
// any of it.
//
// One label path. Every answered cell goes through `displayResponseValue` —
// the same function the screen renders — so a captain reading the CSV and a
// captain reading the results page can never see different words for the same
// stored value. There is deliberately no option-label map in this file.
//
// The year is not optional. `questionnaire_responses.cycle` is the burn year,
// and a `fresh` questionnaire grows a NEW row each year while `carry` keeps one
// row a member amends forever. An export that blended two years without saying
// so would be worse than no export, so the year appears twice: in the filename,
// and as a per-row column. A row from another year is therefore visible as
// data, never silently merged.

/** One member's answers, as the export needs them. */
export interface QuestionnaireCsvRespondent {
  /** Display name, exactly as the roster shows it. */
  name: string;
  /** The burn year these answers belong to (`questionnaire_responses.cycle`). */
  cycle: number;
  /** The definition version this member actually answered. */
  definitionVersion: string;
  /** `completedAt`, or null while the member is still mid-form. */
  submittedAt: Date | null;
  responses: QuestionnaireResponses;
}

export interface QuestionnaireCsvInput {
  /**
   * The questionnaire's fields in document order. Callers hold a
   * `BuilderQuestionnaire` and pass `flattenBuilderQuestions(def)`; the legacy
   * shape passes `flattenQuestions(def)`. Taking the flat list keeps this
   * module out of the builder-vs-legacy split.
   */
  questions: readonly Question[];
  respondents: readonly QuestionnaireCsvRespondent[];
}

export interface QuestionnaireCsvExportInput extends QuestionnaireCsvInput {
  /** The definition key — names the file. */
  questionnaireKey: string;
  /** The burn year being exported — also names the file. */
  cycle: number;
}

/** A ready-to-download file. */
export interface QuestionnaireCsvExport {
  filename: string;
  content: string;
  mimeType: string;
}

/**
 * What an unanswered question renders as — the same sentinel
 * `displayResponseValue` returns, shared so the CSV, the viewer and the screen
 * agree on what "asked, not answered" looks like.
 */
export const EMPTY_ANSWER = "—";

/**
 * How a field with no question behind it is labelled. One vocabulary: the CSV
 * appends the parenthesised form to the column header, the viewer badges the
 * bare form.
 */
export const ORPHAN_LABEL = "removed question";

/** Header suffix on a column whose question is gone from the definition. */
export const ORPHAN_COLUMN_SUFFIX = `(${ORPHAN_LABEL})`;

const FIXED_HEADERS = ["Member", "Year", "Submitted", "Version"] as const;

/**
 * Render a stored value that has NO question behind it any more — the captain
 * deleted the field after someone had already answered it.
 *
 * Robustness property 2: such an answer must SURFACE, not vanish. Without a
 * question there are no option labels to resolve, so this is the raw stored
 * value formatted the way `displayResponseValue`'s fallback arm formats one.
 * It lives here, rather than being written out per-surface, so the CSV and the
 * response viewer show a captain the same string.
 */
export function displayOrphanedAnswer(
  value: QuestionnaireResponseValue | undefined,
): string {
  if (value === undefined || value === null || value === "") return EMPTY_ANSWER;
  if (Array.isArray(value)) {
    return value.length === 0 ? EMPTY_ANSWER : value.join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Field ids that appear in someone's stored answers but in no current question,
 * in first-seen order. Exported because the viewer needs the same list.
 */
export function collectOrphanFieldIds(
  questions: readonly Question[],
  respondents: readonly { responses: QuestionnaireResponses }[],
): string[] {
  const known = new Set(questions.map((q) => q.id));
  const seen: string[] = [];
  for (const respondent of respondents) {
    for (const fieldId of Object.keys(respondent.responses)) {
      if (known.has(fieldId)) continue;
      if (seen.includes(fieldId)) continue;
      seen.push(fieldId);
    }
  }
  return seen;
}

// Two blocks can carry the same prompt, and a header row of identical strings
// is unreadable. Disambiguate by appending the field id — but only where the
// prompt actually repeats, so the common case stays clean.
function questionHeaders(questions: readonly Question[]): string[] {
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.prompt, (counts.get(q.prompt) ?? 0) + 1);
  }
  return questions.map((q) =>
    (counts.get(q.prompt) ?? 0) > 1 ? `${q.prompt} (${q.id})` : q.prompt,
  );
}

/**
 * The full rectangle: one header row, then one row per respondent.
 *
 * Column order is `Member, Year, Submitted, Version`, then every current
 * question in document order, then one column per orphaned field.
 *
 * The four robustness properties, in this file:
 *  1. A question added after some people answered has no key in their response
 *     map, so it renders `—` (an honest skip) rather than being dropped.
 *  2. An answer to a deleted question gets its own trailing column.
 *  3. A deleted option keeps its row — `displayResponseValue` falls back to the
 *     raw stored value when no option matches.
 *  4. An out-of-range scale value is likewise printed as itself, never clamped.
 */
export function buildQuestionnaireCsvRows(
  input: QuestionnaireCsvInput,
): CsvCell[][] {
  const { questions, respondents } = input;
  const orphanIds = collectOrphanFieldIds(questions, respondents);

  const header: CsvCell[] = [
    ...FIXED_HEADERS,
    ...questionHeaders(questions),
    ...orphanIds.map((id) => `${id} ${ORPHAN_COLUMN_SUFFIX}`),
  ];

  const rows = respondents.map((respondent): CsvCell[] => [
    respondent.name,
    respondent.cycle,
    respondent.submittedAt ? respondent.submittedAt.toISOString() : "",
    respondent.definitionVersion,
    ...questions.map((q) => displayResponseValue(q, respondent.responses[q.id])),
    ...orphanIds.map((id) => displayOrphanedAnswer(respondent.responses[id])),
  ]);

  return [header, ...rows];
}

/**
 * The exact string to write to a `.csv` file or hand to a `Blob` — BOM, CRLF
 * and all. A questionnaire nobody has answered still produces a header row, so
 * the downloaded file explains itself instead of being zero bytes.
 */
export function buildQuestionnaireCsv(input: QuestionnaireCsvInput): string {
  return toCsvFile(buildQuestionnaireCsvRows(input));
}

/**
 * `<key>-<year>-responses.csv`. The year is in the name so two exports of the
 * same questionnaire never overwrite each other in a downloads folder, and so a
 * file that has left the app still says which year it is.
 */
export function questionnaireCsvFilename(
  questionnaireKey: string,
  cycle: number,
): string {
  return `${csvFilenamePart(questionnaireKey)}-${cycle}-responses.csv`;
}

/** Filename + content + MIME in one call — everything a download route needs. */
export function buildQuestionnaireCsvExport(
  input: QuestionnaireCsvExportInput,
): QuestionnaireCsvExport {
  return {
    filename: questionnaireCsvFilename(input.questionnaireKey, input.cycle),
    content: buildQuestionnaireCsv(input),
    mimeType: CSV_MIME,
  };
}
