import { describe, expect, it } from "vitest";
import { BuilderQuestionnaire } from "@camp404/types";
import { splitPage } from "../builder-ops";

// "Page break": the blocks from the break on move to a new page right after.

const def = BuilderQuestionnaire.parse({
  version: "1",
  title: "T",
  pages: [
    {
      id: "p1",
      type: "content",
      title: "Welcome",
      blocks: [
        { id: "h", kind: "header_break", headingText: "Hi" },
        { id: "d", kind: "divider" },
        { id: "e", kind: "explainer", bodyText: "Read me", style: "plain" },
      ],
    },
    { id: "p2", type: "question", title: "Last", blocks: [] },
  ],
});

describe("splitPage", () => {
  it("moves the blocks from the break onto a new page of the same type, right after", () => {
    const next = splitPage(def, "p1", 1, "new");
    expect(next.pages.map((p) => [p.id, p.type, p.blocks.length])).toEqual([
      ["p1", "content", 1],
      ["new", "content", 2],
      ["p2", "question", 0],
    ]);
    expect(next.pages[1]!.title).toBe("");
  });

  it("starts an empty page when the break is at the end", () => {
    const next = splitPage(def, "p1", 3, "new");
    expect(next.pages.map((p) => [p.id, p.blocks.length])).toEqual([
      ["p1", 3],
      ["new", 0],
      ["p2", 0],
    ]);
  });

  it("leaves the questionnaire alone for an unknown page", () => {
    expect(splitPage(def, "nope", 0, "new")).toBe(def);
  });
});
