// "Team leads and up" (#251): a page or question marked `leadsOnly` is shown
// only to a viewer at the `team_lead` rung or above. Clearance is global (a
// lead of ANY team this year, or a captain), per AGENTS.md; this module never
// looks at which team.
//
// The server applies it in two places, both through this module:
//
//   * the runner page hands the member's runner `questionnaireForViewer`'s
//     copy, so a plain member's browser never receives a leads-only question;
//   * the save action refuses a payload that answers a leads-only question
//     for a viewer who may not see it (`answersLeadsOnly`), and validates the
//     rest against the same stripped copy.
//
// Pure — no I/O, no env.

import {
  SUBMIT_TARGET,
  isAnswerableBlock,
  type PageBlock,
  type Questionnaire,
  type QuestionnairePage,
} from "@camp404/types";

function blockIsLeadsOnly(block: PageBlock): boolean {
  return "leadsOnly" in block && block.leadsOnly === true;
}

function pageIsLeadsOnly(page: QuestionnairePage): boolean {
  return page.kind === "questions" && page.leadsOnly === true;
}

/** Whether a definition holds anything only team leads and captains see. */
export function hasLeadsOnlyContent(questionnaire: Questionnaire): boolean {
  return questionnaire.pages.some(
    (page) =>
      pageIsLeadsOnly(page) ||
      (page.kind === "questions" && page.questions.some(blockIsLeadsOnly)),
  );
}

/**
 * The ids of every question a plain member may not answer: each question
 * marked `leadsOnly`, and every question on a page marked `leadsOnly`.
 */
export function leadsOnlyQuestionIds(
  questionnaire: Questionnaire,
): Set<string> {
  const ids = new Set<string>();
  for (const page of questionnaire.pages) {
    if (page.kind !== "questions") continue;
    const wholePage = pageIsLeadsOnly(page);
    for (const block of page.questions) {
      if (!isAnswerableBlock(block)) continue;
      if (wholePage || blockIsLeadsOnly(block)) ids.add(block.id);
    }
  }
  return ids;
}

/**
 * The definition as a viewer sees it. A viewer who may see leads-only content
 * gets it unchanged. Anyone else gets a copy without the leads-only pages and
 * questions (and the content blocks on a leads-only page). A branch or `next`
 * that pointed at a removed page follows that page's own fall-through instead,
 * exactly as the runtime walks past a hidden page, so removing a page never
 * ends the questionnaire early.
 */
export function questionnaireForViewer(
  questionnaire: Questionnaire,
  viewer: { seesLeadsOnly: boolean },
): Questionnaire {
  if (viewer.seesLeadsOnly || !hasLeadsOnlyContent(questionnaire)) {
    return questionnaire;
  }
  const pages = questionnaire.pages;
  const removed = new Set(pages.filter(pageIsLeadsOnly).map((page) => page.id));

  // Where a reference to page `id` lands once the removed pages are gone.
  const landing = (target: string): string => {
    let current = target;
    const seen = new Set<string>();
    while (removed.has(current) && !seen.has(current)) {
      seen.add(current);
      const index = pages.findIndex((page) => page.id === current);
      const page = pages[index];
      current = page?.next ?? pages[index + 1]?.id ?? SUBMIT_TARGET;
    }
    return removed.has(current) ? SUBMIT_TARGET : current;
  };
  const retarget = (target: string) =>
    target === SUBMIT_TARGET ? target : landing(target);

  const kept: QuestionnairePage[] = [];
  pages.forEach((page, index) => {
    if (removed.has(page.id)) return;
    // Where this page went in the original (its `next`, else the following
    // page), carried past any removed page. Written out as `next` only when
    // it was explicit or no longer matches the plain fall-through.
    const target = page.next ?? pages[index + 1]?.id ?? SUBMIT_TARGET;
    const landed = target === SUBMIT_TARGET ? target : landing(target);
    const nextField =
      page.next !== undefined || landed !== nextKeptId(pages, removed, index)
        ? { next: landed }
        : {};
    if (page.kind === "intro") {
      const { next: _next, ...rest } = page;
      kept.push({ ...rest, ...nextField });
      return;
    }
    const { next: _next, ...rest } = page;
    kept.push({
      ...rest,
      ...nextField,
      questions: page.questions
        .filter((block) => !blockIsLeadsOnly(block))
        .map((block) =>
          block.kind === "single_select"
            ? {
                ...block,
                options: block.options.map((option) =>
                  option.goTo
                    ? { ...option, goTo: retarget(option.goTo) }
                    : option,
                ),
              }
            : block,
        ),
    });
  });
  return { ...questionnaire, pages: kept };
}

/** The id of the first kept page after `index`, or the submit target. */
function nextKeptId(
  pages: readonly QuestionnairePage[],
  removed: ReadonlySet<string>,
  index: number,
): string {
  for (let i = index + 1; i < pages.length; i += 1) {
    const page = pages[i];
    if (page && !removed.has(page.id)) return page.id;
  }
  return SUBMIT_TARGET;
}

/**
 * Whether a posted payload answers a question this viewer may not see. The
 * save action refuses such a payload whole rather than quietly dropping the
 * answer: a member's runner never shows the question, so a value for it can
 * only come from a hand-made request.
 */
export function answersLeadsOnly(
  questionnaire: Questionnaire,
  viewer: { seesLeadsOnly: boolean },
  responses: Record<string, unknown>,
): boolean {
  if (viewer.seesLeadsOnly) return false;
  for (const id of leadsOnlyQuestionIds(questionnaire)) {
    const value = responses[id];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    return true;
  }
  return false;
}
