// Questionnaire DEFINITION validation. Zod gives us the shape; this module
// gives us the STRUCTURAL integrity a shape check can't express, and the
// publish-time rules a draft is allowed to break.
//
// Ported from AB's `questionnaire-definition.ts` and extended with Camp 404's
// builder publish rules, so one check serves the unified model:
//
//   From AB —
//   - ids are globally unique and stable (responses are keyed by question id,
//     so a duplicate id silently overwrites someone's answer),
//   - option and grid column values are unique and don't collide with the
//     `other:` encoding, grid row ids are unique,
//   - every branch target exists and points FORWARD — which is what makes
//     loops and dead ends impossible by construction rather than by luck,
//   - every page is reachable from the first one,
//   - min/max rules are internally consistent.
//
//   From Camp 404 —
//   - a draft may be incomplete, so the rules AB wrote into its schema as
//     `min(1)` live here: a page needs a title and at least one block, an image
//     block a picture and alt text (and the definition, when it has a title, a
//     non-blank one);
//   - every `visibleIf` references an EARLIER question, with an operator that
//     fits its kind and a value it can hold (`visibleIfProblem`);
//   - images come only from the app's own storage (`isAllowedBuilderImageUrl`
//     — anything else is a tracking pixel every member's browser would load);
//   - a content page holds no inputs; the definition holds at least one;
//   - a role the app copies into a table sits on one question only;
//   - numeric ranges a respondent could never satisfy are refused;
//   - the form shows at least one page before anything is answered.
//
// The save-time bounds (sizes and counts, checked on every save whatever the
// editor sent) are `definitionLimitErrors`, below.
//
// Pure — no I/O, no env.

import {
  BUILDER_LIMITS,
  OTHER_PREFIX,
  Questionnaire,
  SUBMIT_TARGET,
  choiceValues,
  isAllowedBuilderImageUrl,
  isAnswerableBlock,
  pageBlocks,
  visibleIfProblem,
  type PageBlock,
  type Question,
  type QuestionnairePage,
  type VisibleIf,
} from "@camp404/types";
import { resolvePath } from "./questionnaire-runtime";

export type DefinitionIssueCode =
  // AB's structural codes.
  | "shape"
  | "duplicate_id"
  | "reserved_id"
  | "duplicate_option_value"
  | "reserved_option_value"
  | "unknown_branch_target"
  | "backward_branch"
  | "self_branch"
  | "branch_not_allowed"
  | "unreachable_page"
  | "invalid_range"
  // Camp 404's publish codes (the same vocabulary as the builder's
  // `BuilderDefinitionIssueCode`, so a canvas can act on either).
  | "missing_title"
  | "missing_page_title"
  | "empty_page"
  | "dangling_visible_if"
  | "visible_if_wrong_operator"
  | "visible_if_wrong_value"
  | "image_alt_missing"
  | "image_missing"
  | "image_host"
  | "input_on_content_page"
  | "duplicate_role"
  | "no_inputs"
  | "no_visible_page";

/** One structural defect, addressed to a place in the definition. */
export interface DefinitionIssue {
  /** Dotted path into the definition, e.g. `pages[2].questions[0].options[1]`. */
  path: string;
  code: DefinitionIssueCode;
  message: string;
  /** The page it belongs to, when it belongs to one. */
  pageId?: string;
  /** The block it belongs to (a question's id), when it belongs to one. */
  blockId?: string;
}

export type DefinitionValidation =
  | { ok: true; definition: Questionnaire; issues: readonly [] }
  | { ok: false; issues: DefinitionIssue[] };

/** Branch targets declared by one block (single-choice options only). */
function optionBranchTargets(
  block: PageBlock,
): { index: number; target: string }[] {
  if (block.kind !== "single_select") return [];
  const out: { index: number; target: string }[] = [];
  block.options.forEach((o, index) => {
    if (o.goTo) out.push({ index, target: o.goTo });
  });
  return out;
}

/** The page a branch-free traversal falls through to: the explicit `next`, or
 * the following page, or submit when this is the last page. */
function fallthroughTarget(
  page: QuestionnairePage,
  index: number,
  pages: readonly QuestionnairePage[],
): string {
  if (page.next) return page.next;
  const following = pages[index + 1];
  return following ? following.id : SUBMIT_TARGET;
}

function rangeIssues(q: Question): string[] {
  const bad: string[] = [];

  if (q.kind === "short_text" || q.kind === "long_text") {
    if (q.minLength != null && q.minLength > q.maxLength) {
      bad.push(`minLength ${q.minLength} exceeds maxLength ${q.maxLength}`);
    }
  }
  if (q.kind === "short_text") {
    if (q.min != null && q.max != null && q.min > q.max) {
      bad.push(`min ${q.min} exceeds max ${q.max}`);
    }
    const numeric = q.format === "number" || q.format === "integer";
    if (!numeric && (q.min != null || q.max != null)) {
      bad.push("min/max only apply when format is number or integer");
    }
  }
  if (q.kind === "multi_select") {
    const ceiling = q.options.length + (q.allowOther ? 1 : 0);
    if (
      q.minSelections != null &&
      q.maxSelections != null &&
      q.minSelections > q.maxSelections
    ) {
      bad.push(
        `minSelections ${q.minSelections} exceeds maxSelections ${q.maxSelections}`,
      );
    }
    if (q.minSelections != null && q.minSelections > ceiling) {
      bad.push(
        `minSelections ${q.minSelections} exceeds the ${ceiling} options`,
      );
    }
    if (q.maxSelections != null && q.maxSelections > ceiling) {
      bad.push(
        `maxSelections ${q.maxSelections} exceeds the ${ceiling} options`,
      );
    }
  }
  if (q.kind === "linear_scale" && q.max <= q.min) {
    bad.push(`max ${q.max} must be greater than min ${q.min}`);
  }
  // Camp 404's numeric kinds: a slider with nothing to drag, a cell row with a
  // single cell, or a slider step striding past its whole range.
  if (q.kind === "slider" || q.kind === "number") {
    if (q.max <= q.min) {
      bad.push(
        `"${q.prompt}" needs a maximum above its minimum (currently ${q.min}–${q.max}).`,
      );
    } else if (q.kind === "slider" && q.step > q.max - q.min) {
      bad.push(
        `"${q.prompt}" has a step of ${q.step}, larger than its ${q.min}–${q.max} range.`,
      );
    }
  }
  return bad;
}

const IMAGE_HOST_MESSAGE =
  "links to another website. Only images stored by Camp 404 can be shown.";

/**
 * Validate a raw questionnaire definition for PUBLISHING. Returns the PARSED
 * definition on success (Zod defaults applied) or the full list of issues.
 *
 * Backward compatible by construction: every addition to the model is
 * optional, so a definition that predates it produces zero issues and parses
 * unchanged.
 */
export function validateQuestionnaireDefinition(
  raw: unknown,
): DefinitionValidation {
  const parsed = Questionnaire.safeParse(raw);
  if (!parsed.success) {
    const issues: DefinitionIssue[] = parsed.error.issues.map((i) => ({
      path: i.path.length ? i.path.join(".") : "definition",
      code: "shape" as const,
      message: i.message,
    }));
    return { ok: false, issues };
  }

  const definition = parsed.data;
  const pages = definition.pages;
  // Structural issues gate the reachability sweep (a broken id or branch makes
  // the page graph meaningless); publish issues never do.
  const issues: DefinitionIssue[] = [];
  const publishIssues: DefinitionIssue[] = [];

  if (definition.title !== undefined && definition.title.trim() === "") {
    publishIssues.push({
      path: "title",
      code: "missing_title",
      message: "Give the questionnaire a title before publishing.",
    });
  }

  // --- ids: one flat namespace, globally unique ---------------------------
  // Question ids key the response map; page ids are branch targets; content
  // block ids key the canvas. Sharing a namespace keeps "go to section X"
  // unambiguous and a condition's reference unique.
  const seenIds = new Map<string, string>();
  const pageIndexById = new Map<string, number>();

  const claimId = (
    id: string,
    path: string,
    at: { pageId: string; blockId?: string },
  ) => {
    if (id === SUBMIT_TARGET) {
      issues.push({
        path,
        code: "reserved_id",
        message: `"${SUBMIT_TARGET}" is reserved for the submit branch target`,
        ...at,
      });
      return;
    }
    const previous = seenIds.get(id);
    if (previous) {
      issues.push({
        path,
        code: "duplicate_id",
        message: `id "${id}" is already used at ${previous} — ids must be unique so responses stay attached to the right question`,
        ...at,
      });
      return;
    }
    seenIds.set(id, path);
  };

  let inputCount = 0;
  // Every question seen so far, by id: a condition may reference only these.
  const earlier = new Map<string, Question>();
  // A role the app copies somewhere (allergies, arrival day…) may sit on one
  // question only, or two answers would race for one column. Emergency
  // contact roles repeat by design: the Nth of each makes contact N.
  const roleOwners = new Map<string, string>();

  const checkVisibleIf = (
    cond: VisibleIf,
    path: string,
    where: string,
    at: { pageId: string; blockId?: string },
  ) => {
    const field = earlier.get(cond.fieldId);
    const problem = visibleIfProblem(cond, field);
    if (problem === null) return;
    const message =
      problem === "missing_field"
        ? `${where} shows-when references a question that doesn't come before it.`
        : problem === "wrong_operator"
          ? `${where} shows-when uses a condition that doesn't fit "${field?.prompt}".`
          : `${where} shows-when compares "${field?.prompt}" with an answer it can't have.`;
    const code =
      problem === "missing_field"
        ? "dangling_visible_if"
        : problem === "wrong_operator"
          ? "visible_if_wrong_operator"
          : "visible_if_wrong_value";
    publishIssues.push({ path: `${path}.visibleIf`, code, message, ...at });
  };

  pages.forEach((page, pageIndex) => {
    const pagePath = `pages[${pageIndex}]`;
    const onPage = { pageId: page.id };
    claimId(page.id, pagePath, onPage);
    if (!pageIndexById.has(page.id)) pageIndexById.set(page.id, pageIndex);
    if (page.kind !== "questions") return;

    const pageLabel = page.title.trim() || `Page ${pageIndex + 1}`;
    if (page.title.trim() === "") {
      publishIssues.push({
        path: `${pagePath}.title`,
        code: "missing_page_title",
        message: `Page ${pageIndex + 1} needs a title.`,
        ...onPage,
      });
    }
    if (page.questions.length === 0) {
      publishIssues.push({
        path: `${pagePath}.questions`,
        code: "empty_page",
        message: `${pageLabel} has no blocks.`,
        ...onPage,
      });
    }
    if (page.visibleIf)
      checkVisibleIf(page.visibleIf, pagePath, pageLabel, onPage);

    pageBlocks(page).forEach((block, blockIndex) => {
      const blockPath = `${pagePath}.questions[${blockIndex}]`;
      const at = { pageId: page.id, blockId: block.id };
      claimId(block.id, blockPath, at);
      if (block.visibleIf) {
        checkVisibleIf(
          block.visibleIf,
          blockPath,
          `A block on ${pageLabel}`,
          at,
        );
      }

      if (block.kind === "image_block") {
        if (block.alt.trim() === "") {
          publishIssues.push({
            path: `${blockPath}.alt`,
            code: "image_alt_missing",
            message: `An image on ${pageLabel} is missing alt text.`,
            ...at,
          });
        }
        if (block.url.trim() === "") {
          publishIssues.push({
            path: `${blockPath}.url`,
            code: "image_missing",
            message: `An image on ${pageLabel} has no picture yet.`,
            ...at,
          });
        } else if (!isAllowedBuilderImageUrl(block.url)) {
          publishIssues.push({
            path: `${blockPath}.url`,
            code: "image_host",
            message: `An image on ${pageLabel} ${IMAGE_HOST_MESSAGE}`,
            ...at,
          });
        }
      }

      if (!isAnswerableBlock(block)) return;
      inputCount += 1;
      if (page.pageType === "content") {
        publishIssues.push({
          path: blockPath,
          code: "input_on_content_page",
          message: `${pageLabel} is a content page and can't contain input fields.`,
          ...at,
        });
      }
      for (const message of rangeIssues(block)) {
        issues.push({ path: blockPath, code: "invalid_range", message, ...at });
      }
      const role = "role" in block ? block.role : undefined;
      if (role && !role.startsWith("emergency_contact_")) {
        const owner = roleOwners.get(role);
        if (owner !== undefined) {
          publishIssues.push({
            path: `${blockPath}.role`,
            code: "duplicate_role",
            message: `"${owner}" and "${block.prompt}" are both marked for the same use. Mark only one.`,
            ...at,
          });
        } else {
          roleOwners.set(role, block.prompt);
        }
      }
      // Registered AFTER its own condition was checked: a question may not
      // show-when on itself.
      earlier.set(block.id, block);

      if (
        block.kind === "multi_choice_grid" ||
        block.kind === "checkbox_grid"
      ) {
        // Row ids key the response map (per-row answers), so a duplicate would
        // silently overwrite a row's answer; column values are the stored
        // answers, so they must be unique and not collide with `other:`.
        const seenRows = new Set<string>();
        block.rows.forEach((row, rowIndex) => {
          const rowPath = `${blockPath}.rows[${rowIndex}]`;
          if (seenRows.has(row.id)) {
            issues.push({
              path: rowPath,
              code: "duplicate_id",
              message: `duplicate row id "${row.id}" — rows must be unique so answers stay attached to the right row`,
              ...at,
            });
          }
          seenRows.add(row.id);
        });
        const seenColumns = new Set<string>();
        block.columns.forEach((column, columnIndex) => {
          const columnPath = `${blockPath}.columns[${columnIndex}]`;
          if (column.value.startsWith(OTHER_PREFIX)) {
            issues.push({
              path: columnPath,
              code: "reserved_option_value",
              message: `column values may not start with "${OTHER_PREFIX}"`,
              ...at,
            });
          }
          if (seenColumns.has(column.value)) {
            issues.push({
              path: columnPath,
              code: "duplicate_option_value",
              message: `duplicate column value "${column.value}"`,
              ...at,
            });
          }
          seenColumns.add(column.value);
        });
        return;
      }

      if (block.kind === "single_select" || block.kind === "multi_select") {
        block.options.forEach((option, optionIndex) => {
          const optionPath = `${blockPath}.options[${optionIndex}]`;
          if (option.goTo && block.kind === "multi_select") {
            issues.push({
              path: optionPath,
              code: "branch_not_allowed",
              message:
                "branching is only available on single-choice questions (radio / dropdown)",
              ...at,
            });
          }
          if (option.imageUrl && !isAllowedBuilderImageUrl(option.imageUrl)) {
            publishIssues.push({
              path: `${optionPath}.imageUrl`,
              code: "image_host",
              message: `An option image on ${pageLabel} ${IMAGE_HOST_MESSAGE}`,
              ...at,
            });
          }
        });
      }

      // Option values (and a scale's steps, a toggle's or a combobox's
      // options) are stored answers: unique, and never on the reserved prefix.
      // Attended years are generated, never authored, so they are skipped.
      if (block.kind === "years") return;
      const values = choiceValues(block) ?? [];
      const seenValues = new Set<string>();
      values.forEach((value, optionIndex) => {
        const optionPath =
          block.kind === "scale"
            ? `${blockPath}.steps[${optionIndex}]`
            : `${blockPath}.options[${optionIndex}]`;
        if (value.startsWith(OTHER_PREFIX)) {
          issues.push({
            path: optionPath,
            code: "reserved_option_value",
            message: `option values may not start with "${OTHER_PREFIX}" — that prefix encodes an "Other…" answer`,
            ...at,
          });
        }
        if (seenValues.has(value)) {
          issues.push({
            path: optionPath,
            code: "duplicate_option_value",
            message: `duplicate option value "${value}"`,
            ...at,
          });
        }
        seenValues.add(value);
      });
    });
  });

  // --- branch targets: must exist and point forward ------------------------
  const checkTarget = (
    target: string,
    fromIndex: number,
    path: string,
    pageId: string,
  ): boolean => {
    if (target === SUBMIT_TARGET) return true;
    const targetIndex = pageIndexById.get(target);
    if (targetIndex === undefined) {
      issues.push({
        path,
        code: "unknown_branch_target",
        message: `"${target}" is not a section in this questionnaire`,
        pageId,
      });
      return false;
    }
    if (targetIndex === fromIndex) {
      issues.push({
        path,
        code: "self_branch",
        message: "a section cannot branch to itself — that is an infinite loop",
        pageId,
      });
      return false;
    }
    if (targetIndex < fromIndex) {
      issues.push({
        path,
        code: "backward_branch",
        message: `"${target}" comes earlier in the questionnaire — branches must move forward so a respondent can never loop`,
        pageId,
      });
      return false;
    }
    return true;
  };

  const edges: string[][] = pages.map(() => []);
  pages.forEach((page, pageIndex) => {
    const pagePath = `pages[${pageIndex}]`;
    const out = edges[pageIndex];
    if (!out) return;

    // The fall-through edge is always live: an explicit `next` replaces the
    // linear one, a branching question only diverts the options that actually
    // carry a `goTo`, and a HIDDEN page routes by its fall-through too.
    if (page.next) {
      if (checkTarget(page.next, pageIndex, `${pagePath}.next`, page.id)) {
        out.push(page.next);
      }
    } else {
      out.push(fallthroughTarget(page, pageIndex, pages));
    }

    pageBlocks(page).forEach((block, blockIndex) => {
      for (const { index, target } of optionBranchTargets(block)) {
        const path = `${pagePath}.questions[${blockIndex}].options[${index}].goTo`;
        if (checkTarget(target, pageIndex, path, page.id)) out.push(target);
      }
    });
  });

  // --- reachability: every page must be arrivable from the first -----------
  // Forward-only edges make this a single left-to-right sweep; no cycle
  // detection is needed because a cycle cannot be expressed.
  if (issues.length === 0 && pages.length > 0) {
    const reachable = new Set<string>();
    const first = pages[0];
    if (first) reachable.add(first.id);
    pages.forEach((page, pageIndex) => {
      if (!reachable.has(page.id)) return;
      for (const target of edges[pageIndex] ?? []) {
        if (target !== SUBMIT_TARGET) reachable.add(target);
      }
    });
    pages.forEach((page, pageIndex) => {
      if (!reachable.has(page.id)) {
        issues.push({
          path: `pages[${pageIndex}]`,
          code: "unreachable_page",
          message: `section "${page.id}" can never be reached — no branch or fall-through leads to it`,
          pageId: page.id,
        });
      }
    });
  }

  if (inputCount === 0) {
    publishIssues.push({
      path: "pages",
      code: "no_inputs",
      message: "Add at least one input field.",
    });
  }
  if (issues.length === 0 && resolvePath(definition, {}).length === 0) {
    publishIssues.push({
      path: "pages",
      code: "no_visible_page",
      message: "This questionnaire shows no pages until something is answered.",
    });
  }

  const all = [...issues, ...publishIssues];
  if (all.length > 0) return { ok: false, issues: all };
  return { ok: true, definition, issues: [] };
}

/** Convenience: is this raw value a publishable definition? */
export function isValidQuestionnaireDefinition(raw: unknown): boolean {
  return validateQuestionnaireDefinition(raw).ok;
}

/** How many authored choices a question carries (a grid's longer side). */
function choiceCount(q: Question): number {
  if (q.kind === "multi_choice_grid" || q.kind === "checkbox_grid") {
    return Math.max(q.rows.length, q.columns.length);
  }
  return q.kind === "years" ? 0 : (choiceValues(q)?.length ?? 0);
}

function longTextIn(value: unknown, limit: number): boolean {
  if (typeof value === "string") return value.length > limit;
  if (Array.isArray(value)) return value.some((v) => longTextIn(v, limit));
  if (value && typeof value === "object") {
    return Object.values(value).some((v) => longTextIn(v, limit));
  }
  return false;
}

/**
 * Why a definition may not be SAVED, as sentences for the author, or [] when
 * it may: the server's bounds (Camp 404's `BUILDER_LIMITS`), checked on every
 * save whatever the editor sent. Publish-only rules stay in
 * `validateQuestionnaireDefinition`, so a half-built draft still saves. The
 * draft save, the MCP drafting tools and publish all apply it.
 */
export function definitionLimitErrors(definition: Questionnaire): string[] {
  const L = BUILDER_LIMITS;
  const errors: string[] = [];
  if ((definition.title ?? "").length > L.titleLength) {
    errors.push(`Keep the title to ${L.titleLength} characters or fewer.`);
  }
  if (definition.pages.length > L.pages) {
    errors.push(`A questionnaire can have at most ${L.pages} pages.`);
  }
  definition.pages.forEach((page, pageIndex) => {
    if (page.kind !== "questions") return;
    const pageLabel = page.title.trim() || `Page ${pageIndex + 1}`;
    if (page.questions.length > L.blocksPerPage) {
      errors.push(`${pageLabel} has more than ${L.blocksPerPage} blocks.`);
    }
    for (const block of page.questions) {
      if (
        isAnswerableBlock(block) &&
        choiceCount(block) > L.optionsPerQuestion
      ) {
        errors.push(
          `"${block.prompt.slice(0, 60)}" has more than ${L.optionsPerQuestion} options.`,
        );
      }
      if (
        block.kind === "image_block" &&
        block.url.trim().length > 0 &&
        !isAllowedBuilderImageUrl(block.url)
      ) {
        errors.push(`An image on ${pageLabel} ${IMAGE_HOST_MESSAGE}`);
      }
    }
  });
  if (longTextIn(definition, L.textLength)) {
    errors.push(
      `One piece of text is longer than ${L.textLength} characters. Shorten it or split it up.`,
    );
  }
  if (JSON.stringify(definition).length > L.totalLength) {
    errors.push(
      "This questionnaire is too large to save. Split it into smaller questionnaires.",
    );
  }
  return errors;
}
