import {
  flattenQuestions,
  isOtherAnswer,
  type NumberQuestion,
  type Question,
  type Questionnaire,
  type QuestionnaireResponses,
  type QuestionnaireResponseValue,
  type SliderQuestion,
} from "@camp404/types";

// The questionnaire read-back engine (builder Phase E, plan items 3.2 + 3.5).
//
// Two pure functions, no DB and no I/O:
//   - `aggregateResponses` turns a definition + a set of submitted response
//     maps into one aggregate per question;
//   - `tallyActivationCompletion` turns an activation's required-action
//     statuses into a completion figure.
//
// WHAT A CAPTAIN MAY SEE. This module is the whole reason a results screen can
// exist without becoming a surveillance surface, so the boundary is drawn here
// rather than in the view:
//
//   * Free text NEVER leaves as text. `docs/questionnaire-builder.md:400` puts
//     short_text, long_text, email, phone, image and date behind a response
//     COUNT — "12 people answered", never twelve people's sentences. The
//     `count` shape below carries no values at all, by construction: there is
//     no field an incautious view could render.
//   * `other:<typed text>` is free text wearing a choice's clothes. Every such
//     answer collapses into ONE row (`OTHER_ROW_VALUE`), counted and never
//     quoted. A stored `other:` value can reach any string-answered kind —
//     `allowOther` is editable after publish — so the collapse happens before
//     the per-kind arms, exactly as `displayResponseValue` decodes before its.
//   * An answer to a question that no longer exists is counted, never shown.
//     Its kind is gone, so nothing can prove it is not a sentence somebody
//     typed. `OrphanAggregate` therefore carries a count and an id, full stop.
//
// WHAT SURVIVES AN EDIT. A published questionnaire is editable
// (`lifecycle-controls.tsx` permits it explicitly), so every aggregate here is
// built to survive a definition that moved under its own answers:
//
//   1. A question added after some people answered reports honest skips. The
//      per-question denominator is `answered`, and `skipped`/`respondents` sit
//      beside it, so "2 of 30 answered" can never render as "100%".
//   2. An answer whose question was deleted surfaces in `orphans` instead of
//      vanishing out of the totals.
//   3. A deleted option still gets a row, labelled by its raw stored value and
//      flagged `known: false`.
//   4. An out-of-range numeric answer keeps its own bucket, flagged
//      `inRange: false`, rather than being clamped into a neighbour.

/** Every discriminant of the `Question` union. */
export type QuestionKind = Question["kind"];

/** How a kind's answers may be summarised. */
export type AggregateShape = "choice" | "numeric" | "count";

/**
 * The kind → shape routing table, and the exhaustiveness guard for this whole
 * module.
 *
 * It is a mapped type over `Question["kind"]`, so a fifteenth member of the
 * union cannot be added without this file failing to compile with an error
 * naming it — the same mechanical link `_kind-samples.ts` puts on
 * `validateOne`. `aggregateOne` dispatches through this table rather than
 * switching on `q.kind` directly, so the table is load-bearing: it cannot rot
 * into a stale comment while the real routing lives elsewhere.
 *
 * `boolean` routes to `choice` on purpose. It has no `options` array, but a
 * two-row Yes/No breakdown is exactly a choice histogram, and `choiceOptions`
 * supplies the pair — so it needs no arm of its own, and a stringly-typed
 * `"yes"` from a broken serialiser surfaces as an unknown row rather than
 * being coerced to truthy.
 */
export const KIND_SHAPE: { [K in QuestionKind]: AggregateShape } = {
  single_select: "choice",
  multi_select: "choice",
  toggle: "choice",
  combobox: "choice",
  scale: "choice",
  boolean: "choice",
  slider: "numeric",
  number: "numeric",
  short_text: "count",
  long_text: "count",
  date: "count",
  email: "count",
  phone: "count",
  image: "count",
};

/** The single row every `other:<text>` answer collapses into. */
export const OTHER_ROW_VALUE = "other:";
/** Its label. The typed text is never part of an aggregate. */
export const OTHER_ROW_LABEL = "Other…";

/**
 * The widest declared numeric range that is enumerated into zero-count
 * buckets. Above it a histogram stops being readable, so only observed values
 * get rows and `NumericAggregate.enumerated` says so.
 */
export const MAX_ENUMERATED_BUCKETS = 51;

/** Fields shared by every per-question aggregate. */
export interface AggregateBase {
  questionId: string;
  /** The prompt as it reads in the CURRENT definition. */
  prompt: string;
  kind: QuestionKind;
  /** Response maps considered — the size of the input set. */
  respondents: number;
  /** Respondents whose answer to THIS question was non-empty. */
  answered: number;
  /** `respondents - answered`. Property 1 lives here. */
  skipped: number;
  /** `answered / respondents`, 0-100, whole. 0 when nobody responded. */
  answeredPct: number;
}

/** One value's line in a choice breakdown. */
export interface ChoiceRow {
  /** The stored value. `OTHER_ROW_VALUE` for the collapsed free-text row. */
  value: string;
  /** The option's label, or the raw value when the option is gone. */
  label: string;
  count: number;
  /** `count / answered`, 0-100, whole. */
  pct: number;
  /** False when the definition no longer declares this value (property 3). */
  known: boolean;
}

export interface ChoiceAggregate extends AggregateBase {
  shape: "choice";
  /** True for `multi_select`: one respondent contributes several rows. */
  multi: boolean;
  /**
   * Declared options in declared order (zero-count ones included, so "nobody
   * picked this" is visible), then any undeclared stored values, id-ascending.
   */
  rows: ChoiceRow[];
  /** Sum of `rows[].count`. Exceeds `answered` for a multi-select. */
  totalSelections: number;
}

/** One numeric value's line in a distribution. */
export interface NumericBucket {
  value: number;
  count: number;
  /** `count / samples`, 0-100, whole. */
  pct: number;
  /** False when outside the question's declared min/max (property 4). */
  inRange: boolean;
}

export interface NumericAggregate extends AggregateBase {
  shape: "numeric";
  /** Answered values that were finite numbers — the stats' denominator. */
  samples: number;
  /** `answered - samples`: non-numeric answers, surfaced rather than dropped. */
  unparsed: number;
  /** Observed extremes and centre, `null` when there are no samples. */
  min: number | null;
  max: number | null;
  /** Rounded to 2dp. */
  mean: number | null;
  /** Rounded to 2dp; the mean of the middle pair when `samples` is even. */
  median: number | null;
  /** Ascending. Includes zero-count declared steps iff `enumerated`. */
  buckets: NumericBucket[];
  /** True when the declared range was small enough to enumerate. */
  enumerated: boolean;
}

/**
 * A kind whose answers are free text (or a URL, or a date that reads as one
 * person's plan). A count and nothing else — there is deliberately no field
 * here for a value, so no view can leak one.
 */
export interface CountAggregate extends AggregateBase {
  shape: "count";
}

export type QuestionAggregate =
  | ChoiceAggregate
  | NumericAggregate
  | CountAggregate;

/**
 * An answer to a question the definition no longer has (property 2). Counted
 * so the captain knows the answers exist; never valued, because the kind is
 * gone and nothing can rule out free text.
 */
export interface OrphanAggregate {
  questionId: string;
  answered: number;
  respondents: number;
}

export interface ResponseAggregate {
  respondents: number;
  /** One per question, in questionnaire order. */
  questions: QuestionAggregate[];
  /** Response keys with no question, id-ascending. */
  orphans: OrphanAggregate[];
}

/** A whole percentage, or 0 rather than NaN when nothing was counted. */
function percent(count: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((count / denominator) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Kill float drift so `0.1 + 0.2` and a stored `0.30000000000000004` land in
 * the same bucket. Six places is far finer than any slider step a builder can
 * author and far coarser than the error it removes.
 */
function bucketKey(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Whether a stored value counts as an answer.
 *
 * Written against the three empty shapes explicitly, never as a falsy test:
 * `0` is a real slider answer and `false` is a real boolean one, and both are
 * falsy.
 */
function isAnswered(value: QuestionnaireResponseValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * The declared options for a choice-shaped question, normalised to one field
 * name. `scale` spells them `steps`; `boolean` has none and gets the fixed
 * Yes/No pair that its two stored values render as.
 */
function choiceOptions(
  question: Question,
): ReadonlyArray<{ value: string; label: string }> {
  switch (question.kind) {
    case "scale":
      return question.steps;
    case "boolean":
      return [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ];
    case "single_select":
    case "multi_select":
    case "toggle":
    case "combobox":
      return question.options;
    default:
      return [];
  }
}

/**
 * One respondent's answer as the list of choice values it contributes.
 *
 * Every `other:` answer becomes `OTHER_ROW_VALUE`, so the typed text is
 * discarded at the boundary rather than carried further in. Values repeated
 * inside one respondent's multi-select are de-duplicated: one person picking
 * "kitchen" twice is one person who picked the kitchen.
 */
function choiceSelections(value: QuestionnaireResponseValue): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of raw) {
    if (entry === null || entry === "") continue;
    const key = isOtherAnswer(entry) ? OTHER_ROW_VALUE : String(entry);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

function aggregateChoice(
  question: Question,
  base: AggregateBase,
  answers: QuestionnaireResponseValue[],
): ChoiceAggregate {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    for (const value of choiceSelections(answer)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const declared = choiceOptions(question);
  const declaredValues = new Set(declared.map((option) => option.value));
  const rows: ChoiceRow[] = declared.map((option) => ({
    value: option.value,
    label: option.label,
    count: counts.get(option.value) ?? 0,
    pct: percent(counts.get(option.value) ?? 0, base.answered),
    known: true,
  }));

  // Undeclared values, sorted so the output does not depend on the row order
  // the database happened to return. The `other:` bucket is a real, expected
  // row when the author turned `allowOther` on — so it is labelled properly
  // and marked known; every other undeclared value is a deleted option and
  // labels itself with what is actually stored (property 3).
  const allowsOther =
    (question.kind === "single_select" || question.kind === "multi_select") &&
    question.allowOther === true;
  const undeclared = [...counts.keys()]
    .filter((value) => !declaredValues.has(value))
    .sort();
  for (const value of undeclared) {
    const count = counts.get(value) ?? 0;
    const isOther = value === OTHER_ROW_VALUE;
    rows.push({
      value,
      label: isOther ? OTHER_ROW_LABEL : value,
      count,
      pct: percent(count, base.answered),
      known: isOther && allowsOther,
    });
  }

  let totalSelections = 0;
  for (const row of rows) totalSelections += row.count;

  return {
    ...base,
    shape: "choice",
    multi: question.kind === "multi_select",
    rows,
    totalSelections,
  };
}

/** The declared step between adjacent values. `number` picks whole cells. */
function numericStep(question: SliderQuestion | NumberQuestion): number {
  if (question.kind === "slider") return question.step > 0 ? question.step : 1;
  return 1;
}

/**
 * Whether the kind picks from discrete cells rather than a dragged range —
 * `number` always, `slider` only in its segmented variant
 * (`docs/questionnaire-builder.md:396`). Discrete ranges get zero-count
 * buckets so an option nobody chose is visible; a continuous one gets only
 * the values people actually landed on.
 */
function isDiscreteNumeric(question: SliderQuestion | NumberQuestion): boolean {
  if (question.kind === "number") return true;
  return question.display === "segmented";
}

function aggregateNumeric(
  question: SliderQuestion | NumberQuestion,
  base: AggregateBase,
  answers: QuestionnaireResponseValue[],
): NumericAggregate {
  const declaredMin = question.min;
  const declaredMax = question.max;

  const samples: number[] = [];
  for (const answer of answers) {
    if (typeof answer === "number" && Number.isFinite(answer)) {
      samples.push(answer);
    }
  }

  const counts = new Map<number, number>();
  for (const sample of samples) {
    const key = bucketKey(sample);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Zero-count buckets for the declared cells, when there are few enough of
  // them to read. `span` is a count of cells, so a 0-6 number question is 7.
  const step = numericStep(question);
  const span =
    Number.isFinite(declaredMin) && Number.isFinite(declaredMax) && step > 0
      ? Math.floor(bucketKey((declaredMax - declaredMin) / step)) + 1
      : Number.POSITIVE_INFINITY;
  const enumerated =
    isDiscreteNumeric(question) && span >= 1 && span <= MAX_ENUMERATED_BUCKETS;
  const values = new Set<number>(counts.keys());
  if (enumerated) {
    for (let i = 0; i < span; i += 1) {
      values.add(bucketKey(declaredMin + i * step));
    }
  }

  const buckets: NumericBucket[] = [...values]
    .sort((a, b) => a - b)
    .map((value) => ({
      value,
      count: counts.get(value) ?? 0,
      pct: percent(counts.get(value) ?? 0, samples.length),
      // Property 4: a value the definition no longer admits keeps its own
      // bucket and says so, rather than being clamped onto its neighbour.
      inRange: value >= declaredMin && value <= declaredMax,
    }));

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  let mean: number | null = null;
  let median: number | null = null;
  if (n > 0) {
    let total = 0;
    for (const sample of sorted) total += sample;
    mean = round2(total / n);
    const mid = Math.floor(n / 2);
    const lower = sorted[mid - 1];
    const upper = sorted[mid];
    median =
      n % 2 === 1
        ? round2(upper as number)
        : round2(((lower as number) + (upper as number)) / 2);
  }

  return {
    ...base,
    shape: "numeric",
    samples: n,
    unparsed: base.answered - n,
    min: n > 0 ? (sorted[0] as number) : null,
    max: n > 0 ? (sorted[n - 1] as number) : null,
    mean,
    median,
    buckets,
    enumerated,
  };
}

function aggregateOne(
  question: Question,
  responses: readonly QuestionnaireResponses[],
): QuestionAggregate {
  const answers: QuestionnaireResponseValue[] = [];
  for (const response of responses) {
    const value = response[question.id];
    if (value !== undefined && isAnswered(value)) answers.push(value);
  }

  const base: AggregateBase = {
    questionId: question.id,
    prompt: question.prompt,
    kind: question.kind,
    respondents: responses.length,
    answered: answers.length,
    skipped: responses.length - answers.length,
    answeredPct: percent(answers.length, responses.length),
  };

  // Hoisted so the compiler can narrow it: an index expression is re-read on
  // every arm, which leaves the `never` guard below with nothing to bite on.
  const shape = KIND_SHAPE[question.kind];
  switch (shape) {
    case "choice":
      return aggregateChoice(question, base, answers);
    case "numeric":
      // `KIND_SHAPE` routes only `slider` and `number` here, but the table is
      // a lookup rather than a narrowing, so the compiler needs this said out
      // loud. Unreachable in practice; a throw beats a widened parameter that
      // would let a genuinely wrong kind through unnoticed.
      if (question.kind !== "slider" && question.kind !== "number") {
        throw new Error(
          `Numeric shape routed a non-numeric kind: ${question.kind}`,
        );
      }
      return aggregateNumeric(question, base, answers);
    case "count":
      // Deliberately terminal: the answers are in scope right here and are
      // thrown away unread. Free text does not get a value breakdown
      // (`docs/questionnaire-builder.md:400`).
      return { ...base, shape: "count" };
    default: {
      // Unreachable while `AggregateShape` and this switch agree; a new shape
      // added to the union without an arm here is a compile error naming it.
      const exhaustive: never = shape;
      throw new Error(`Unhandled aggregate shape: ${String(exhaustive)}`);
    }
  }
}

/**
 * Summarise a set of submitted response maps against the definition they were
 * submitted under.
 *
 * One aggregate per question in questionnaire order, plus an `orphans` list
 * for answers whose question is gone. `responses` is one entry per respondent
 * — the caller has already resolved "latest answer per (user, key)" and
 * scoped the read to a single cycle, because mixing two years' answers into
 * one denominator is exactly the silent lie this engine exists to avoid.
 *
 * Percentages inside a question are over `answered`, not `respondents`: "of
 * the people who answered, 40% said X". The skip is not hidden by that choice
 * — `answered`, `skipped` and `answeredPct` sit on every aggregate, so a
 * question two of thirty people ever saw reports two answers and twenty-eight
 * skips no matter how its rows read.
 */
export function aggregateResponses(
  questionnaire: Questionnaire,
  responses: readonly QuestionnaireResponses[],
): ResponseAggregate {
  return aggregateQuestions(flattenQuestions(questionnaire), responses);
}

/**
 * The same summary from an already-flat question list.
 *
 * This is the primitive; `aggregateResponses` is the legacy-`Questionnaire`
 * wrapper over it. The split exists because the two questionnaire shapes
 * flatten differently — a `BuilderQuestionnaire` uses
 * `flattenBuilderQuestions`, the legacy one `flattenQuestions` — and the
 * builder shape is the only kind that HAS a results screen. Taking the flat
 * list keeps this module out of that split entirely, and keeps `/metrics` on
 * this engine rather than growing a second one beside it.
 */
export function aggregateQuestions(
  questions: readonly Question[],
  responses: readonly QuestionnaireResponses[],
): ResponseAggregate {
  const known = new Set(questions.map((question) => question.id));

  const orphanCounts = new Map<string, number>();
  for (const response of responses) {
    for (const [key, value] of Object.entries(response)) {
      if (known.has(key) || !isAnswered(value)) continue;
      orphanCounts.set(key, (orphanCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    respondents: responses.length,
    questions: questions.map((question) => aggregateOne(question, responses)),
    orphans: [...orphanCounts.keys()].sort().map((questionId) => ({
      questionId,
      answered: orphanCounts.get(questionId) ?? 0,
      respondents: responses.length,
    })),
  };
}

// --- Activation completion (plan item 3.5) -------------------------------

/** Mirrors `required_action_status` in `packages/db/src/schema.ts`. */
export type RequiredActionStatus =
  | "pending"
  | "completed"
  | "waived"
  | "expired";

export interface ActivationCompletion {
  /**
   * Every required-action row for the ACTIVE activation. Prior reach is not
   * reconstructable (`docs/questionnaire-builder.md:387`), so this is reach
   * now, not reach ever.
   */
  sent: number;
  completed: number;
  /**
   * Still outstanding — derived as the complement of completed and closed, so
   * there is one place a row can be counted and it is not this one.
   */
  pending: number;
  /**
   * `waived + expired`. These are excluded from the completion denominator
   * (`docs/questionnaire-builder.md:390`), and the bucket exists so the
   * exclusion is visible: `closeActivation` flips every still-pending gate to
   * `expired` on purpose, and without this figure a captain would watch the
   * denominator shrink with nothing on screen explaining why.
   */
  closed: number;
  /** `pending + completed` — the completion denominator. */
  eligible: number;
  /** `completed / eligible`, 0-100, whole. */
  completionPct: number;
  /** `closed / sent`, 0-100, whole — how much of the reach was excluded. */
  closedPct: number;
}

/**
 * Completion for one activation, from its required-action statuses.
 *
 * Waived and expired rows are NOT pending. Folding them in is the arithmetic
 * this deliberately does not do: a captain who closes an activation would see
 * every gate they just expired counted against them for ever.
 */
export function tallyActivationCompletion(
  statuses: readonly RequiredActionStatus[],
): ActivationCompletion {
  const sent = statuses.length;
  let completed = 0;
  let closed = 0;

  for (const status of statuses) {
    switch (status) {
      case "completed":
        completed += 1;
        break;
      case "waived":
      case "expired":
        closed += 1;
        break;
      case "pending":
        // Counted as the complement below, never here.
        break;
      default: {
        // A fifth member of `required_action_status` is a compile error here.
        // It matters which side it lands on: without this guard it would fall
        // silently into `pending` and quietly inflate the denominator.
        const exhaustive: never = status;
        throw new Error(
          `Unhandled required action status: ${String(exhaustive)}`,
        );
      }
    }
  }

  const pending = sent - completed - closed;
  const eligible = pending + completed;

  return {
    sent,
    completed,
    pending,
    closed,
    eligible,
    completionPct: percent(completed, eligible),
    closedPct: percent(closed, sent),
  };
}
