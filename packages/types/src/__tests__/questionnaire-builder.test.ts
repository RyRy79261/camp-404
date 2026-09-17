import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  isAllowedBuilderImageUrl,
  evalVisibleIf,
  isBuilderDefinition,
  numberFits,
  builderQuestionnaireIssues,
  validateBuilderQuestionnaire,
  validateBuilderResponses,
  visibleIfOpsFor,
  visibleIfProblem,
} from "../questionnaire-builder";
import { Question, SliderQuestion } from "../questionnaire";

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

describe("conditions fit the field they reference", () => {
  const choice = Question.parse({
    id: "diet",
    kind: "single_select",
    prompt: "Diet",
    options: [
      { value: "omni", label: "Omni" },
      { value: "veg", label: "Veg" },
    ],
  });
  const many = Question.parse({ ...choice, id: "tags", kind: "multi_select" });
  const yesNo = Question.parse({ id: "lead", kind: "boolean", prompt: "Lead?" });
  const count = Question.parse({ id: "n", kind: "number", prompt: "How many?" });
  const text = Question.parse({ id: "t", kind: "short_text", prompt: "Name" });

  it("offers the operators §2.1 allows for each kind", () => {
    const answered = ["is_answered", "is_empty"];
    expect(visibleIfOpsFor(choice)).toEqual(["eq", "ne", ...answered]);
    expect(visibleIfOpsFor(yesNo)).toEqual(["eq", "ne", ...answered]);
    expect(visibleIfOpsFor(many)).toEqual(["includes", "not_includes", ...answered]);
    expect(visibleIfOpsFor(count)).toEqual(
      ["eq", "ne", "gt", "gte", "lt", "lte", ...answered],
    );
    expect(visibleIfOpsFor(text)).toEqual(answered);
  });

  it("accepts a value the field can hold", () => {
    expect(visibleIfProblem({ fieldId: "diet", op: "eq", value: "veg" }, choice)).toBeNull();
    expect(visibleIfProblem({ fieldId: "tags", op: "includes", value: "omni" }, many)).toBeNull();
    expect(visibleIfProblem({ fieldId: "lead", op: "ne", value: false }, yesNo)).toBeNull();
    expect(visibleIfProblem({ fieldId: "n", op: "gte", value: 3 }, count)).toBeNull();
    expect(visibleIfProblem({ fieldId: "t", op: "is_answered" }, text)).toBeNull();
  });

  it("accepts only a number the number or slider question can give", () => {
    // A number row is whole numbers from min to max (0–6 by default).
    const cond = (value: number) => ({
      fieldId: "n",
      op: "eq" as const,
      value,
    });
    expect(visibleIfProblem(cond(0), count)).toBeNull();
    expect(visibleIfProblem(cond(6), count)).toBeNull();
    expect(visibleIfProblem(cond(7), count)).toBe("wrong_value");
    expect(visibleIfProblem(cond(-1), count)).toBe("wrong_value");
    expect(visibleIfProblem(cond(2.5), count)).toBe("wrong_value");

    const volume = SliderQuestion.parse({
      id: "v",
      kind: "slider",
      prompt: "How loud?",
      min: 0,
      max: 1,
      step: 0.1,
    });
    const on = (value: number) => ({ fieldId: "v", op: "gte" as const, value });
    expect(visibleIfProblem(on(0.3), volume)).toBeNull();
    expect(visibleIfProblem(on(1), volume)).toBeNull();
    expect(visibleIfProblem(on(0.35), volume)).toBe("wrong_value");
    expect(visibleIfProblem(on(1.1), volume)).toBe("wrong_value");
    expect(numberFits(volume, Number.NaN)).toBe(false);
  });

  it("names what is wrong with a condition that does not fit", () => {
    expect(visibleIfProblem({ fieldId: "gone", op: "is_empty" }, undefined)).toBe("missing_field");
    expect(visibleIfProblem({ fieldId: "t", op: "eq", value: "Jo" }, text)).toBe("wrong_operator");
    expect(visibleIfProblem({ fieldId: "diet", op: "eq", value: "vegan" }, choice)).toBe("wrong_value");
    expect(visibleIfProblem({ fieldId: "lead", op: "eq", value: "yes" }, yesNo)).toBe("wrong_value");
    expect(visibleIfProblem({ fieldId: "n", op: "lt" }, count)).toBe("wrong_value");
  });

  it("blocks publishing a condition on a missing option or with the wrong operator", () => {
    const q = build({
      version: "1",
      title: "T",
      pages: [
        {
          ...QUESTION_PAGE,
          blocks: [
            ...QUESTION_PAGE.blocks,
            {
              kind: "question",
              question: { id: "why", kind: "short_text", prompt: "Why veg?" },
              visibleIf: { fieldId: "diet", op: "eq", value: "vegan" },
            },
            {
              kind: "question",
              question: { id: "nick", kind: "short_text", prompt: "Nickname" },
              visibleIf: { fieldId: "name", op: "gt", value: 1 },
            },
          ],
        },
      ],
    });
    const errors = validateBuilderQuestionnaire(q);
    expect(errors).toContain(
      'A block on About you shows-when compares "Diet" with an answer it can\'t have.',
    );
    expect(errors).toContain(
      'A block on About you shows-when uses a condition that doesn\'t fit "Name".',
    );
  });
});

describe("builderQuestionnaireIssues", () => {
  it("places each problem on its page and block, with a code", () => {
    const q = build({
      version: "1",
      title: "",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "About you",
          blocks: [
            {
              kind: "question",
              question: {
                id: "diet",
                kind: "single_select",
                prompt: "Diet",
                options: [
                  { value: "veg", label: "Vegetarian" },
                  { value: "veg", label: "Vegan" },
                ],
              },
            },
            { id: "pic", kind: "image_block", imageUrl: "", altText: "", sizeFit: "fit" },
          ],
        },
        { id: "p2", type: "question", title: "Empty", blocks: [] },
      ],
    });
    expect(
      builderQuestionnaireIssues(q).map((i) => [i.code, i.pageId, i.blockId]),
    ).toEqual([
      ["missing_title", undefined, undefined],
      ["duplicate_option_value", "p1", "diet"],
      ["image_alt_missing", "p1", "pic"],
      ["image_missing", "p1", "pic"],
      ["empty_page", "p2", undefined],
    ]);
  });

  it("gives the same sentences as validateBuilderQuestionnaire", () => {
    const q = build({ version: "1", title: "", pages: [QUESTION_PAGE] });
    expect(builderQuestionnaireIssues(q).map((i) => i.message)).toEqual(
      validateBuilderQuestionnaire(q),
    );
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

describe("isAllowedBuilderImageUrl", () => {
  it("allows the app's Blob store and its own paths", () => {
    expect(
      isAllowedBuilderImageUrl(
        "https://camp404store.public.blob.vercel-storage.com/q/playa.jpg",
      ),
    ).toBe(true);
    expect(isAllowedBuilderImageUrl("/api/avatar/avatars/u1/a.webp")).toBe(true);
  });

  it("refuses other sites, however the link is dressed up", () => {
    for (const url of [
      "https://tracker.example/pixel.gif",
      "http://camp404store.public.blob.vercel-storage.com/a.jpg",
      "https://camp404store.public.blob.vercel-storage.com.evil.example/a.jpg",
      "https://user@camp404store.public.blob.vercel-storage.com/a.jpg",
      "//evil.example/a.jpg",
      "/\\evil.example/a.jpg",
      "/\tevil.example",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
    ]) {
      expect(isAllowedBuilderImageUrl(url)).toBe(false);
    }
  });
});
