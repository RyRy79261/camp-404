// Questionnaire RUNTIME. Everything a runner needs to decide *what a respondent
// sees next* and *whether they are done*, derived purely from a definition +
// the answers so far. The server re-derives the same things at submit time, so
// a respondent cannot skip a required question by posting a hand-made payload.
//
// Ported from AB's `questionnaire-runtime.ts` and extended for the unified
// model, which carries BOTH branching mechanisms:
//
//   * Page routing (AB, Google Forms): a page's target is chosen by the LAST
//     answered single-choice question on that page whose selected option
//     carries a `goTo`. Failing that, the page's own `next`. Failing that, the
//     following page in document order — and past the last page, submit.
//   * Visibility (Camp 404's `visibleIf`): a page, question or content block
//     whose condition does not hold is hidden in place. A hidden page is
//     skipped — it is not on the path, its questions route nothing, and the
//     walk continues from its fall-through (`next`, else the following page).
//     A hidden question on a visible page is not asked, and its `goTo` does
//     not fire.
//
// Answers to hidden questions follow Camp 404's rule, not AB's: a hidden
// question is never REQUIRED, but a valid answer to it is RETAINED (re-showing
// it restores what was typed) — never pruned merely for being hidden, never
// trusted merely for being hidden (it must still pass `validateOne`).
//
// Pure — no I/O, no env, no randomness that isn't seeded.

import {
  QuestionnaireResponses,
  SUBMIT_TARGET,
  evalVisibleIf,
  pageBlocks,
  pageQuestions,
  validateOne,
  type PageBlock,
  type Question,
  type QuestionOption,
  type Questionnaire,
  type QuestionnairePage,
} from "@camp404/types";

/** Look one page up by id. */
export function pageById(
  questionnaire: Questionnaire,
  pageId: string,
): QuestionnairePage | null {
  return questionnaire.pages.find((p) => p.id === pageId) ?? null;
}

/** Whether a page is shown under these answers. Intro pages always are. */
export function isPageVisible(
  page: QuestionnairePage,
  responses: QuestionnaireResponses,
): boolean {
  if (page.kind !== "questions" || !page.visibleIf) return true;
  return evalVisibleIf(page.visibleIf, responses);
}

/** Whether a block (a question or a content block) is shown under these
 * answers, judged on its own condition — the page's is separate. */
export function isBlockVisible(
  block: PageBlock,
  responses: QuestionnaireResponses,
): boolean {
  return block.visibleIf ? evalVisibleIf(block.visibleIf, responses) : true;
}

/** A page's shown blocks, in document order: none when the page is hidden. */
export function visibleBlocks(
  page: QuestionnairePage,
  responses: QuestionnaireResponses,
): PageBlock[] {
  if (!isPageVisible(page, responses)) return [];
  return pageBlocks(page).filter((block) => isBlockVisible(block, responses));
}

/** A page's shown questions, in document order. */
function visiblePageQuestions(
  page: QuestionnairePage,
  responses: QuestionnaireResponses,
): Question[] {
  if (!isPageVisible(page, responses)) return [];
  return pageQuestions(page).filter((q) => isBlockVisible(q, responses));
}

/**
 * Where the walk goes after the page at `index`, before visibility of the
 * TARGET is considered: a shown branching answer, else `next`, else the
 * following page. Null for submit, the end, or a target that does not exist.
 */
function routeFrom(
  questionnaire: Questionnaire,
  index: number,
  responses: QuestionnaireResponses,
): string | null {
  const page = questionnaire.pages[index];
  if (!page) return null;

  // Last branching question on the page wins — among the questions shown.
  let branched: string | null = null;
  for (const question of visiblePageQuestions(page, responses)) {
    if (question.kind !== "single_select") continue;
    const answer = responses[question.id];
    if (typeof answer !== "string") continue;
    const chosen = question.options.find((o) => o.value === answer);
    if (chosen?.goTo) branched = chosen.goTo;
  }

  const following = questionnaire.pages[index + 1];
  const target = branched ?? page.next ?? following?.id ?? null;
  if (target === SUBMIT_TARGET || target === null) return null;
  return pageById(questionnaire, target) ? target : null;
}

/**
 * The next SHOWN page id after `pageId` given the answers so far, or null when
 * the questionnaire ends here (submit). Hidden pages in between are skipped by
 * their fall-through.
 */
export function nextPageId(
  questionnaire: Questionnaire,
  pageId: string,
  responses: QuestionnaireResponses,
): string | null {
  const index = questionnaire.pages.findIndex((p) => p.id === pageId);
  if (index < 0) return null;
  return firstShownFrom(
    questionnaire,
    routeFrom(questionnaire, index, responses),
    responses,
    new Set([pageId]),
  );
}

/** `target`, or — when it is hidden — the first shown page its fall-through
 * reaches. The `seen` guard turns a hand-edited loop into an early submit. */
function firstShownFrom(
  questionnaire: Questionnaire,
  target: string | null,
  responses: QuestionnaireResponses,
  seen: Set<string>,
): string | null {
  let current = target;
  while (current !== null) {
    const index = questionnaire.pages.findIndex((p) => p.id === current);
    const page = questionnaire.pages[index];
    if (!page) return null;
    if (isPageVisible(page, responses)) return current;
    if (seen.has(current)) return null;
    seen.add(current);
    current = routeFrom(questionnaire, index, responses);
  }
  return null;
}

/** The first shown page id, or null when nothing is shown at all. */
export function firstPageId(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
): string | null {
  const first = questionnaire.pages[0];
  if (!first) return null;
  return firstShownFrom(questionnaire, first.id, responses, new Set());
}

/**
 * The ordered page ids a respondent actually walks given their answers — the
 * branch- and visibility-resolved path from the first shown page to submit.
 *
 * Loops are rejected at definition time (branches must move forward), but this
 * still carries a visited-set guard so a legacy or hand-edited definition
 * degrades into a truncated path instead of hanging the server.
 */
export function resolvePath(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = firstPageId(questionnaire, responses);
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    path.push(current);
    current = nextPageId(questionnaire, current, responses);
  }
  return path;
}

/** The answerable questions a respondent is asked — shown questions on the
 * resolved path — in walk order. */
export function visibleQuestions(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
): Question[] {
  const out: Question[] = [];
  for (const pageId of resolvePath(questionnaire, responses)) {
    const page = pageById(questionnaire, pageId);
    if (page) out.push(...visiblePageQuestions(page, responses));
  }
  return out;
}

/** True when a question has a usable answer (present AND valid for its kind). */
export function hasAnswer(question: Question, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  const result = validateOne(question, value);
  return result.ok && result.value !== undefined;
}

/** Progress/completeness derivation — feeds the runner's progress bar and the
 * results view's "who is actually done". Counts only the questions a
 * respondent is asked; a required question on a page they branched past, or
 * one hidden by its condition, can never block them. */
export interface QuestionnaireProgress {
  /** Branch-resolved page ids, in walk order. */
  path: string[];
  /** Index of `currentPageId` within `path`, or -1 when not on the path. */
  pageIndex: number;
  pageCount: number;
  answered: number;
  total: number;
  requiredAnswered: number;
  requiredTotal: number;
  /** 0–100, by required completion (falls back to overall when nothing is
   * required, and to 100 for an empty questionnaire). */
  percent: number;
  /** Every required question the respondent is asked has a valid answer. */
  complete: boolean;
}

export function deriveProgress(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
  currentPageId?: string,
): QuestionnaireProgress {
  const path = resolvePath(questionnaire, responses);
  let answered = 0;
  let total = 0;
  let requiredAnswered = 0;
  let requiredTotal = 0;

  for (const pageId of path) {
    const page = pageById(questionnaire, pageId);
    if (!page) continue;
    for (const question of visiblePageQuestions(page, responses)) {
      const ok = hasAnswer(question, responses[question.id]);
      total += 1;
      if (ok) answered += 1;
      if (isRequired(question)) {
        requiredTotal += 1;
        if (ok) requiredAnswered += 1;
      }
    }
  }

  const denominator = requiredTotal > 0 ? requiredTotal : total;
  const numerator = requiredTotal > 0 ? requiredAnswered : answered;
  const percent =
    denominator === 0 ? 100 : Math.round((numerator / denominator) * 100);

  return {
    path,
    pageIndex: currentPageId ? path.indexOf(currentPageId) : -1,
    pageCount: path.length,
    answered,
    total,
    requiredAnswered,
    requiredTotal,
    percent,
    complete: requiredAnswered === requiredTotal,
  };
}

function isRequired(question: Question): boolean {
  return "required" in question && question.required === true;
}

/**
 * Server-side response validation for a SUBMIT, branch- and visibility-aware.
 *
 * Differs from `@camp404/types`' `validateResponses` (which validates every
 * question in the definition) in one way that matters: only the questions the
 * respondent is ASKED — shown questions on the resolved path — are validated
 * and required. Every other question keeps a valid answer and silently loses
 * an invalid one (Camp 404's retention rule; AB drops them all). Unknown keys
 * are dropped, and a payload that is not a response map is refused whole.
 *
 * The path is resolved against the posted answers, exactly as the respondent's
 * runner resolved it: a `goTo` only fires on a value that matches an option
 * (so only on a valid answer — AB's rule), and a `visibleIf` reads the posted
 * value (Camp 404's `validateBuilderResponses` rule, kept so a builder
 * definition shows and requires exactly what it did).
 */
export function validateSubmission(
  questionnaire: Questionnaire,
  raw: unknown,
):
  | {
      ok: true;
      responses: QuestionnaireResponses;
      progress: QuestionnaireProgress;
    }
  | { ok: false; errors: Record<string, string> } {
  const parsed = QuestionnaireResponses.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: { _root: "Malformed response payload" } };
  }
  const incoming = parsed.data;

  // Every individually valid answer, in document order: an asked question's
  // (or it errors below) and a hidden question's alike.
  const responses: QuestionnaireResponses = {};
  for (const question of allQuestions(questionnaire)) {
    const result = validateOne(question, incoming[question.id]);
    if (result.ok && result.value !== undefined) {
      responses[question.id] = result.value;
    }
  }

  const errors: Record<string, string> = {};
  for (const question of visibleQuestions(questionnaire, incoming)) {
    const result = validateOne(question, incoming[question.id]);
    if (!result.ok) errors[question.id] = result.error;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    responses,
    // Resolved against the same posted answers the checks above used, so the
    // path it reports is the one that was validated.
    progress: deriveProgress(questionnaire, incoming),
  };
}

/** Every answerable question in document order, path-independent. */
export function allQuestions(questionnaire: Questionnaire): Question[] {
  const out: Question[] = [];
  for (const page of questionnaire.pages) out.push(...pageQuestions(page));
  return out;
}

// --- Shuffle -------------------------------------------------------------
// Deterministic, seeded shuffles: a respondent must see a STABLE order across
// page revisits and reloads, so the runner passes a per-response seed (e.g.
// the user id) rather than calling Math.random.

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 — deterministic and dependency-free.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const j = state % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/** A page's blocks in presentation order — shuffled when the page asks for
 * it, document order otherwise. Visibility is separate (`visibleBlocks`). */
export function presentationBlocks(
  page: QuestionnairePage,
  seed: string,
): PageBlock[] {
  const blocks = pageBlocks(page);
  if (page.kind !== "questions" || !page.shuffleQuestions) return blocks;
  return seededShuffle(blocks, `${seed}:${page.id}`);
}

/** A choice question's options in presentation order — shuffled when the
 * question asks for it. Options carrying a `goTo` shuffle like any other; the
 * branch follows the VALUE, never the position. */
export function presentationOptions(
  question: Question,
  seed: string,
): QuestionOption[] {
  if (question.kind !== "single_select" && question.kind !== "multi_select") {
    return [];
  }
  if (!question.shuffleOptions) return [...question.options];
  return seededShuffle(question.options, `${seed}:${question.id}`);
}
