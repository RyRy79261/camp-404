import { describe, expect, it } from "vitest";
import {
  RecipeSourceSections,
  SourceDoc,
  type RecipeSourceSections as Sections,
} from "@camp404/types";
import {
  emptySourceSections,
  sameSections,
  sameSource,
  sectionText,
  sourceFromText,
  sourceText,
} from "../recipe-source";

const EMPTY = {
  type: "doc" as const,
  content: [{ type: "paragraph" as const }],
};

const para = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});

const bullets = (...items: string[]) => ({
  type: "bulletList" as const,
  content: items.map((text) => ({
    type: "listItem" as const,
    content: [para(text)],
  })),
});

describe("sourceText", () => {
  it("writes each section under its header and leaves empty ones out", () => {
    const sections: Sections = {
      ...emptySourceSections(),
      ingredients: {
        type: "doc",
        content: [bullets("2 cups red lentils", "Salt")],
      },
      steps: {
        type: "doc",
        content: [
          {
            type: "orderedList",
            content: [
              { type: "listItem", content: [para("Rinse.")] },
              { type: "listItem", content: [para("Simmer.")] },
            ],
          },
        ],
      },
    };
    expect(sourceText(sections)).toBe(
      [
        "## Ingredients",
        "- 2 cups red lentils",
        "- Salt",
        "",
        "## Steps",
        "1. Rinse.",
        "2. Simmer.",
      ].join("\n"),
    );
    expect(sourceText(emptySourceSections())).toBe("");
  });

  it("writes marks, inner headings, breaks, numbering and nesting", () => {
    const doc = SourceDoc.parse({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "For the sauce" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Stir", marks: [{ type: "bold" }] },
            { type: "text", text: " then " },
            { type: "text", text: "rest", marks: [{ type: "italic" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "hot",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [para("Three"), bullets("Inner a", "Inner b")],
            },
            { type: "listItem", content: [para("Four")] },
          ],
        },
      ],
    });
    expect(sectionText(doc)).toBe(
      [
        "### For the sauce",
        "**Stir** then *rest*",
        "***hot***",
        "3. Three",
        "   - Inner a",
        "   - Inner b",
        "4. Four",
      ].join("\n"),
    );
  });
});

describe("sourceFromText", () => {
  it("puts a text with no headings in Steps, a paragraph per line", () => {
    const sections = sourceFromText(
      "Boil the rice.\n\n  Add salt.  \r\nServe.",
    );
    expect(sections).toEqual({
      ingredients: EMPTY,
      equipment: EMPTY,
      steps: {
        type: "doc",
        content: [para("Boil the rice."), para("Add salt."), para("Serve.")],
      },
      notes: EMPTY,
    });
  });

  it("splits on the headings recipes use, and turns bullet runs into lists", () => {
    const sections = sourceFromText(
      [
        "Camp dhal",
        "## Ingredients",
        "- 2 cups red lentils",
        "* Salt",
        "• Cumin",
        "You will need:",
        "Big pot",
        "METHOD",
        "Rinse.",
        "- Simmer.",
        "Tips",
        "It catches; stir.",
        "Directions:",
        "Serve hot.",
      ].join("\n"),
    );
    expect(sections.ingredients).toEqual({
      type: "doc",
      content: [bullets("2 cups red lentils", "Salt", "Cumin")],
    });
    expect(sections.equipment).toEqual({
      type: "doc",
      content: [para("Big pot")],
    });
    expect(sections.steps).toEqual({
      type: "doc",
      content: [
        para("Camp dhal"),
        para("Rinse."),
        bullets("Simmer."),
        para("Serve hot."),
      ],
    });
    expect(sections.notes).toEqual({
      type: "doc",
      content: [para("It catches; stir.")],
    });
    // Whatever comes out is a source the server accepts.
    expect(RecipeSourceSections.safeParse(sections).success).toBe(true);
  });

  it("keeps a line that only mentions a section as text", () => {
    const sections = sourceFromText("Notes on the ingredients\n*bold* start");
    expect(sections.steps.content).toEqual([
      para("Notes on the ingredients"),
      para("*bold* start"),
    ]);
  });

  it("reads its own text back to the same sections: a round trip", () => {
    const pasted = [
      "Rinse first.",
      "Ingredients",
      "- Lentils",
      "- Salt",
      "Tip: cook slowly",
      "Method",
      "Boil.",
      "Notes",
      "- Freezes well",
    ].join("\n");
    const sections = sourceFromText(pasted);
    const text = sourceText(sections);
    expect(text).toBe(
      [
        "## Ingredients",
        "- Lentils",
        "- Salt",
        "Tip: cook slowly",
        "",
        "## Steps",
        "Rinse first.",
        "Boil.",
        "",
        "## Notes",
        "- Freezes well",
      ].join("\n"),
    );
    const again = sourceFromText(text);
    expect(again).toEqual(sections);
    expect(
      sameSource({ serves: null, sections }, { serves: null, sections: again }),
    ).toBe(true);
  });

  it("gives four empty sections for empty text", () => {
    expect(sourceFromText("  \n\n")).toEqual(emptySourceSections());
  });
});

describe("sameSource", () => {
  const base = sourceFromText("Ingredients\n- Salt\nMethod\nBoil.");

  it("is blind to key order and to keys left undefined", () => {
    const reordered = JSON.parse(
      JSON.stringify(base, (_k, v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
    ) as Sections;
    expect(
      sameSource(
        { serves: 4, sections: base },
        { serves: 4, sections: reordered },
      ),
    ).toBe(true);
    const withUndefined: Sections = {
      ...base,
      notes: {
        type: "doc",
        content: [{ type: "paragraph", content: undefined }],
      },
    };
    expect(
      sameSource(
        { serves: 4, sections: base },
        { serves: 4, sections: withUndefined },
      ),
    ).toBe(true);
  });

  it("sees a change to the serves or to any section", () => {
    expect(
      sameSource(
        { serves: 4, sections: base },
        { serves: null, sections: base },
      ),
    ).toBe(false);
    const edited = sourceFromText("Ingredients\n- Salt\nMethod\nBoil well.");
    expect(
      sameSource(
        { serves: 4, sections: base },
        { serves: 4, sections: edited },
      ),
    ).toBe(false);
    const marked: Sections = {
      ...base,
      steps: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Boil.", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    };
    expect(
      sameSource(
        { serves: 4, sections: base },
        { serves: 4, sections: marked },
      ),
    ).toBe(false);
  });
});

describe("sameSections", () => {
  const base = sourceFromText("Ingredients\n- Salt\nMethod\nBoil.");

  it("compares the words only, so a serves-only change is the same words", () => {
    const again = sourceFromText("Ingredients\n- Salt\nMethod\nBoil.");
    expect(sameSections(base, again)).toBe(true);
    // sameSource sees the serves; sameSections does not look at it.
    expect(
      sameSource({ serves: 4, sections: base }, { serves: 6, sections: again }),
    ).toBe(false);
    const edited = sourceFromText("Ingredients\n- Salt\nMethod\nBoil well.");
    expect(sameSections(base, edited)).toBe(false);
  });
});
