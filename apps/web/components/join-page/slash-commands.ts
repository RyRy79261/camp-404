// The join-page editor's "/" menu and paste rules (#264), kept apart from the
// editor so they can be tested without a browser.

export type SlashCommandId =
  | "text"
  | "heading"
  | "subheading"
  | "bullets"
  | "numbers"
  | "quote"
  | "divider"
  | "image";

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  hint: string;
  /** Other words a captain might type after "/". */
  keywords: readonly string[];
}

/** Notion's names first, so a captain used to Notion finds them. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: "text", label: "Text", hint: "Plain text", keywords: ["paragraph"] },
  {
    id: "heading",
    label: "Heading",
    hint: "A section of the page",
    keywords: ["h1", "h2", "title", "section"],
  },
  {
    id: "subheading",
    label: "Subheading",
    hint: "A part of a section",
    keywords: ["h3", "small heading"],
  },
  {
    id: "bullets",
    label: "Bulleted list",
    hint: "A list with dots",
    keywords: ["ul", "unordered", "list"],
  },
  {
    id: "numbers",
    label: "Numbered list",
    hint: "A list of steps",
    keywords: ["ol", "ordered", "steps", "list"],
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Set a passage apart",
    keywords: ["blockquote", "callout"],
  },
  {
    id: "divider",
    label: "Divider",
    hint: "A line between parts",
    keywords: ["hr", "rule", "line", "separator"],
  },
  {
    id: "image",
    label: "Picture",
    hint: "Upload a JPEG, PNG or WebP",
    keywords: ["image", "photo", "upload"],
  },
];

/** The commands whose name or keywords start with what was typed after "/". */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().startsWith(q) ||
      c.label.toLowerCase().includes(` ${q}`) ||
      c.keywords.some((k) => k.startsWith(q)),
  );
}

/**
 * What was typed after "/" when the text before the caret ends in a slash
 * command: a "/" at the start of the line or after a space, then letters.
 * Null otherwise, so a date like 24/09 or a link never opens the menu.
 */
export function slashQuery(textBefore: string): string | null {
  const match = /(?:^|\s)\/([a-z ]{0,20})$/i.exec(textBefore);
  if (!match) return null;
  const query = match[1] ?? "";
  // Two spaces, or a space first, means the captain has moved on.
  if (query.startsWith(" ") || query.includes("  ")) return null;
  return query;
}

/**
 * Whether pasted plain text reads as Markdown, so the editor parses it
 * (Notion's "Copy as Markdown", or a page typed in Markdown elsewhere) rather
 * than pasting the # and * as characters.
 */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text) ||
    /^>\s?/m.test(text) ||
    /^(?:---|\*\*\*)\s*$/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /!?\[[^\]\n]*\]\([^)\s]+\)/.test(text)
  );
}

/** Alt text from a file name: "lounge-at-night.jpg" → "lounge at night". */
export function altFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 120);
}
