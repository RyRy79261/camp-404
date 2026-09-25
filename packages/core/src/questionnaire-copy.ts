// Duplicating a definition (the hub's "Duplicate"): the copy gets fresh ids so
// its answers, results and branching never collide with the original's.
//
// Pure — no I/O, no env. `nextId` supplies the fresh ids.

import {
  SUBMIT_TARGET,
  isAnswerableBlock,
  type PageBlock,
  type Questionnaire,
  type QuestionnairePage,
  type VisibleIf,
} from "@camp404/types";

/**
 * Deep-copy a definition with a fresh id for every page, question and content
 * block, and every reference remapped to the copy's own ids: each `visibleIf`
 * to the copied question, each page `next` and option `goTo` to the copied page
 * (the reserved submit target stays). Without the remap the copy's branching
 * would point at the original's ids — mis-rendering at runtime and failing the
 * publish check. Grid row ids and option values are answers' keys WITHIN a
 * question, so they are kept.
 */
export function regenerateQuestionnaireIds(
  questionnaire: Questionnaire,
  nextId: () => string,
): Questionnaire {
  // Pass 1: new ids for every question and page, so a reference to one on a
  // later page can be remapped.
  const questionIds = new Map<string, string>();
  const pageIds = new Map<string, string>();
  for (const page of questionnaire.pages) {
    pageIds.set(page.id, nextId());
    if (page.kind !== "questions") continue;
    for (const block of page.questions) {
      if (isAnswerableBlock(block)) questionIds.set(block.id, nextId());
    }
  }

  const remapCondition = (v: VisibleIf | undefined) =>
    v
      ? {
          visibleIf: { ...v, fieldId: questionIds.get(v.fieldId) ?? v.fieldId },
        }
      : {};
  const remapTarget = (target: string) =>
    target === SUBMIT_TARGET ? target : (pageIds.get(target) ?? target);

  const copyBlock = (block: PageBlock): PageBlock => {
    if (!isAnswerableBlock(block)) {
      return { ...block, id: nextId(), ...remapCondition(block.visibleIf) };
    }
    const copy = {
      ...block,
      id: questionIds.get(block.id) ?? block.id,
      ...remapCondition(block.visibleIf),
    };
    if (copy.kind === "single_select" || copy.kind === "multi_select") {
      return {
        ...copy,
        options: copy.options.map((option) =>
          option.goTo ? { ...option, goTo: remapTarget(option.goTo) } : option,
        ),
      };
    }
    return copy;
  };

  // Pass 2: rebuild with the fresh ids and remapped references.
  const copyPage = (page: QuestionnairePage): QuestionnairePage => {
    const id = pageIds.get(page.id) ?? page.id;
    const next = page.next ? { next: remapTarget(page.next) } : {};
    if (page.kind === "intro") return { ...page, id, ...next };
    return {
      ...page,
      id,
      ...next,
      ...remapCondition(page.visibleIf),
      questions: page.questions.map(copyBlock),
    };
  };

  return { ...questionnaire, pages: questionnaire.pages.map(copyPage) };
}
