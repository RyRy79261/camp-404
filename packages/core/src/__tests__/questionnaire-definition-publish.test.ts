import { describe, expect, it } from "vitest";
import {
  BUILDER_LIMITS,
  PARTICIPATION_INTENT_OPTIONS,
  SUBMIT_TARGET,
  attendanceQuestionnaire,
  type Questionnaire,
} from "@camp404/types";
import {
  definitionLimitErrors,
  validateQuestionnaireDefinition,
  type DefinitionIssue,
  type DefinitionIssueCode,
} from "../questionnaire-definition";

// The publish rules the unified definition check took from Camp 404's builder
// (AB's structural rules are pinned in questionnaire-definition.test.ts, and
// parity with the builder's own check in questionnaire-builder-parity.test.ts).

const BLOB = "https://camp404.public.blob.vercel-storage.com/";

function issues(raw: unknown): DefinitionIssue[] {
  const result = validateQuestionnaireDefinition(raw);
  return result.ok ? [] : result.issues;
}

function codes(raw: unknown): DefinitionIssueCode[] {
  return issues(raw).map((issue) => issue.code);
}

/** One page of blocks, publishable apart from what a test adds. */
function onePage(
  blocks: unknown[],
  page: Record<string, unknown> = {},
  def: Record<string, unknown> = {},
) {
  return {
    version: "1",
    ...def,
    pages: [
      {
        id: "p1",
        kind: "questions",
        title: "Page one",
        questions: [
          { id: "anchor", kind: "email", prompt: "Email", required: false },
          ...blocks,
        ],
        ...page,
      },
    ],
  };
}

describe("a publishable definition", () => {
  it("has no issues", () => {
    expect(issues(onePage([]))).toEqual([]);
  });
});

describe("titles", () => {
  it("refuses a blank questionnaire title, but not an absent one", () => {
    expect(codes(onePage([], {}, { title: "   " }))).toEqual(["missing_title"]);
    expect(codes(onePage([], {}, { title: "Food" }))).toEqual([]);
  });

  it("refuses a page with no title at publish, locating the page", () => {
    expect(issues(onePage([], { title: "" }))).toEqual([
      {
        path: "pages[0].title",
        code: "missing_page_title",
        message: "Page 1 needs a title.",
        pageId: "p1",
      },
    ]);
  });
});

describe("blocks", () => {
  it("refuses an empty page and a definition with no inputs", () => {
    const got = codes({
      version: "1",
      pages: [{ id: "p1", kind: "questions", title: "P", questions: [] }],
    });
    expect(got).toContain("empty_page");
    expect(got).toContain("no_inputs");
  });

  it("refuses an input on a content page", () => {
    expect(issues(onePage([], { pageType: "content" }))).toEqual([
      expect.objectContaining({
        code: "input_on_content_page",
        pageId: "p1",
        blockId: "anchor",
      }),
    ]);
  });

  it("refuses an image block without a picture or alt text, and one from another site", () => {
    expect(
      codes(onePage([{ id: "img", kind: "image_block", url: "", alt: " " }])),
    ).toEqual(["image_alt_missing", "image_missing"]);
    expect(
      codes(
        onePage([
          {
            id: "img",
            kind: "image_block",
            url: "https://tracker.example/pixel.gif",
            alt: "A pixel",
          },
        ]),
      ),
    ).toEqual(["image_host"]);
    expect(
      codes(
        onePage([
          { id: "img", kind: "image_block", url: `${BLOB}a.png`, alt: "A" },
          { id: "img2", kind: "image_block", url: "/maps/b.png", alt: "B" },
        ]),
      ),
    ).toEqual([]);
  });

  it("refuses an option image from another site", () => {
    expect(
      codes(
        onePage([
          {
            id: "pick",
            kind: "single_select",
            prompt: "Pick",
            display: "image_grid",
            options: [
              { value: "a", label: "A", imageUrl: `${BLOB}a.png` },
              {
                value: "b",
                label: "B",
                imageUrl: "https://elsewhere.example/b.png",
              },
            ],
          },
        ]),
      ),
    ).toEqual(["image_host"]);
  });
});

describe("visibleIf", () => {
  it("needs the question it references to come first", () => {
    const later = onePage(
      [{ id: "later", kind: "boolean", prompt: "Later?" }],
      { visibleIf: { fieldId: "later", op: "eq", value: true } },
    );
    expect(codes(later)).toContain("dangling_visible_if");
  });

  it("refuses a condition on the question itself", () => {
    expect(
      codes(
        onePage([
          {
            id: "self",
            kind: "boolean",
            prompt: "Self?",
            visibleIf: { fieldId: "self", op: "is_answered" },
          },
        ]),
      ),
    ).toEqual(["dangling_visible_if"]);
  });

  it("refuses an operator or value the referenced question can't have", () => {
    const pick = {
      id: "pick",
      kind: "toggle",
      prompt: "Pick",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    };
    expect(
      codes(
        onePage([
          pick,
          {
            id: "d",
            kind: "divider",
            visibleIf: { fieldId: "pick", op: "gt", value: 1 },
          },
        ]),
      ),
    ).toEqual(["visible_if_wrong_operator"]);
    expect(
      codes(
        onePage([
          pick,
          {
            id: "d",
            kind: "divider",
            visibleIf: { fieldId: "pick", op: "eq", value: "c" },
          },
        ]),
      ),
    ).toEqual(["visible_if_wrong_value"]);
  });

  it("refuses a definition that shows no page before anything is answered", () => {
    expect(
      codes({
        version: "1",
        pages: [
          {
            id: "p1",
            kind: "questions",
            title: "P",
            visibleIf: { fieldId: "ghost", op: "is_answered" },
            questions: [{ id: "q", kind: "email", prompt: "Q" }],
          },
        ],
      }),
    ).toEqual(["dangling_visible_if", "no_visible_page"]);
  });
});

describe("roles and ranges", () => {
  it("lets a copied role sit on one question only, but repeats emergency contacts", () => {
    const allergy = (id: string) => ({
      id,
      kind: "short_text",
      prompt: id,
      role: "dietary_allergies",
    });
    expect(codes(onePage([allergy("a1"), allergy("a2")]))).toEqual([
      "duplicate_role",
    ]);
    const contact = (id: string) => ({
      id,
      kind: "short_text",
      prompt: id,
      role: "emergency_contact_name",
    });
    expect(codes(onePage([contact("c1"), contact("c2")]))).toEqual([]);
  });

  it("publishes the one-click attendance questionnaire as it is built", () => {
    const result = validateQuestionnaireDefinition(attendanceQuestionnaire());
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it("refuses a Coming this year question without exactly yes, maybe and no, or with Other", () => {
    const coming = (over: Record<string, unknown> = {}) => ({
      id: "coming",
      kind: "single_select",
      prompt: "Coming?",
      role: "participation_intent",
      options: PARTICIPATION_INTENT_OPTIONS,
      ...over,
    });
    expect(codes(onePage([coming()]))).toEqual([]);
    // Labels are the captain's to word; only the values are fixed.
    expect(
      codes(
        onePage([
          coming({
            options: [
              { value: "maybe", label: "Not sure" },
              { value: "yes", label: "Yebo" },
              { value: "no", label: "Nope" },
            ],
          }),
        ]),
      ),
    ).toEqual([]);
    expect(codes(onePage([coming({ allowOther: true })]))).toEqual([
      "participation_options",
    ]);
    expect(
      codes(
        onePage([
          coming({
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          }),
        ]),
      ),
    ).toEqual(["participation_options"]);
    expect(
      codes(
        onePage([
          coming({
            options: [
              ...PARTICIPATION_INTENT_OPTIONS,
              { value: "later", label: "Later" },
            ],
          }),
        ]),
      ),
    ).toEqual(["participation_options"]);
    const wrong = issues(
      onePage([
        coming({
          options: [
            { value: "option_1", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
          ],
        }),
      ]),
    );
    expect(wrong).toEqual([
      expect.objectContaining({
        code: "participation_options",
        path: expect.stringMatching(/^pages\[0\]\.questions\[\d+\]\.options$/),
        blockId: "coming",
      }),
    ]);
    // Only one question may set a member's place.
    expect(codes(onePage([coming(), coming({ id: "again" })]))).toEqual([
      "duplicate_role",
    ]);
  });

  it("refuses a slider or number range nobody can answer", () => {
    expect(
      codes(
        onePage([{ id: "s", kind: "slider", prompt: "S", min: 5, max: 5 }]),
      ),
    ).toEqual(["invalid_range"]);
    expect(
      codes(
        onePage([
          { id: "s", kind: "slider", prompt: "S", min: 0, max: 3, step: 5 },
        ]),
      ),
    ).toEqual(["invalid_range"]);
    expect(
      codes(
        onePage([{ id: "n", kind: "number", prompt: "N", min: 6, max: 1 }]),
      ),
    ).toEqual(["invalid_range"]);
  });

  it("accepts the narrowest linear scale the schema allows", () => {
    // A 1–1 scale is refused by the schema (max ≥ 2); a 0/1–2 one is fine.
    expect(
      codes(
        onePage([
          { id: "l", kind: "linear_scale", prompt: "L", min: 1, max: 2 },
        ]),
      ),
    ).toEqual([]);
  });

  it("refuses duplicate and reserved values on a scale, a toggle and a combobox", () => {
    expect(
      codes(
        onePage([
          {
            id: "sc",
            kind: "scale",
            prompt: "Scale",
            steps: [
              { value: "x", label: "X" },
              { value: "x", label: "X again" },
            ],
          },
          {
            id: "co",
            kind: "combobox",
            prompt: "Combo",
            options: [
              { value: "other:za", label: "ZA" },
              { value: "nz", label: "NZ" },
            ],
          },
        ]),
      ),
    ).toEqual(["duplicate_option_value", "reserved_option_value"]);
  });

  it("never checks attended years for authored values", () => {
    expect(
      codes(onePage([{ id: "y", kind: "years", prompt: "Years?" }])),
    ).toEqual([]);
  });
});

describe("branching with visibility", () => {
  it("keeps a page reachable through a hidden page's fall-through", () => {
    expect(
      codes({
        version: "1",
        pages: [
          {
            id: "a",
            kind: "questions",
            title: "A",
            questions: [{ id: "show", kind: "boolean", prompt: "Show B?" }],
          },
          {
            id: "b",
            kind: "questions",
            title: "B",
            visibleIf: { fieldId: "show", op: "eq", value: true },
            questions: [{ id: "qb", kind: "email", prompt: "B" }],
          },
          {
            id: "c",
            kind: "questions",
            title: "C",
            questions: [
              {
                id: "qc",
                kind: "single_select",
                prompt: "Done?",
                options: [
                  { value: "y", label: "Y", goTo: SUBMIT_TARGET },
                  { value: "n", label: "N" },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("addresses a branch issue to its page", () => {
    const got = issues({
      version: "1",
      pages: [
        {
          id: "a",
          kind: "questions",
          title: "A",
          next: "nowhere",
          questions: [{ id: "q", kind: "email", prompt: "Q" }],
        },
      ],
    });
    expect(got).toEqual([
      expect.objectContaining({
        code: "unknown_branch_target",
        path: "pages[0].next",
        pageId: "a",
      }),
    ]);
  });
});

describe("definitionLimitErrors", () => {
  const base = (questions: unknown[], title?: string): Questionnaire =>
    ({
      version: "1",
      ...(title === undefined ? {} : { title }),
      pages: [{ id: "p", kind: "questions", title: "P", questions }],
    }) as Questionnaire;

  it("passes a definition inside every bound, draft or not", () => {
    expect(definitionLimitErrors(base([]))).toEqual([]);
    expect(
      definitionLimitErrors(
        base([{ id: "i", kind: "image_block", url: "", alt: "" }]),
      ),
    ).toEqual([]);
  });

  it("bounds the title, the page count and the blocks per page", () => {
    expect(
      definitionLimitErrors(
        base([], "x".repeat(BUILDER_LIMITS.titleLength + 1)),
      )[0],
    ).toMatch(/title/);
    const pages = Array.from({ length: BUILDER_LIMITS.pages + 1 }, (_, i) => ({
      id: `p${i}`,
      kind: "intro",
      heading: "H",
      body: "B",
    }));
    expect(
      definitionLimitErrors({ version: "1", pages } as Questionnaire)[0],
    ).toMatch(/at most/);
    const blocks = Array.from(
      { length: BUILDER_LIMITS.blocksPerPage + 1 },
      (_, i) => ({
        id: `d${i}`,
        kind: "divider",
      }),
    );
    expect(definitionLimitErrors(base(blocks))[0]).toMatch(/more than/);
  });

  it("bounds a question's options, and a grid's rows and columns", () => {
    const options = Array.from(
      { length: BUILDER_LIMITS.optionsPerQuestion + 1 },
      (_, i) => ({ value: `v${i}`, label: `V${i}` }),
    );
    expect(
      definitionLimitErrors(
        base([{ id: "s", kind: "single_select", prompt: "S", options }]),
      )[0],
    ).toMatch(/options/);
    const rows = options.map((o) => ({ id: o.value, label: o.label }));
    expect(
      definitionLimitErrors(
        base([
          {
            id: "g",
            kind: "checkbox_grid",
            prompt: "G",
            rows,
            columns: [{ value: "a", label: "A" }],
          },
        ]),
      )[0],
    ).toMatch(/options/);
    expect(
      definitionLimitErrors(base([{ id: "y", kind: "years", prompt: "Y" }])),
    ).toEqual([]);
  });

  it("refuses an image from another site even in a draft, and long or huge text", () => {
    expect(
      definitionLimitErrors(
        base([
          {
            id: "i",
            kind: "image_block",
            url: "https://x.example/p.gif",
            alt: "",
          },
        ]),
      )[0],
    ).toMatch(/another website/);
    expect(
      definitionLimitErrors(
        base([
          {
            id: "e",
            kind: "explainer",
            bodyText: "x".repeat(BUILDER_LIMITS.textLength + 1),
            style: "plain",
          },
        ]),
      )[0],
    ).toMatch(/longer than/);
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      kind: "explainer",
      bodyText: "x".repeat(BUILDER_LIMITS.textLength),
      style: "plain",
    }));
    expect(definitionLimitErrors(base(many)).at(-1)).toMatch(/too large/);
  });
});
