import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_JOIN_CONTENT, inlinePlainText } from "@camp404/types";
import {
  docFromValue,
  PARAGRAPH_EDITOR_EXTENSIONS,
  paragraphsFromValue,
  paragraphsToValue,
  valueFromDoc,
} from "../paragraph-text";

// The join site's paragraphs are edited in the WYSIWYG editor's paragraphs
// mode. Opening words and saving them untouched must give back exactly what
// was stored, and the editor may only write what the join site can show.

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

function open(paragraphs: readonly string[]): Editor {
  const editor = new Editor({
    extensions: PARAGRAPH_EDITOR_EXTENSIONS,
    content: docFromValue(paragraphsToValue(paragraphs)),
  });
  editors.push(editor);
  return editor;
}

const saved = (editor: Editor) =>
  paragraphsFromValue(valueFromDoc(editor.getJSON()));

describe("the paragraphs editor's round trip", () => {
  it.each([
    ["the README's words", DEFAULT_JOIN_CONTENT.readme.paragraphs],
    ["the words under the teams", DEFAULT_JOIN_CONTENT.teams.outro],
    [
      "bold and italic",
      ["In the desert **everyone** builds, and *everyone* packs."],
    ],
    [
      "characters a Markdown parser would eat",
      ["# Not a heading", "- not a list", "> not a quote", "2 * 3 x_y [a]"],
    ],
  ])("keeps %s unchanged", (_what, paragraphs) => {
    expect(saved(open(paragraphs))).toEqual(paragraphs);
  });

  it("reads a typed backslash back the same, though it is stored escaped", () => {
    const [p] = saved(open(["a \\ b"]));
    expect(inlinePlainText(p!)).toBe("a \\ b");
  });

  it("writes the toolbar's bold as **bold**", () => {
    const editor = open(["Everyone builds."]);
    editor.commands.setTextSelection({ from: 1, to: 9 });
    editor.commands.toggleBold();
    expect(saved(editor)).toEqual(["**Everyone** builds."]);
  });

  it("offers no headings, lists or links: typed signs stay as words", () => {
    const editor = open([""]);
    editor.commands.insertContent("## Not a heading");
    expect(saved(editor)).toEqual(["## Not a heading"]);
    expect(editor.can().toggleHeading?.({ level: 2 })).toBeFalsy();
  });
});
