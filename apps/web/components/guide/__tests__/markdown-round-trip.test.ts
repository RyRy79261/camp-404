import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  editorMarkdown,
  GUIDE_EDITOR_EXTENSIONS,
} from "../markdown-extensions";
import { linkHref } from "../markdown-editor";

// The Survival Guide is stored as Markdown and edited in a WYSIWYG editor
// (owner, 2026-10-01). Opening a chapter and saving it untouched must give
// back the Markdown it was opened on, or every save would rewrite chapters
// nobody changed.

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: GUIDE_EDITOR_EXTENSIONS,
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editorMarkdown(editor);
}

describe("the guide editor's Markdown round trip", () => {
  it.each([
    [
      "headings, bullet lists and bold",
      "## Before you leave\n\n- Fill up in Ceres: it is the last fuel.\n- Check the **spare tyre** and the jack.\n\n### At the gate\n\nHave your ticket and ID ready.",
    ],
    [
      "numbered lists, italic and links",
      "1. Boil water.\n2. Wash, *then* rinse.\n\nSee [the AfrikaBurn site](https://www.afrikaburn.org) or [Roster](/captains/camp-management).",
    ],
    ["a quote", "> Never pour liquid into the burn barrel."],
    ["a top-level heading", "# Kitchen safety\n\nTurn the gas off."],
    ["a line break inside a paragraph", "Ice goes in at 07:00\nand again at 17:00."],
  ])("keeps %s unchanged", (_what, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("writes what the toolbar makes as Markdown", () => {
    const editor = new Editor({
      extensions: GUIDE_EDITOR_EXTENSIONS,
      content: "Gloves",
      contentType: "markdown",
    });
    editors.push(editor);
    editor.chain().selectAll().toggleBold().run();
    editor.commands.toggleHeading({ level: 2 });
    expect(editorMarkdown(editor)).toBe("## **Gloves**");
  });
});

describe("linkHref", () => {
  it("makes a typed address one a member can follow", () => {
    expect(linkHref("afrikaburn.org")).toBe("https://afrikaburn.org");
    expect(linkHref("https://x.org/a")).toBe("https://x.org/a");
    expect(linkHref("crew@camp-404.com")).toBe("mailto:crew@camp-404.com");
    expect(linkHref("/guide")).toBe("/guide");
    expect(linkHref("javascript:alert(1)")).toBeNull();
    expect(linkHref("//evil.example")).toBeNull();
    expect(linkHref("  ")).toBeNull();
  });
});
