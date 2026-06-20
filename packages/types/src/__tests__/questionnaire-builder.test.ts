import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  classifyChange,
  evalVisibleIf,
  isBuilderDefinition,
  regenerateBuilderIds,
  validateBuilderQuestionnaire,
  validateBuilderResponses,
} from "../questionnaire-builder";

// Parse raw fixtures so Zod fills the defaulted fields (maxLength, required, …).
function build(raw: unknown): BuilderQuestionnaire {
  return BuilderQuestionnaire.parse(raw);
}

const QUESTION_PAGE = {
  id: "p1",
  type: "question",
  title: "About you",
  blocks: [
    {
      kind: "question",
      question: { id: "name", kind: "short_text", prompt: "Name", required: true },
    },
    { id: "hdr", kind: "header_break", headingText: "More" },
    {
      kind: "question",
      question: {
        id: "diet",
        kind: "single_select",
        prompt: "Diet",
        required: false,
        options: [
          { value: "omni", label: "Omni" },
          { value: "veg", label: "Veg" },
        ],
      },
    },
  ],
};

describe("regenerateBuilderIds", () => {
  // 'team' (block-level) and page 2 (page-level) both show-when 'lead' answers.
  const branching = build({
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
            question: { id: "lead", kind: "boolean", prompt: "Lead?", required: true },
          },
          {
            kind: "question",
            question: { id: "team", kind: "short_text", prompt: "Team", required: false },
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
            question: { id: "why", kind: "long_text", prompt: "Why", required: false },
          },
        ],
      },
    ],
  });

  it("mints fresh ids and remaps page- and block-level visibleIf to the new field id", () => {
    let n = 0;
    const copy = regenerateBuilderIds(branching, () => `new-${n++}`);

    const questionIds: string[] = [];
    const visibleRefs: string[] = [];
    for (const page of copy.pages) {
      if (page.visibleIf) visibleRefs.push(page.visibleIf.fieldId);
      for (const block of page.blocks) {
        if (block.visibleIf) visibleRefs.push(block.visibleIf.fieldId);
        if (block.kind === "question") questionIds.push(block.question.id);
      }
    }

    // No original id survives the clone.
    expect(copy.pages.map((p) => p.id)).not.toContain("p1");
    expect(questionIds).not.toContain("lead");

    // Both visibleIf refs now point at the cloned 'lead' (first question), not
    // the orphaned old id.
    const clonedLead = questionIds[0];
    expect(visibleRefs).toEqual([clonedLead, clonedLead]);
  });

  it("keeps the copy as publishable as the original (no dangling shows-when)", () => {
    let n = 0;
    const copy = regenerateBuilderIds(branching, () => `id-${n++}`);
    expect(validateBuilderQuestionnaire(branching)).toEqual([]);
    expect(validateBuilderQuestionnaire(copy)).toEqual([]);
  });
});

describe("isBuilderDefinition", () => {
  it("distinguishes builder pages (blocks) from legacy pages (questions)", () => {
    expect(isBuilderDefinition({ pages: [{ blocks: [] }] })).toBe(true);
    expect(isBuilderDefinition({ pages: [{ kind: "questions", questions: [] }] })).toBe(
      false,
    );
    expect(isBuilderDefinition(null)).toBe(false);
    expect(isBuilderDefinition({ pages: [] })).toBe(false);
  });
});

describe("validateBuilderResponses", () => {
  const q = build({ version: "1", title: "T", pages: [QUESTION_PAGE] });

  it("errors on a missing required field, never on content blocks", () => {
    const res = validateBuilderResponses(q, {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.name).toBeTruthy();
      expect(res.errors.hdr).toBeUndefined();
    }
  });

  it("accepts valid answers and never emits content-block keys", () => {
    const res = validateBuilderResponses(q, { name: "Ada", diet: "veg" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.responses).toEqual({ name: "Ada", diet: "veg" });
      expect("hdr" in res.responses).toBe(false);
    }
  });

  it("skips required checks for fields hidden by visibleIf, retaining their value", () => {
    const gated = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "Gated",
          blocks: [
            {
              kind: "question",
              question: { id: "lead", kind: "boolean", prompt: "Lead?", required: true },
            },
            {
              kind: "question",
              question: { id: "team", kind: "short_text", prompt: "Team", required: true },
              visibleIf: { fieldId: "lead", op: "eq", value: true },
            },
          ],
        },
      ],
    });
    // `team` is hidden because `lead` !== true → its required check is skipped.
    const res = validateBuilderResponses(gated, { lead: false });
    expect(res.ok).toBe(true);
  });
});

describe("evalVisibleIf", () => {
  it("handles eq, includes, and answeredness; unanswered compares are false", () => {
    expect(evalVisibleIf({ fieldId: "x", op: "eq", value: "a" }, { x: "a" })).toBe(true);
    expect(evalVisibleIf({ fieldId: "x", op: "eq", value: "a" }, { x: "b" })).toBe(false);
    expect(evalVisibleIf({ fieldId: "x", op: "eq", value: "a" }, {})).toBe(false);
    expect(evalVisibleIf({ fieldId: "x", op: "is_answered" }, {})).toBe(false);
    expect(evalVisibleIf({ fieldId: "x", op: "is_empty" }, {})).toBe(true);
    expect(
      evalVisibleIf({ fieldId: "x", op: "includes", value: "k" }, { x: ["k", "z"] }),
    ).toBe(true);
    expect(evalVisibleIf({ fieldId: "x", op: "gte", value: 3 }, { x: 4 })).toBe(true);
  });
});

describe("validateBuilderQuestionnaire (publish-time)", () => {
  it("passes a well-formed questionnaire", () => {
    const q = build({ version: "1", title: "T", pages: [QUESTION_PAGE] });
    expect(validateBuilderQuestionnaire(q)).toEqual([]);
  });

  it("rejects an input field on a content page, and a missing title", () => {
    const q = build({
      version: "1",
      title: "",
      pages: [
        {
          id: "p1",
          type: "content",
          title: "Welcome",
          blocks: [
            { kind: "question", question: { id: "n", kind: "short_text", prompt: "N" } },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /content page/i.test(e))).toBe(true);
    expect(errors.some((e) => /title/i.test(e))).toBe(true);
  });

  it("rejects an image block with no alt text and a forward visibleIf reference", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          blocks: [
            {
              kind: "question",
              question: { id: "a", kind: "short_text", prompt: "A" },
              visibleIf: { fieldId: "later", op: "is_answered" },
            },
            { id: "img", kind: "image_block", imageUrl: "u", altText: "  ", sizeFit: "fit" },
            { kind: "question", question: { id: "later", kind: "short_text", prompt: "L" } },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /alt text/i.test(e))).toBe(true);
    expect(errors.some((e) => /shows-when/i.test(e))).toBe(true);
  });
});

describe("classifyChange", () => {
  const base = build({ version: "1", title: "T", pages: [QUESTION_PAGE] });

  it("treats a relabel as cosmetic", () => {
    const next = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            {
              kind: "question",
              question: { id: "name", kind: "short_text", prompt: "Your name", required: true },
            },
            { id: "hdr", kind: "header_break", headingText: "More" },
            QUESTION_PAGE.blocks[2],
          ],
        },
      ],
    });
    expect(classifyChange(base, next)).toBe("cosmetic");
  });

  it("treats adding a field, flipping required, removing an option, or narrowing a bound as breaking", () => {
    const addField = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            ...QUESTION_PAGE.blocks,
            { kind: "question", question: { id: "extra", kind: "short_text", prompt: "X" } },
          ],
        },
      ],
    });
    expect(classifyChange(base, addField)).toBe("breaking");

    const requiredFlip = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            {
              kind: "question",
              question: { id: "name", kind: "short_text", prompt: "Name", required: false },
            },
            QUESTION_PAGE.blocks[1],
            QUESTION_PAGE.blocks[2],
          ],
        },
      ],
    });
    expect(classifyChange(base, requiredFlip)).toBe("breaking");

    const narrow = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            {
              kind: "question",
              question: {
                id: "name",
                kind: "short_text",
                prompt: "Name",
                required: true,
                maxLength: 10,
              },
            },
            QUESTION_PAGE.blocks[1],
            QUESTION_PAGE.blocks[2],
          ],
        },
      ],
    });
    expect(classifyChange(base, narrow)).toBe("breaking");
  });
});
