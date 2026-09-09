import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  boundDraftResponses,
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

  // `team` (short_text, maxLength 120) and `crew` (single_select) are both
  // hidden while `lead` !== true — the branch that skips required checks and
  // retains whatever the client sent under those ids.
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
            question: {
              id: "team",
              kind: "short_text",
              prompt: "Team",
              required: true,
              maxLength: 120,
            },
            visibleIf: { fieldId: "lead", op: "eq", value: true },
          },
          {
            kind: "question",
            question: {
              id: "crew",
              kind: "single_select",
              prompt: "Crew",
              required: false,
              options: [
                { value: "kitchen", label: "Kitchen" },
                { value: "build", label: "Build" },
              ],
            },
            visibleIf: { fieldId: "lead", op: "eq", value: true },
          },
        ],
      },
    ],
  });

  it("skips required checks for fields hidden by visibleIf, retaining their value", () => {
    // `team` is hidden because `lead` !== true → its required check is skipped,
    // and with nothing sent for it there is nothing to retain.
    const res = validateBuilderResponses(gated, { lead: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.responses).toEqual({ lead: false });
    }
  });

  it("retains a hidden field value that is still valid", () => {
    const res = validateBuilderResponses(gated, { lead: false, team: "Kitchen" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.responses.team).toBe("Kitchen");
  });

  it("drops a hidden field value that is not a legal answer for that field", () => {
    // REFUSED CASE: `team` is hidden, so nothing validates it on the old code
    // path — a hand-made request could smuggle 5 KB past a maxLength of 120.
    const res = validateBuilderResponses(gated, {
      lead: false,
      team: "x".repeat(5000),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect("team" in res.responses).toBe(false);
  });

  it("drops a hidden select value that is not one of its options", () => {
    // REFUSED CASE: option allow-lists are the only constraint on select
    // values, and the hidden branch used to bypass them entirely.
    const res = validateBuilderResponses(gated, { lead: false, crew: "sound" });
    expect(res.ok).toBe(true);
    if (res.ok) expect("crew" in res.responses).toBe(false);
  });
});

describe("boundDraftResponses", () => {
  it("drops keys not in the definition", () => {
    // REFUSED CASE: a draft save accepts whatever the client posts, so the
    // allow-list is the only thing keeping foreign keys out of the JSONB.
    const res = boundDraftResponses({ a: 1, unknown: "y", polluted: "x" }, ["a"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.responses).toEqual({ a: 1 });
  });

  it("rejects an oversized draft", () => {
    // REFUSED CASE: one allowed key holding ~200 KB, past the 128 KB cap.
    const res = boundDraftResponses({ a: "x".repeat(200 * 1024) }, ["a"]);
    expect(res.ok).toBe(false);
  });

  it("rejects a structurally malformed payload", () => {
    // REFUSED CASE: nested objects are not a legal response value, and the
    // onboarding draft path had no equivalent check at all.
    const res = boundDraftResponses({ a: { nested: true } }, ["a"]);
    expect(res.ok).toBe(false);
  });

  it("accepts an incomplete draft", () => {
    // The resume guarantee: a draft may leave required answers absent.
    const res = boundDraftResponses({ a: "partial" }, ["a", "b"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.responses).toEqual({ a: "partial" });
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

  it("rejects a questionnaire with no input fields", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "content",
          title: "Welcome",
          blocks: [{ id: "hdr", kind: "header_break", headingText: "Hi" }],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /at least one input/i.test(e))).toBe(true);
  });

  it("rejects a form where no page is visible under empty answers", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          visibleIf: { fieldId: "x", op: "is_answered" },
          blocks: [
            { kind: "question", question: { id: "a", kind: "short_text", prompt: "A" } },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /shows no pages/i.test(e))).toBe(true);
  });

  it("rejects two question blocks sharing an id", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          blocks: [
            { kind: "question", question: { id: "dup", kind: "short_text", prompt: "First" } },
            { kind: "question", question: { id: "dup", kind: "short_text", prompt: "Second" } },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /used twice/i.test(e) && e.includes("dup"))).toBe(
      true,
    );
  });

  // The subtle half of the duplicate-id bug. `earlier` (the shows-when
  // forward-reference set) is keyed by question id, so the FIRST 'dup' seeds
  // it and the second block's condition — which references its own id, and is
  // therefore dangling — sails through the reference check. Before the
  // duplicate check existed this definition published with ZERO errors.
  it("rejects the shows-when reference that a duplicate id makes pass spuriously", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          blocks: [
            { kind: "question", question: { id: "dup", kind: "boolean", prompt: "First" } },
            {
              kind: "question",
              question: { id: "dup", kind: "short_text", prompt: "Second" },
              visibleIf: { fieldId: "dup", op: "eq", value: true },
            },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    // The forward-reference check itself still passes — that is the bug — so
    // the duplicate check is what has to block the publish.
    expect(errors.some((e) => /shows-when/i.test(e))).toBe(false);
    expect(errors.some((e) => /used twice/i.test(e))).toBe(true);
  });

  it("rejects a content block whose id collides with a page id", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          id: "shared",
          type: "question",
          title: "P",
          blocks: [
            { id: "shared", kind: "header_break", headingText: "Hi" },
            { kind: "question", question: { id: "a", kind: "short_text", prompt: "A" } },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /used twice/i.test(e))).toBe(true);
  });

  it("rejects a numeric range nothing can satisfy", () => {
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
              question: { id: "s", kind: "slider", prompt: "Slider", min: 5, max: 5 },
            },
            {
              kind: "question",
              question: { id: "n", kind: "number", prompt: "Number", min: 6, max: 2 },
            },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.filter((e) => /maximum above its minimum/i.test(e))).toHaveLength(
      2,
    );
  });

  it("rejects a slider whose step strides past its whole range", () => {
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
              question: {
                id: "s",
                kind: "slider",
                prompt: "Slider",
                min: 0,
                max: 5,
                step: 10,
              },
            },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /step of 10/i.test(e))).toBe(true);
  });

  it("rejects an authored option value on the reserved other: prefix", () => {
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
              question: {
                id: "meal",
                kind: "single_select",
                prompt: "Meal",
                options: [
                  { value: "pizza", label: "Pizza" },
                  { value: "other:braai", label: "Braai" },
                ],
              },
            },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors.some((e) => /reserved/i.test(e))).toBe(true);
  });

  it("passes an allowOther choice field with a healthy range", () => {
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
              question: {
                id: "meal",
                kind: "single_select",
                prompt: "Meal",
                allowOther: true,
                options: [
                  { value: "pizza", label: "Pizza" },
                  { value: "braai", label: "Braai" },
                ],
              },
            },
            {
              kind: "question",
              question: { id: "s", kind: "slider", prompt: "Slider", min: 1, max: 5 },
            },
          ],
        },
      ],
    });
    expect(validateBuilderQuestionnaire(q)).toEqual([]);
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

  it("treats adding, removing, or editing a visibleIf as breaking", () => {
    const withCond = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            QUESTION_PAGE.blocks[0],
            QUESTION_PAGE.blocks[1],
            {
              ...QUESTION_PAGE.blocks[2],
              visibleIf: { fieldId: "name", op: "is_answered" },
            },
          ],
        },
      ],
    });
    expect(classifyChange(base, withCond)).toBe("breaking"); // add
    expect(classifyChange(withCond, base)).toBe("breaking"); // remove
    const edited = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            QUESTION_PAGE.blocks[0],
            QUESTION_PAGE.blocks[1],
            {
              ...QUESTION_PAGE.blocks[2],
              visibleIf: { fieldId: "name", op: "is_empty" },
            },
          ],
        },
      ],
    });
    expect(classifyChange(withCond, edited)).toBe("breaking"); // edit
  });

  it("treats turning 'Other…' off as breaking, and turning it on as cosmetic", () => {
    const withOther = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            QUESTION_PAGE.blocks[0],
            QUESTION_PAGE.blocks[1],
            {
              kind: "question",
              question: {
                id: "diet",
                kind: "single_select",
                prompt: "Diet",
                required: false,
                allowOther: true,
                options: [
                  { value: "omni", label: "Omni" },
                  { value: "veg", label: "Veg" },
                ],
              },
            },
          ],
        },
      ],
    });
    // Off ⇒ every stored `other:` answer becomes invalid, exactly like
    // removing an option.
    expect(classifyChange(withOther, base)).toBe("breaking");
    expect(classifyChange(base, withOther)).toBe("cosmetic");
  });

  it("treats adding a text format as breaking and dropping it as cosmetic", () => {
    const formatted = build({
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
                format: "email",
              },
            },
            QUESTION_PAGE.blocks[1],
            QUESTION_PAGE.blocks[2],
          ],
        },
      ],
    });
    expect(classifyChange(base, formatted)).toBe("breaking");
    expect(classifyChange(formatted, base)).toBe("cosmetic");
  });
});
