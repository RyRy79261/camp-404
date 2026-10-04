import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { publicMarkdown, splitMembersOnly } from "@camp404/core";
import { membersOnlyProblem } from "@camp404/types";
import {
  CHAPTER_EDITOR_EXTENSIONS,
  editorMarkdown,
  NOTES_EDITOR_EXTENSIONS,
} from "../markdown-extensions";
import { linkHref } from "../markdown-editor";

// Long text (the Survival Guide, meeting notes) is stored as Markdown and
// edited in a WYSIWYG editor
// (owner, 2026-10-01). Opening a text and saving it untouched must give
// back the Markdown it was opened on, or every save would rewrite text
// nobody changed.

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

function open(
  markdown: string,
  extensions = NOTES_EDITOR_EXTENSIONS as typeof CHAPTER_EDITOR_EXTENSIONS,
): Editor {
  const editor = new Editor({
    extensions,
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

function roundTrip(
  markdown: string,
  extensions = NOTES_EDITOR_EXTENSIONS as typeof CHAPTER_EDITOR_EXTENSIONS,
): string {
  return editorMarkdown(open(markdown, extensions));
}

describe("the Markdown editor's round trip", () => {
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
    [
      "a line break inside a paragraph",
      "Ice goes in at 07:00\nand again at 17:00.",
    ],
    [
      "a meeting's agenda and notes",
      "- The menu for the week\n- Who cooks which night\n\n**Dinner is at 19:00** every night. The camp does no lunch.",
    ],
    // Older notes were typed into a textarea that said "Markdown works": the
    // editor offers none of these, but must not drop them on the next save.
    ["inline code", "Use `gas valve` carefully."],
    ["strike-through", "~~cancelled~~ moved to Friday"],
    ["a rule", "Before\n\n---\n\nAfter"],
    ["a code block", "```\nline one\nline two\n```"],
  ])("keeps %s unchanged", (_what, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
    // A chapter's editor reads and writes plain text the same way.
    expect(roundTrip(markdown, CHAPTER_EDITOR_EXTENSIONS)).toBe(markdown);
  });

  it("writes what the toolbar makes as Markdown", () => {
    const editor = open("Gloves");
    editor.chain().selectAll().toggleBold().run();
    editor.commands.toggleHeading({ level: 2 });
    expect(editorMarkdown(editor)).toBe("## **Gloves**");
  });
});

// A chapter's "Members only" parts (#250's public site): text → editor → text
// unchanged, so a save never moves a fence the server cuts by.
describe("a Members only part in a chapter's editor", () => {
  const PART =
    ":::members\n## The convoy plan\n\nWe leave on the Tuesday.\n\n- Ceres at 07:00\n- Channel 3\n:::";

  it.each([
    ["at the start", `${PART}\n\nThe drive is part of the burn.`],
    ["in the middle", `Before.\n\n${PART}\n\n## The dirt road\n\nAfter.`],
    ["at the end", `The drive is part of the burn.\n\n${PART}`],
    ["holding a heading and a list", PART],
    ["holding a quote", ":::members\n> Radio channel 3.\n:::"],
    ["two in a row", `${PART}\n\n:::members\nSecond.\n:::`],
  ])("keeps one %s unchanged", (_where, markdown) => {
    expect(membersOnlyProblem(markdown)).toBeNull();
    const editor = open(markdown, CHAPTER_EDITOR_EXTENSIONS);
    expect(
      editor.getJSON().content?.some((n) => n.type === "membersOnly"),
    ).toBe(true);
    expect(editorMarkdown(editor)).toBe(markdown);
  });

  it("draws the part as a marked box", () => {
    const editor = open(`Before.\n\n${PART}`, CHAPTER_EDITOR_EXTENSIONS);
    const box = editor.view.dom.querySelector("[data-members-only]");
    expect(box?.textContent).toContain("The convoy plan");
    expect(box?.getAttribute("data-why")).toBe(
      "Not on survival-guide.camp-404.com",
    );
  });

  it("wraps the selected blocks, and unwraps the whole part from inside it", () => {
    const editor = open("One.\n\nTwo.\n\nThree.", CHAPTER_EDITOR_EXTENSIONS);
    // Select from inside "Two." to inside "Three.".
    editor.commands.setTextSelection({ from: 8, to: 14 });
    expect(editor.commands.toggleMembersOnly()).toBe(true);
    const wrapped = editorMarkdown(editor);
    expect(wrapped).toBe("One.\n\n:::members\nTwo.\n\nThree.\n:::");
    expect(membersOnlyProblem(wrapped)).toBeNull();
    // The server cuts exactly what the box holds.
    expect(splitMembersOnly(wrapped)).toEqual([
      { membersOnly: false, markdown: "One." },
      { membersOnly: true, markdown: "Two.\n\nThree." },
    ]);
    expect(publicMarkdown(wrapped)).not.toContain("Two.");

    editor.commands.setTextSelection(9);
    expect(editor.isActive("membersOnly")).toBe(true);
    expect(editor.commands.toggleMembersOnly()).toBe(true);
    expect(editorMarkdown(editor)).toBe("One.\n\nTwo.\n\nThree.");
  });

  it("wraps the whole list when the caret is in one of its items", () => {
    const editor = open("- a\n- b", CHAPTER_EDITOR_EXTENSIONS);
    editor.commands.setTextSelection(3);
    editor.commands.toggleMembersOnly();
    expect(editorMarkdown(editor)).toBe(":::members\n- a\n- b\n:::");
  });

  it("is not in the meeting notes' editor", () => {
    const editor = open("Words.");
    expect(editor.schema.nodes.membersOnly).toBeUndefined();
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
