import { describe, expect, it } from "vitest";
import { BuilderQuestionnaire, type Block } from "@camp404/types";

import {
  addBlock,
  addPage,
  blockId,
  moveBlock,
  movePage,
  removeBlock,
  removePage,
} from "../builder-ops";

const def = BuilderQuestionnaire.parse({
  version: "1",
  title: "T",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "One",
      blocks: [
        { kind: "question", question: { id: "a", kind: "short_text", prompt: "A" } },
        { id: "h", kind: "header_break", headingText: "H" },
        { kind: "question", question: { id: "b", kind: "short_text", prompt: "B" } },
      ],
    },
    { id: "p2", type: "content", title: "Two", blocks: [] },
  ],
});

const ids = (d: typeof def, pageId: string) =>
  d.pages.find((p) => p.id === pageId)!.blocks.map(blockId);

describe("builder-ops", () => {
  it("blockId resolves question vs content ids", () => {
    expect(def.pages[0]!.blocks.map(blockId)).toEqual(["a", "h", "b"]);
  });

  it("moveBlock reorders within a page only", () => {
    expect(ids(moveBlock(def, "p1", 0, 2), "p1")).toEqual(["h", "b", "a"]);
  });

  it("movePage reorders pages", () => {
    expect(movePage(def, 0, 1).pages.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("addBlock appends to the target page", () => {
    const block: Block = {
      kind: "question",
      question: {
        id: "c",
        kind: "short_text",
        prompt: "C",
        required: false,
        maxLength: 120,
      },
    };
    expect(ids(addBlock(def, "p1", block), "p1")).toEqual(["a", "h", "b", "c"]);
  });

  it("removeBlock drops a block by id", () => {
    expect(ids(removeBlock(def, "p1", "h"), "p1")).toEqual(["a", "b"]);
  });

  it("addPage inserts after the given page", () => {
    const next = addPage(def, "p1", {
      id: "pX",
      type: "question",
      title: "",
      blocks: [],
    });
    expect(next.pages.map((p) => p.id)).toEqual(["p1", "pX", "p2"]);
  });

  it("removePage drops a page but always keeps at least one", () => {
    expect(removePage(def, "p2").pages.map((p) => p.id)).toEqual(["p1"]);
    const single = removePage(def, "p2");
    expect(removePage(single, "p1").pages.map((p) => p.id)).toEqual(["p1"]);
  });
});
