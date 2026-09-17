import {
  attendedYearOptions,
  choiceValues,
  isAnswerableBlock,
  visibleIfOpsFor,
  visibleIfProblem,
  type Question,
  type Questionnaire,
  type VisibleIf,
  type VisibleIfOp,
} from "@camp404/types";

// Pure helpers for the "Show only when…" editor: which earlier questions a
// condition may point at, what a fresh condition starts as, and how one reads.
// The rules themselves (which operators fit which kind, which values a question
// can give) are @camp404/types' `visibleIfOpsFor` / `visibleIfProblem` — the
// same functions the publish check runs.

/** How each operator reads in the sentence "Shown when [question] [op] [value]". */
export const OP_LABELS: Record<VisibleIfOp, string> = {
  eq: "is",
  ne: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  includes: "includes",
  not_includes: "does not include",
  is_answered: "is answered",
  is_empty: "is not answered",
};

/** Whether an operator compares against a value (not just answered or not). */
export function takesValue(op: VisibleIfOp): boolean {
  return op !== "is_answered" && op !== "is_empty";
}

/** The kinds whose answer is a number a condition compares against. */
export type NumericQuestion = Extract<
  Question,
  { kind: "number" | "slider" | "linear_scale" | "rating" }
>;

export function isNumericQuestion(field: Question): field is NumericQuestion {
  return (
    field.kind === "number" ||
    field.kind === "slider" ||
    field.kind === "linear_scale" ||
    field.kind === "rating"
  );
}

/**
 * The questions a condition may reference, in document order: every question
 * on an earlier page, plus, for a block, the questions above it on its own
 * page. A page's condition sees only earlier pages. This matches the publish
 * check, which registers a question only after its own condition is checked.
 */
export function fieldsBefore(
  def: Questionnaire,
  pageId: string,
  targetBlockId: string | null,
): Question[] {
  const fields: Question[] = [];
  for (const page of def.pages) {
    if (page.id === pageId && targetBlockId === null) return fields;
    if (page.kind === "questions") {
      for (const block of page.questions) {
        if (page.id === pageId && block.id === targetBlockId) return fields;
        if (isAnswerableBlock(block)) fields.push(block);
      }
    }
    if (page.id === pageId) return fields;
  }
  return fields;
}

/** The lowest number a numeric question can give. */
function lowest(field: NumericQuestion): number {
  return field.kind === "rating" ? 1 : field.min;
}

/** The value a fresh condition on this operator starts with. */
function defaultValue(field: Question, op: VisibleIfOp): VisibleIf["value"] {
  if (!takesValue(op)) return undefined;
  if (field.kind === "boolean") return true;
  const choices = choiceValues(field);
  if (choices) return choices[0];
  if (isNumericQuestion(field)) return lowest(field);
  return undefined;
}

/** A complete, valid condition on `field`, with its first operator. */
export function defaultConditionFor(field: Question): VisibleIf {
  const op = visibleIfOpsFor(field)[0]!;
  return withValue({ fieldId: field.id, op }, defaultValue(field, op));
}

/** The condition with a new operator, keeping the value when it still fits. */
export function withOperator(
  cond: VisibleIf,
  field: Question,
  op: VisibleIfOp,
): VisibleIf {
  const next = withValue({ fieldId: cond.fieldId, op }, cond.value);
  return visibleIfProblem(next, field) === null
    ? next
    : withValue({ fieldId: cond.fieldId, op }, defaultValue(field, op));
}

function withValue(cond: VisibleIf, value: VisibleIf["value"]): VisibleIf {
  return value === undefined || !takesValue(cond.op)
    ? { fieldId: cond.fieldId, op: cond.op }
    : { ...cond, value };
}

/** The values a choice question offers, with the words a captain reads. */
export function choiceLabels(
  field: Question,
): { value: string; label: string }[] {
  if ("options" in field) {
    return field.options.map((o) => ({
      value: o.value,
      label: o.label || o.value,
    }));
  }
  if (field.kind === "scale") {
    return field.steps.map((s) => ({
      value: s.value,
      label: s.label || s.value,
    }));
  }
  if (field.kind === "years") {
    return attendedYearOptions()
      .filter((o) => !o.disabled)
      .map((o) => ({ value: String(o.year), label: String(o.year) }));
  }
  return (choiceValues(field) ?? []).map((value) => ({ value, label: value }));
}

/** How a condition's value reads: an option's label, Yes or No, or a number. */
function valueLabel(field: Question, value: VisibleIf["value"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const choice = choiceLabels(field).find((c) => c.value === value);
  return choice ? choice.label : String(value);
}

/** The numbers a numeric question can give, in words. */
export function rangeText(field: NumericQuestion): string {
  switch (field.kind) {
    case "rating":
      return `A whole number from 1 to ${field.steps}.`;
    case "slider":
      return field.step === 1
        ? `A number from ${field.min} to ${field.max}.`
        : `A number from ${field.min} to ${field.max}, in steps of ${field.step}.`;
    default:
      return `A whole number from ${field.min} to ${field.max}.`;
  }
}

/**
 * One sentence for a condition, and whether it is broken (its question is gone,
 * moved below, or no longer fits). The section and block editors show it.
 */
export function describeVisibleIf(
  cond: VisibleIf,
  fields: readonly Question[],
): { text: string; broken: boolean } {
  const field = fields.find((f) => f.id === cond.fieldId);
  if (visibleIfProblem(cond, field) !== null || !field) {
    return {
      text: "The condition needs fixing: its question is missing, below this, or has changed.",
      broken: true,
    };
  }
  const prompt = `“${field.prompt}”`;
  const text = takesValue(cond.op)
    ? `Shown when ${prompt} ${OP_LABELS[cond.op]} ${valueLabel(field, cond.value)}.`
    : `Shown when ${prompt} ${OP_LABELS[cond.op]}.`;
  return { text, broken: false };
}
