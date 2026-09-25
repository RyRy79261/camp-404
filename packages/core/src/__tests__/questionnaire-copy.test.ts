import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  Questionnaire,
  SUBMIT_TARGET,
  flattenQuestions,
  fromBuilderQuestionnaire,
  type QuestionsPage,
} from "@camp404/types";
import { BUILDER_V1_QUESTIONNAIRE } from "../__fixtures__/questionnaire-builder-v1";
import { regenerateQuestionnaireIds } from "../questionnaire-copy";
import { validateQuestionnaireDefinition } from "../questionnaire-definition";

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

/** Every id and every reference to one, wherever it sits. */
function idsAndRefs(q: Questionnaire) {
  const ids: string[] = [];
  const refs: string[] = [];
  for (const page of q.pages) {
    ids.push(page.id);
    if (page.next) refs.push(page.next);
    if (page.kind !== "questions") continue;
    if (page.visibleIf) refs.push(page.visibleIf.fieldId);
    for (const block of page.questions) {
      ids.push(block.id);
      if (block.visibleIf) refs.push(block.visibleIf.fieldId);
      if (block.kind === "single_select") {
        for (const o of block.options) if (o.goTo) refs.push(o.goTo);
      }
    }
  }
  return { ids, refs };
}

describe("regenerateQuestionnaireIds", () => {
  // 'team' (question-level) and page 2 (page-level) both show-when 'lead'.
  const branching = fromBuilderQuestionnaire(
    BuilderQuestionnaire.parse({
      version: "1",
      title: "Branchy",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "Page 1",
          blocks: [
            {
              kind: "question",
              question: {
                id: "lead",
                kind: "boolean",
                prompt: "Lead?",
                required: true,
              },
            },
            {
              kind: "question",
              question: {
                id: "team",
                kind: "short_text",
                prompt: "Team",
                required: false,
              },
              visibleIf: { fieldId: "lead", op: "eq", value: true },
            },
          ],
        },
        {
          id: "p2",
          type: "question",
          title: "Page 2",
          visibleIf: { fieldId: "lead", op: "eq", value: true },
          blocks: [
            {
              kind: "question",
              question: {
                id: "why",
                kind: "long_text",
                prompt: "Why",
                required: false,
              },
            },
          ],
        },
      ],
    }),
  );

  it("mints fresh ids and remaps page- and question-level visibleIf to the new question id", () => {
    const copy = regenerateQuestionnaireIds(branching, counter("new"));
    const { ids, refs } = idsAndRefs(copy);
    for (const old of idsAndRefs(branching).ids) expect(ids).not.toContain(old);
    const clonedLead = flattenQuestions(copy)[0]!.id;
    expect(refs).toEqual([clonedLead, clonedLead]);
  });

  it("keeps the copy as publishable as the original (no dangling shows-when)", () => {
    const copy = regenerateQuestionnaireIds(branching, counter("id"));
    expect(validateQuestionnaireDefinition(branching).ok).toBe(true);
    expect(validateQuestionnaireDefinition(copy).ok).toBe(true);
  });

  it("copies the frozen builder fixture with every condition still pointing inside the copy", () => {
    const original = fromBuilderQuestionnaire(
      BuilderQuestionnaire.parse(BUILDER_V1_QUESTIONNAIRE),
    );
    const copy = regenerateQuestionnaireIds(original, counter("c"));
    const { ids, refs } = idsAndRefs(copy);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ref of refs) expect(ids).toContain(ref);
    expect(validateQuestionnaireDefinition(copy).ok).toBe(true);
    // Only the ids changed: the same number of pages and questions, in order.
    expect(flattenQuestions(copy).map((q) => q.prompt)).toEqual(
      flattenQuestions(original).map((q) => q.prompt),
    );
  });

  it("remaps page routing — next and goTo — and keeps the submit target", () => {
    const routed = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "hello",
          kind: "intro",
          heading: "Hi",
          body: "Welcome",
          next: "p1",
        },
        {
          id: "p1",
          kind: "questions",
          title: "P1",
          next: "p3",
          questions: [
            {
              id: "go",
              kind: "single_select",
              prompt: "Go?",
              options: [
                { value: "skip", label: "Skip", goTo: SUBMIT_TARGET },
                { value: "on", label: "On", goTo: "p2" },
                { value: "plain", label: "Plain" },
              ],
            },
            {
              id: "grid",
              kind: "multi_choice_grid",
              prompt: "Grid",
              rows: [{ id: "r1", label: "Row" }],
              columns: [{ value: "c1", label: "Col" }],
            },
          ],
        },
        {
          id: "p2",
          kind: "questions",
          title: "P2",
          questions: [{ id: "a", kind: "email", prompt: "A" }],
        },
        {
          id: "p3",
          kind: "questions",
          title: "P3",
          questions: [{ id: "b", kind: "email", prompt: "B" }],
        },
      ],
    });
    const copy = regenerateQuestionnaireIds(routed, counter("r"));
    const [intro, p1, p2, p3] = copy.pages;
    expect(intro!.next).toBe(p1!.id);
    expect(p1!.next).toBe(p3!.id);
    const go = (p1 as QuestionsPage).questions[0]!;
    if (go.kind !== "single_select") throw new Error("expected a choice");
    expect(go.options.map((o) => o.goTo)).toEqual([
      SUBMIT_TARGET,
      p2!.id,
      undefined,
    ]);
    // Grid rows key the answer inside the question, so they stay.
    const grid = (p1 as QuestionsPage).questions[1]!;
    expect(grid.kind === "multi_choice_grid" && grid.rows[0]!.id).toBe("r1");
    expect(validateQuestionnaireDefinition(copy).ok).toBe(true);
    expect(routed.pages[0]!.id).toBe("hello"); // the original is untouched
  });
});
