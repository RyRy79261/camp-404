import type { Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

// What the Survival Guide's editor can write (#250), one list shared by the
// editor and its round-trip test. Only what Markdown and the reader's renderer
// (MarkdownBody) both carry: headings, bold, italic, bullet and numbered
// lists, links, quotes and line breaks. Code, strike-through, underline and
// rules are off, so the editor never offers what a member could not read the
// same way. Tiptap's own Markdown extension reads the stored Markdown in and
// writes it back out; the chapter is kept as Markdown, as before.

export const GUIDE_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // The toolbar offers levels 2 and 3; level 1 is kept so a chapter
    // written with "# " elsewhere reads back unchanged.
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
    },
  }),
  Markdown,
];

/**
 * The editor's text as Markdown, without the empty lines Tiptap keeps after a
 * heading or a list at the end (its trailing paragraph), so a chapter does not
 * end in blank lines nobody typed.
 */
export function editorMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/\s+$/, "");
}
