import {
  choiceValues,
  visibleIfOpsFor,
  visibleIfProblem,
  type BuilderQuestionnaire,
  type Question,
  type VisibleIf,
  type VisibleIfOp,
} from "@camp404/types";
import { blockId } from "./builder-ops";

// Pure helpers for the "show this when…" logic editor (spec §2.1, Phase F).
// No board draws the editor; it is built from existing form parts.

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

/**
 * The input fields a condition may reference, in document order: every field
 * on an earlier page, plus, for a block, the fields above it on its own page.
 * A page's condition sees only earlier pages. This matches the publish check.
 */
export function fieldsBefore(
  def: BuilderQuestionnaire,
  pageId: string,
  targetBlockId: string | null,
): Question[] {
  const fields: Question[] = [];
  for (const page of def.pages) {
    if (page.id === pageId && targetBlockId === null) return fields;
    for (const block of page.blocks) {
      if (page.id === pageId && blockId(block) === targetBlockId) return fields;
      if (block.kind === "question") fields.push(block.question);
    }
    if (page.id === pageId) return fields;
  }
  return fields;
}

/** The value a fresh condition on this operator starts with. */
function defaultValue(field: Question, op: VisibleIfOp): VisibleIf["value"] {
  if (!takesValue(op)) return undefined;
  if (field.kind === "boolean") return true;
  const choices = choiceValues(field);
  if (choices) return choices[0];
  if (field.kind === "number" || field.kind === "slider") return field.min;
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

/** How a condition's value reads: an option's label, Yes or No, or a number. */
function valueLabel(field: Question, value: VisibleIf["value"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if ("options" in field) {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }
  if (field.kind === "scale") {
    return field.steps.find((s) => s.value === value)?.label ?? String(value);
  }
  return String(value);
}

/**
 * One sentence for a condition, and whether it is broken (its question is gone,
 * moved below, or no longer fits). The canvas and the editor both show it.
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
