import { describe, expect, it } from "vitest";
import { BuilderQuestionnaire, type Block, type BuilderPage } from "@camp404/types";

import {
  addBlock,
  addPage,
  blockId,
  moveBlock,
  movePage,
  patchPage,
  removeBlock,
  removePage,
  replaceBlock,
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

  it("moveBlock ignores an out-of-range source index", () => {
    expect(ids(moveBlock(def, "p1", 5, 0), "p1")).toEqual(["a", "h", "b"]);
    expect(ids(moveBlock(def, "p1", -1, 0), "p1")).toEqual(["a", "h", "b"]);
  });

  it("moveBlock clamps a destination past the end / below 0", () => {
    expect(ids(moveBlock(def, "p1", 0, 99), "p1")).toEqual(["h", "b", "a"]);
    expect(ids(moveBlock(def, "p1", 2, -5), "p1")).toEqual(["b", "a", "h"]);
  });

  it("movePage ignores an out-of-range index", () => {
    expect(movePage(def, 9, 0).pages.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("addPage appends at the end when afterPageId is null or unknown", () => {
    const next: BuilderPage = {
      id: "pZ",
      type: "question",
      title: "",
      blocks: [],
    };
    expect(addPage(def, null, next).pages.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "pZ",
    ]);
    expect(addPage(def, "nope", next).pages.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "pZ",
    ]);
  });

  it("replaceBlock swaps a block by id, preserving order", () => {
    const next: Block = { id: "h", kind: "header_break", headingText: "H2" };
    const page = replaceBlock(def, "p1", "h", next).pages.find(
      (p) => p.id === "p1",
    )!;
    expect(page.blocks.map(blockId)).toEqual(["a", "h", "b"]);
    expect(page.blocks[1]).toEqual(next);
  });

  it("patchPage updates title without touching id/blocks", () => {
    const page = patchPage(def, "p1", { title: "New" }).pages.find(
      (p) => p.id === "p1",
    )!;
    expect(page.title).toBe("New");
    expect(page.id).toBe("p1");
    expect(page.blocks.map(blockId)).toEqual(["a", "h", "b"]);
  });
});
