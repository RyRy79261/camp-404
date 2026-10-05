import type { JSONContent } from "@tiptap/react";
import { parseInline, serializeInline, type InlineRun } from "@camp404/types";

// The WYSIWYG editor's "paragraphs" mode: words kept as a list of paragraphs
// with **bold** and *italic* inside them (the join site's README words, the
// text under the teams, each perk file; parseInline in @camp404/types). The
// join site and About both read that list, so the editor may only write what
// it holds: paragraphs, bold and italic. Headings, lists, quotes and links are
// switched off (typing "## " or "- " stays as typed), and the stored text is
// turned into the editor's document and back by our own small dialect, never
// a Markdown parser, so an old paragraph opens and saves exactly as it was.
//
// The editor's value in this mode is the paragraphs joined by a blank line;
// `paragraphsFromValue` splits it back.
//
// No editor code is imported here (only a type): the join-site words, About
// and every MarkdownField's preview read paragraphs through this file, and
// none of them should download Tiptap for it. The editor's extensions for
// this mode are PARAGRAPH_EDITOR_EXTENSIONS in
// components/guide/markdown-extensions.ts.

const BREAK = "\n\n";

export function paragraphsToValue(paragraphs: readonly string[]): string {
  return paragraphs.join(BREAK);
}

/** The value back to a list of paragraphs; empty ones are dropped. */
export function paragraphsFromValue(value: string): string[] {
  return value
    .split(BREAK)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The editor's document for a value. */
export function docFromValue(value: string): JSONContent {
  const paragraphs = paragraphsFromValue(value);
  return {
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((p) => ({
      type: "paragraph",
      content: parseInline(p).map((run) => ({
        type: "text",
        text: run.text,
        ...(run.bold || run.italic
          ? {
              marks: [
                ...(run.bold ? [{ type: "bold" }] : []),
                ...(run.italic ? [{ type: "italic" }] : []),
              ],
            }
          : {}),
      })),
    })),
  };
}

/** The editor's document back to a value. */
export function valueFromDoc(doc: JSONContent): string {
  const paragraphs = (doc.content ?? []).map((block) => {
    const runs: InlineRun[] = (block.content ?? [])
      .filter((node) => node.type === "text" && node.text)
      .map((node) => {
        const marks = new Set((node.marks ?? []).map((m) => m.type));
        return {
          text: node.text!.replace(/\s*\n\s*/g, " "),
          ...(marks.has("bold") ? { bold: true as const } : {}),
          ...(marks.has("italic") ? { italic: true as const } : {}),
        };
      });
    return serializeInline(runs).trim();
  });
  return paragraphsToValue(paragraphs.filter(Boolean));
}
