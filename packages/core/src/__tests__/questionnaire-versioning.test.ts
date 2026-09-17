import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  Questionnaire,
  fromBuilderQuestionnaire,
  parseStoredDefinition,
} from "@camp404/types";
import { BUILDER_V1_QUESTIONNAIRE } from "../__fixtures__/questionnaire-builder-v1";
import { classifyChange } from "../questionnaire-versioning";

// Whether a re-publish mints a new version and re-gates every member on the
// next send. Camp 404's builder rules, run over unified definitions: the
// builder cases below are the ones the builder's own classifier was tested on,
// fed through the conversion every stored builder row now goes through.

/** A builder definition as the server reads it: parsed, then unified. */
function build(raw: unknown): Questionnaire {
  return fromBuilderQuestionnaire(BuilderQuestionnaire.parse(raw));
}

/** A unified definition as the server reads it. */
function unified(raw: unknown): Questionnaire {
  return Questionnaire.parse(raw);
}

describe("a stored builder snapshot against the same questionnaire saved unified", () => {
  // THE REGRESSION THIS GUARDS: publish compares the head with the live
  // snapshot. Old snapshots stay in the builder's shape; a head saved after the
  // move is unified. If the two were compared as stored, the first re-publish
  // of every questionnaire would read as breaking, mint a version nobody
  // changed, and ask every member to answer again on the next send.
  const snapshot: unknown = JSON.parse(JSON.stringify(BUILDER_V1_QUESTIONNAIRE));
  const head: unknown = JSON.parse(
    JSON.stringify(parseStoredDefinition(BUILDER_V1_QUESTIONNAIRE)),
  );

  it("is cosmetic in both directions", () => {
    expect(snapshot).not.toEqual(head); // the stored JSON really does differ
    expect(
      classifyChange(parseStoredDefinition(snapshot), parseStoredDefinition(head)),
    ).toBe("cosmetic");
    expect(
      classifyChange(parseStoredDefinition(head), parseStoredDefinition(snapshot)),
    ).toBe("cosmetic");
  });

  it("still sees a real breaking edit made after the move", () => {
    const edited = parseStoredDefinition(head);
    const page = edited.pages[2]!;
    if (page.kind !== "questions") throw new Error("expected a questions page");
    const meal = page.questions.find((b) => b.id === "meal");
    if (meal?.kind !== "single_select") throw new Error("expected meal");
    meal.required = false;
    expect(classifyChange(parseStoredDefinition(snapshot), edited)).toBe(
      "breaking",
    );
  });
});

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

describe("classifyChange on builder definitions", () => {
  const base = build({ version: "1", title: "T", pages: [QUESTION_PAGE] });
  const withBlocks = (blocks: unknown[]) =>
    build({ version: "1", title: "T", pages: [{ ...QUESTION_PAGE, blocks }] });
  const [name, hdr, diet] = QUESTION_PAGE.blocks;

  it("treats a relabel, short label included, as cosmetic", () => {
    const next = withBlocks([
      {
        kind: "question",
        question: {
          id: "name",
          kind: "short_text",
          prompt: "Your name",
          shortLabel: "Name",
          required: true,
        },
      },
      hdr,
      diet,
    ]);
    expect(classifyChange(base, next)).toBe("cosmetic");
  });

  it("treats adding a field, flipping required, removing an option, or narrowing a bound as breaking", () => {
    expect(
      classifyChange(
        base,
        withBlocks([
          ...QUESTION_PAGE.blocks,
          { kind: "question", question: { id: "extra", kind: "short_text", prompt: "X" } },
        ]),
      ),
    ).toBe("breaking");
    expect(classifyChange(withBlocks([name, hdr]), base)).toBe("breaking");
    expect(
      classifyChange(
        base,
        withBlocks([
          {
            kind: "question",
            question: { id: "name", kind: "short_text", prompt: "Name", required: false },
          },
          hdr,
          diet,
        ]),
      ),
    ).toBe("breaking");
    expect(
      classifyChange(
        base,
        withBlocks([
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
          hdr,
          diet,
        ]),
      ),
    ).toBe("breaking");
    expect(
      classifyChange(
        base,
        withBlocks([
          name,
          hdr,
          {
            kind: "question",
            question: {
              id: "diet",
              kind: "single_select",
              prompt: "Diet",
              required: false,
              options: [
                { value: "omni", label: "Omni" },
                { value: "vegan", label: "Vegan" },
              ],
            },
          },
        ]),
      ),
    ).toBe("breaking");
    expect(
      classifyChange(
        base,
        withBlocks([
          { kind: "question", question: { id: "name", kind: "email", prompt: "Name" } },
          hdr,
          diet,
        ]),
      ),
    ).toBe("breaking");
  });

  it("treats adding, removing, or editing a visibleIf as breaking", () => {
    const withCond = withBlocks([
      name,
      hdr,
      { ...diet, visibleIf: { fieldId: "name", op: "is_answered" } },
    ]);
    expect(classifyChange(base, withCond)).toBe("breaking"); // add
    expect(classifyChange(withCond, base)).toBe("breaking"); // remove
    const edited = withBlocks([
      name,
      hdr,
      { ...diet, visibleIf: { fieldId: "name", op: "is_empty" } },
    ]);
    expect(classifyChange(withCond, edited)).toBe("breaking"); // edit
  });

  it("treats turning 'Other…' off as breaking, and turning it on as cosmetic", () => {
    const withOther = withBlocks([
      name,
      hdr,
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
    ]);
    // Off ⇒ every stored `other:` answer becomes invalid, exactly like
    // removing an option.
    expect(classifyChange(withOther, base)).toBe("breaking");
    expect(classifyChange(base, withOther)).toBe("cosmetic");
  });

  it("treats adding a text format as breaking and dropping it as cosmetic", () => {
    const formatted = withBlocks([
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
      hdr,
      diet,
    ]);
    expect(classifyChange(base, formatted)).toBe("breaking");
    expect(classifyChange(formatted, base)).toBe("cosmetic");
  });

  it("treats narrowing a slider or number range as breaking, and widening it as cosmetic", () => {
    const ranged = (min: number, max: number) =>
      withBlocks([
        name,
        { kind: "question", question: { id: "n", kind: "number", prompt: "N", min, max } },
      ]);
    expect(classifyChange(ranged(0, 6), ranged(1, 6))).toBe("breaking");
    expect(classifyChange(ranged(0, 6), ranged(0, 5))).toBe("breaking");
    expect(classifyChange(ranged(1, 5), ranged(0, 6))).toBe("cosmetic");
  });
});

// --- What only the unified model can express --------------------------------

function onePage(questions: unknown[], page: Record<string, unknown> = {}) {
  return unified({
    version: "1",
    pages: [{ id: "p1", kind: "questions", title: "P", questions, ...page }],
  });
}

describe("classifyChange on the unified model's own fields", () => {
  it("treats a tighter selection, length, scale, rating or numeric-text bound as breaking", () => {
    const pairs: [unknown, unknown][] = [
      [
        { id: "m", kind: "multi_select", prompt: "M", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        { id: "m", kind: "multi_select", prompt: "M", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], minSelections: 1 },
      ],
      [
        { id: "m", kind: "multi_select", prompt: "M", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], maxSelections: 2 },
        { id: "m", kind: "multi_select", prompt: "M", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], maxSelections: 1 },
      ],
      [
        { id: "t", kind: "long_text", prompt: "T" },
        { id: "t", kind: "long_text", prompt: "T", minLength: 5 },
      ],
      [
        { id: "l", kind: "linear_scale", prompt: "L", min: 0, max: 10 },
        { id: "l", kind: "linear_scale", prompt: "L", min: 1, max: 10 },
      ],
      [
        { id: "r", kind: "rating", prompt: "R", steps: 5 },
        { id: "r", kind: "rating", prompt: "R", steps: 4 },
      ],
      [
        { id: "s", kind: "short_text", prompt: "S", format: "integer", max: 10 },
        { id: "s", kind: "short_text", prompt: "S", format: "integer", max: 9 },
      ],
      [
        { id: "s", kind: "short_text", prompt: "S", format: "number" },
        { id: "s", kind: "short_text", prompt: "S", format: "number", min: 0 },
      ],
    ];
    for (const [before, after] of pairs) {
      expect(classifyChange(onePage([before]), onePage([after]))).toBe(
        "breaking",
      );
      expect(classifyChange(onePage([after]), onePage([before]))).toBe(
        "cosmetic",
      );
    }
  });

  it("treats a grid losing a row or a column as breaking, and gaining one as cosmetic", () => {
    const grid = (rows: string[], columns: string[]) =>
      onePage([
        {
          id: "g",
          kind: "checkbox_grid",
          prompt: "G",
          rows: rows.map((id) => ({ id, label: id })),
          columns: columns.map((value) => ({ value, label: value })),
        },
      ]);
    expect(classifyChange(grid(["a", "b"], ["x"]), grid(["a"], ["x"]))).toBe(
      "breaking",
    );
    expect(classifyChange(grid(["a"], ["x", "y"]), grid(["a"], ["x"]))).toBe(
      "breaking",
    );
    expect(classifyChange(grid(["a"], ["x"]), grid(["a", "b"], ["x", "y"]))).toBe(
      "cosmetic",
    );
  });

  describe("routing", () => {
    const choice = (goTo?: string) => ({
      id: "go",
      kind: "single_select",
      prompt: "Go?",
      options: [
        { value: "yes", label: "Yes", ...(goTo ? { goTo } : {}) },
        { value: "no", label: "No" },
      ],
    });
    const routed = (goTo: string | undefined, next?: string, reversed = false) => {
      const pages = [
        { id: "p1", kind: "questions", title: "P1", questions: [choice(goTo)], ...(next ? { next } : {}) },
        { id: "p2", kind: "questions", title: "P2", questions: [{ id: "a", kind: "email", prompt: "A" }] },
        { id: "p3", kind: "questions", title: "P3", questions: [{ id: "b", kind: "email", prompt: "B" }] },
      ];
      return unified({
        version: "1",
        pages: reversed ? [pages[0], pages[2], pages[1]] : pages,
      });
    };

    it("treats adding, removing or retargeting a goTo or next as breaking", () => {
      expect(classifyChange(routed(undefined), routed("p3"))).toBe("breaking");
      expect(classifyChange(routed("p3"), routed(undefined))).toBe("breaking");
      expect(classifyChange(routed("p3"), routed("p2"))).toBe("breaking");
      expect(classifyChange(routed(undefined), routed(undefined, "p3"))).toBe(
        "breaking",
      );
      expect(classifyChange(routed("p3"), routed("p3"))).toBe("cosmetic");
    });

    it("treats reordering pages as breaking only while something routes", () => {
      expect(classifyChange(routed("p3"), routed("p3", undefined, true))).toBe(
        "breaking",
      );
      expect(
        classifyChange(routed(undefined), routed(undefined, undefined, true)),
      ).toBe("cosmetic");
    });
  });
});
