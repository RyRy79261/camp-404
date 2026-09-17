// What a re-publish MEANS for the members already asked (docs/questionnaire-
// builder.md §6.1): a `cosmetic` change overwrites the live version's snapshot
// in place, a `breaking` one mints a new version and re-opens the gate on the
// next send.
//
// Camp 404's rule, carried onto the unified model. Both sides are unified
// definitions — a caller reads a stored row of either shape through
// `parseStoredDefinition` first — so an old builder-shaped snapshot and the
// same questionnaire saved in the unified shape compare as what they are: the
// same questionnaire. Comparing the raw JSON instead would call every first
// re-publish after the move "breaking", mint a version nobody changed and ask
// every member again.
//
// Pure — no I/O, no env.

import {
  choiceValues,
  pageBlocks,
  type Question,
  type Questionnaire,
  type VisibleIf,
} from "@camp404/types";
import { allQuestions } from "./questionnaire-runtime";

export type DefinitionChange = "cosmetic" | "breaking";

function fieldMap(q: Questionnaire): Map<string, Question> {
  const m = new Map<string, Question>();
  for (const field of allQuestions(q)) m.set(field.id, field);
  return m;
}

/** Values in `before` that `after` no longer has. */
function lost(before: readonly string[], after: readonly string[]): boolean {
  const kept = new Set(after);
  return before.some((v) => !kept.has(v));
}

const NUMERIC_FORMATS = new Set(["number", "integer"]);

/**
 * True when changing `prev` into `next` (same id, same kind) can invalidate a
 * stored answer — i.e. a breaking change. Loosening is never breaking.
 */
function breakingParamChange(prev: Question, next: Question): boolean {
  // Removing or renaming an option, step or column value is breaking; adding
  // one is not.
  const prevOpts = choiceValues(prev);
  const nextOpts = choiceValues(next);
  if (prevOpts && nextOpts && lost(prevOpts, nextOpts)) return true;

  if (
    (prev.kind === "short_text" || prev.kind === "long_text") &&
    (next.kind === "short_text" || next.kind === "long_text")
  ) {
    // Narrowing a length bound can invalidate stored text.
    if (next.maxLength < prev.maxLength) return true;
    if ((next.minLength ?? 0) > (prev.minLength ?? 0)) return true;
  }

  if (prev.kind === "short_text" && next.kind === "short_text") {
    // Adding or tightening a text format can invalidate stored free text;
    // dropping to plain "text" only ever widens.
    const before = prev.format ?? "text";
    const after = next.format ?? "text";
    if (after !== before && after !== "text") return true;
    // A numeric format's bounds, once they apply.
    if (NUMERIC_FORMATS.has(after)) {
      if ((next.min ?? -Infinity) > (prev.min ?? -Infinity)) return true;
      if ((next.max ?? Infinity) < (prev.max ?? Infinity)) return true;
    }
  }

  if (
    (prev.kind === "slider" ||
      prev.kind === "number" ||
      prev.kind === "linear_scale") &&
    (next.kind === "slider" ||
      next.kind === "number" ||
      next.kind === "linear_scale") &&
    (next.min > prev.min || next.max < prev.max)
  ) {
    return true;
  }

  if (prev.kind === "rating" && next.kind === "rating") {
    if (next.steps < prev.steps) return true;
  }

  if (
    (prev.kind === "single_select" || prev.kind === "multi_select") &&
    (next.kind === "single_select" || next.kind === "multi_select")
  ) {
    // Turning "Other…" off invalidates every stored `other:` answer, exactly
    // the way removing an option does.
    if (prev.allowOther === true && next.allowOther !== true) return true;
  }

  if (prev.kind === "multi_select" && next.kind === "multi_select") {
    if ((next.minSelections ?? 0) > (prev.minSelections ?? 0)) return true;
    if ((next.maxSelections ?? Infinity) < (prev.maxSelections ?? Infinity))
      return true;
  }

  if (
    (prev.kind === "multi_choice_grid" || prev.kind === "checkbox_grid") &&
    (next.kind === "multi_choice_grid" || next.kind === "checkbox_grid")
  ) {
    // A grid answer is keyed by row id and holds column values.
    if (
      lost(
        prev.rows.map((r) => r.id),
        next.rows.map((r) => r.id),
      )
    ) {
      return true;
    }
    if (
      lost(
        prev.columns.map((c) => c.value),
        next.columns.map((c) => c.value),
      )
    ) {
      return true;
    }
  }

  return false;
}

function sameVisibleIf(a?: VisibleIf, b?: VisibleIf): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.fieldId === b.fieldId && a.op === b.op && a.value === b.value;
}

/**
 * Stable element id → its `visibleIf`: `p:<page id>` for a page, `b:<id>` for
 * a question or content block. A builder question's condition lived on its
 * block but is keyed by the question's id either way, so a builder snapshot
 * and its unified conversion produce the same map.
 */
function visibleIfMap(q: Questionnaire): Map<string, VisibleIf | undefined> {
  const m = new Map<string, VisibleIf | undefined>();
  for (const page of q.pages) {
    m.set(`p:${page.id}`, page.kind === "questions" ? page.visibleIf : undefined);
    for (const block of pageBlocks(page)) m.set(`b:${block.id}`, block.visibleIf);
  }
  return m;
}

/**
 * Every declared route: `n:<page id>` → the page's `next`, and
 * `g:<question id>:<option value>` → an option's `goTo`. Absent routes are not
 * entries, so a definition with no branching has an empty map.
 */
function routeMap(q: Questionnaire): Map<string, string> {
  const m = new Map<string, string>();
  for (const page of q.pages) {
    if (page.next) m.set(`n:${page.id}`, page.next);
    for (const block of pageBlocks(page)) {
      if (block.kind !== "single_select" && block.kind !== "multi_select") {
        continue;
      }
      for (const option of block.options) {
        if (option.goTo) m.set(`g:${block.id}:${option.value}`, option.goTo);
      }
    }
  }
  return m;
}

function sameRoutes(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, target] of a) if (b.get(key) !== target) return false;
  return true;
}

/**
 * Classify the change between two published definitions as `cosmetic` (no
 * version bump, no re-submit) or `breaking` (version bump, re-opens the gate
 * on the next send). Breaking:
 *
 *   - a question added or removed, or its kind or `required` changed;
 *   - a parameter tightened so a stored answer can fail (see
 *     `breakingParamChange`);
 *   - any `visibleIf` added, removed or edited, or a block or page added
 *     (Camp 404's rule, kept exactly: branching must re-open the gate rather
 *     than patch in place);
 *   - any `goTo` / `next` route added, removed or retargeted, and — while
 *     either side routes at all — the pages reordered, since the fall-through
 *     is document order.
 */
export function classifyChange(
  prev: Questionnaire,
  next: Questionnaire,
): DefinitionChange {
  const a = fieldMap(prev);
  const b = fieldMap(next);
  for (const id of a.keys()) if (!b.has(id)) return "breaking"; // removed
  for (const id of b.keys()) if (!a.has(id)) return "breaking"; // added
  for (const [id, prevField] of a) {
    const nextField = b.get(id)!;
    if (prevField.kind !== nextField.kind) return "breaking";
    if (prevField.required !== nextField.required) return "breaking";
    if (breakingParamChange(prevField, nextField)) return "breaking";
  }

  const va = visibleIfMap(prev);
  const vb = visibleIfMap(next);
  for (const [key, cond] of va) {
    if (!sameVisibleIf(cond, vb.get(key))) return "breaking";
  }
  for (const key of vb.keys()) {
    if (!va.has(key)) return "breaking";
  }

  const ra = routeMap(prev);
  const rb = routeMap(next);
  if (!sameRoutes(ra, rb)) return "breaking";
  if (ra.size > 0 || rb.size > 0) {
    const order = (q: Questionnaire) => q.pages.map((p) => p.id).join("\n");
    if (order(prev) !== order(next)) return "breaking";
  }
  return "cosmetic";
}
