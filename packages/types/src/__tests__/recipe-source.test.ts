import { describe, expect, it } from "vitest";
import {
  AnswerQuestionsInput,
  RecipeSourceSections,
  SOURCE_SECTION_MAX,
  SOURCE_SECTIONS,
  SendSourceInput,
  SourceDoc,
  SourceProofread,
} from "../recipe-source";
import type { KitchenRecipeInput } from "../recipe";

const ID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };

/** Every node and mark the editor offers, once. */
const FULL = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "For the sauce" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Stir ", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "gently", marks: [{ type: "italic" }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Salt" }] },
            {
              type: "orderedList",
              attrs: { start: 2 },
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Nested" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function sections(steps: unknown = EMPTY) {
  return { ingredients: EMPTY, equipment: EMPTY, steps, notes: EMPTY };
}

describe("SourceDoc", () => {
  it("keeps every node and mark the editor offers", () => {
    expect(SourceDoc.parse(FULL)).toEqual(FULL);
    expect(SourceDoc.parse(EMPTY)).toEqual(EMPTY);
    expect(SourceDoc.parse({ type: "doc" })).toEqual({ type: "doc" });
  });

  it("refuses any other node type, anywhere in the tree", () => {
    const nested = (node: unknown) => ({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [node] }],
        },
      ],
    });
    for (const node of [
      { type: "blockquote", content: [{ type: "paragraph" }] },
      { type: "codeBlock" },
      { type: "horizontalRule" },
      { type: "table" },
      { type: "image", attrs: { src: "https://x" } },
    ]) {
      expect(
        SourceDoc.safeParse({ type: "doc", content: [node] }).success,
      ).toBe(false);
      expect(SourceDoc.safeParse(nested(node)).success).toBe(false);
    }
    // Inline content only inside a paragraph or a heading.
    expect(
      SourceDoc.safeParse({
        type: "doc",
        content: [{ type: "text", text: "loose" }],
      }).success,
    ).toBe(false);
    expect(SourceDoc.safeParse({ type: "paragraph" }).success).toBe(false);
  });

  it("refuses any mark but bold and italic", () => {
    for (const mark of ["strike", "code", "underline", "link"]) {
      expect(
        SourceDoc.safeParse({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x", marks: [{ type: mark }] }],
            },
          ],
        }).success,
        mark,
      ).toBe(false);
    }
  });

  it("allows headings of level 1 to 3 only", () => {
    const heading = (level: unknown) => ({
      type: "doc",
      content: [{ type: "heading", attrs: { level } }],
    });
    for (const level of [1, 2, 3]) {
      expect(SourceDoc.safeParse(heading(level)).success).toBe(true);
    }
    for (const level of [0, 4, 6, "2", null]) {
      expect(SourceDoc.safeParse(heading(level)).success, String(level)).toBe(
        false,
      );
    }
    expect(
      SourceDoc.safeParse({ type: "doc", content: [{ type: "heading" }] })
        .success,
    ).toBe(false);
  });

  it("drops an attribute it does not know instead of storing it", () => {
    const parsed = SourceDoc.parse({
      type: "doc",
      content: [
        { type: "orderedList", attrs: { start: 1, type: null }, content: [] },
        {
          type: "paragraph",
          attrs: { style: "color:red" },
          content: [
            { type: "text", text: "x", marks: [{ type: "bold", attrs: {} }] },
          ],
        },
      ],
    });
    expect(parsed).toEqual({
      type: "doc",
      content: [
        { type: "orderedList", attrs: { start: 1 }, content: [] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }],
        },
      ],
    });
  });

  it("refuses a section longer than the limit", () => {
    const long = (n: number) => ({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a".repeat(n) }] },
      ],
    });
    const overhead = JSON.stringify(long(1)).length - 1;
    expect(
      SourceDoc.safeParse(long(SOURCE_SECTION_MAX - overhead)).success,
    ).toBe(true);
    expect(
      SourceDoc.safeParse(long(SOURCE_SECTION_MAX - overhead + 1)).success,
    ).toBe(false);
  });
});

describe("RecipeSourceSections and SendSourceInput", () => {
  it("names the four sections in reading order", () => {
    expect(SOURCE_SECTIONS).toEqual([
      "ingredients",
      "equipment",
      "steps",
      "notes",
    ]);
    expect(RecipeSourceSections.safeParse(sections(FULL)).success).toBe(true);
    const { notes: _notes, ...three } = sections();
    expect(RecipeSourceSections.safeParse(three).success).toBe(false);
  });

  it("takes a recipe, the version it was opened on and what it serves", () => {
    expect(
      SendSourceInput.safeParse({
        recipeId: ID_A,
        basedOnSourceId: ID_B,
        serves: 4,
        sections: sections(),
      }).success,
    ).toBe(true);
    expect(
      SendSourceInput.safeParse({
        recipeId: ID_A,
        basedOnSourceId: null,
        serves: null,
        sections: sections(),
      }).success,
    ).toBe(true);
    for (const serves of [0, 501, 2.5]) {
      expect(
        SendSourceInput.safeParse({
          recipeId: ID_A,
          basedOnSourceId: null,
          serves,
          sections: sections(),
        }).success,
        String(serves),
      ).toBe(false);
    }
  });
});

describe("AnswerQuestionsInput", () => {
  it("trims the answer and asks for one", () => {
    expect(
      AnswerQuestionsInput.parse({
        recipeId: ID_A,
        runId: ID_B,
        answer: " 2 kg ",
      }).answer,
    ).toBe("2 kg");
    const empty = AnswerQuestionsInput.safeParse({
      recipeId: ID_A,
      runId: ID_B,
      answer: "   ",
    });
    expect(empty.error?.issues[0]?.message).toBe("Write your answer.");
    expect(
      AnswerQuestionsInput.safeParse({
        recipeId: ID_A,
        runId: ID_B,
        answer: "x".repeat(2_001),
      }).success,
    ).toBe(false);
  });
});

describe("SourceProofread", () => {
  const recipe: KitchenRecipeInput = {
    title: "Dhal",
    plates: 40,
    ingredients: [
      { name: "Red lentils", category: "legume", quantity: 2.4, unit: "kg" },
    ],
    steps: [{ instruction: "Simmer.", uses: ["Red lentils"] }],
  };
  const report = { changed: [], unsure: [] };

  it("takes questions, and no recipe, when Claude needs more", () => {
    const parsed = SourceProofread.parse({
      needsInfo: true,
      questions: ["How much rice?"],
    });
    expect(parsed).toEqual({
      needsInfo: true,
      questions: ["How much rice?"],
      recipe: null,
      report: null,
      scalingNotes: [],
    });
    expect(SourceProofread.safeParse({ needsInfo: true }).success).toBe(false);
    expect(
      SourceProofread.safeParse({
        needsInfo: true,
        questions: ["How much rice?"],
        recipe,
      }).success,
    ).toBe(false);
    expect(
      SourceProofread.safeParse({
        needsInfo: true,
        questions: ["1", "2", "3", "4", "5", "6"],
      }).success,
    ).toBe(false);
  });

  it("takes a recipe with a report and at least one scaling note otherwise", () => {
    expect(
      SourceProofread.safeParse({
        needsInfo: false,
        recipe,
        report,
        scalingNotes: ["Serves 4 in the source; ten times it, less salt."],
      }).success,
    ).toBe(true);
    for (const missing of ["recipe", "report", "scalingNotes"] as const) {
      const answer: Record<string, unknown> = {
        needsInfo: false,
        recipe,
        report,
        scalingNotes: ["Scaled from 4."],
      };
      delete answer[missing];
      expect(SourceProofread.safeParse(answer).success, missing).toBe(false);
    }
  });

  it("describes every field, because it is the tool's schema", () => {
    const shape = SourceProofread as unknown as {
      def: { in?: { shape: Record<string, { description?: string }> } };
      shape?: Record<string, { description?: string }>;
    };
    const fields = shape.shape ?? shape.def.in?.shape ?? {};
    expect(Object.keys(fields).sort()).toEqual(
      ["needsInfo", "questions", "recipe", "report", "scalingNotes"].sort(),
    );
    for (const [name, field] of Object.entries(fields)) {
      expect(field.description, name).toBeTruthy();
    }
  });
});
