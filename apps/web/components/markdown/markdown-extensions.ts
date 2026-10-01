import type { Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

// What the WYSIWYG Markdown editor can write, one list shared by the editor
// and its round-trip test (the Survival Guide's set, #250, used by the meeting
// notes too). Only what Markdown and the reader's renderer (MarkdownBody) both
// carry: headings, bold, italic, bullet and numbered lists, links, quotes and
// line breaks. Code, strike-through and rules are not on the toolbar, but the
// editor still reads and writes them: text typed into the old textareas
// ("Markdown works") may hold them, and an editor that dropped them would save
// the loss over the stored note on the next keystroke. Underline has no
// Markdown, so it stays off. Tiptap's own Markdown extension reads the stored
// Markdown in and writes it back out; the text is kept as Markdown, as before.

export const MARKDOWN_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // The toolbar offers levels 2 and 3; level 1 is kept so text
    // written with "# " elsewhere reads back unchanged.
    heading: { levels: [1, 2, 3] },
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
 * heading or a list at the end (its trailing paragraph), so the text does not
 * end in blank lines nobody typed.
 */
export function editorMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/\s+$/, "");
}
