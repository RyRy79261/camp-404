// Markdown → plain text. The one place the app un-formats a body.
//
// PURE: no I/O, no DOM, no parser dependency — a deliberate strip, like
// AfrikaBurn's `apps/org/components/bulletins/preview-text.ts`, rather than a
// second markdown implementation. The real rendering is react-markdown behind
// rehype-sanitize (apps/web/components/announcements/markdown-body.tsx); this
// only has to read cleanly as prose.
//
// WHY IT EXISTS: a captain writes an announcement in markdown, and the app
// renders it on the two surfaces where a member reads the WHOLE message. Every
// other surface is a plain-text boundary, and each one needs this:
//   - the push payload (packages/db/src/push.ts) — a toast showing "**Water**"
//   - the email (packages/core/src/notification-email.ts) — the text part has
//     no markdown renderer, and the HTML part escapes what it is given
//   - the Telegram body (packages/telegram/src/handlers.ts) — sent with no
//     parse_mode, so markers would show as typed
//   - any clipped preview: the inbox rows and the captain's own list cards
//
// The `max` argument is the switch between the two shapes:
//   - omitted → the whole body as plain text, paragraph breaks kept. For a
//     channel that carries the entire message (email, Telegram, push).
//   - given → collapsed to ONE line and clamped, with an ellipsis when it was
//     cut. For a row that shows a taste of the message and links to the rest.
//
// Line-anchored patterns below all use `[ \t]`, never `\s`: with the `m` flag
// `^\s*` happily eats the blank line BEFORE it, which silently welded a
// captain's paragraphs together.
//
// IT STRIPS COMMONMARK, AND ONLY COMMONMARK — the same dialect the renderer
// parses (react-markdown with no remark-gfm). So `~~closed~~` is NOT stripped:
// the announcement page shows those tildes, and a push that quietly deleted
// them would make the two channels say different things about the bar. If GFM
// is ever switched on in the renderer, the strikethrough rule belongs back
// here in the same change.

/** The characters markdown lets a `\` escape. */
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!>~|])/g;

/**
 * An escaped character, parked out of the way while the strip runs. A captain
 * who typed `\*` means a literal star, and the emphasis rules below must not
 * read it as one. The marker is a Unicode private-use character, which has no
 * meaning of its own and is cleared from the input first, so a body cannot
 * smuggle one in and steer the restore.
 */
const MARK = "\uE000";
const PARKED = /\uE000(\d+)\uE000/g;

/** Fence lines of a code block: the fence goes, the code inside stays. */
const CODE_FENCE = /^[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*$/gm;

/** A thematic break: `---`, `***`, `___` (three or more, spaces allowed). */
const THEMATIC_BREAK =
  /^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/gm;

/**
 * A setext heading: a line of words with a row of `=` or `-` under it. The
 * renderer turns it into a heading, so the row of punctuation has to go here
 * too, or a push notification reads "Burn night ========". Runs BEFORE
 * THEMATIC_BREAK, which is what CommonMark does: an underline wins over a
 * rule when there are words above it.
 */
const SETEXT_HEADING =
  /^(?=[ \t]{0,3}\S)([^\n]+)\n[ \t]{0,3}(?:=+|-+)[ \t]*$/gm;

/**
 * Applied in order. Block markers first (they are anchored to line starts and
 * would be disturbed by inline edits), then links before emphasis so that
 * `[**Water**](…)` loses the link and then the bold.
 */
const RULES: readonly [RegExp, string][] = [
  [CODE_FENCE, ""],
  [/`+([^`\n]*)`+/g, "$1"], // inline code → its contents
  [/!\[([^\]]*)\]\([^)\s]*(?:[ \t]+[^)]*)?\)/g, "$1"], // image → its alt text
  [/\[([^\]]*)\]\([^)\s]*(?:[ \t]+[^)]*)?\)/g, "$1"], // link → its text
  [/\[([^\]]*)\]\[[^\]]*\]/g, "$1"], // reference link → its text
  [/^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S+[^\n]*$/gm, ""], // reference definition
  [/<((?:https?|mailto):[^>\s]+)>/g, "$1"], // autolink → the bare URL
  [SETEXT_HEADING, "$1"],
  [THEMATIC_BREAK, ""],
  [/^[ \t]{0,3}#{1,6}(?:[ \t]+|[ \t]*$)/gm, ""], // ATX heading marker
  [/^(?:[ \t]{0,3}>[ \t]?)+/gm, ""], // block quote markers, however nested
  [/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, ""], // list bullets and numbers
  [/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1"], // **bold**
  [/__(?=\S)([\s\S]*?\S)__/g, "$1"], // __bold__
  [/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2"], // *italic*
  // `_italic_` only when the underscores stand alone: `activation_id` and
  // `camp_404_rules` keep theirs, because a member reading a key needs it.
  [/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2"],
  [/[ \t]+/g, " "], // runs of spaces/tabs
  [/[ \t]+$/gm, ""], // trailing spaces a line no longer needs
  [/^[ \t]+/gm, ""], // the indent a stripped marker left behind
];

/**
 * Strip markdown syntax from `markdown`, leaving the words.
 *
 * With no `max`, paragraph breaks survive (runs of blank lines collapse to
 * one) — the shape an email body or a Telegram message wants. With a `max`,
 * the result is squashed onto one line and cut to that many characters, with
 * an ellipsis when anything was dropped — the shape a clipped row wants.
 *
 * Safe to apply to EVERY notification body, not only the ones a captain wrote
 * in markdown — but "safe" is not "unchanged". Prose with no markers comes
 * back as it went in, apart from whitespace tidying; text that merely looks
 * like markdown ("1. Setup" on its own line, `_pending_`) loses those markers.
 * That is the point rather than a cost: the same body is parsed as markdown by
 * the renderer, so the page shows it as a list or an italic too, and the two
 * readings agree. What must never diverge is this function and
 * `apps/web/components/announcements/markdown-body.tsx`.
 */
export function plainPreview(markdown: string, max?: number): string {
  const parked = markdown
    .replace(/\r\n?/g, "\n")
    .replaceAll(MARK, "")
    .replace(
      ESCAPED,
      (_match, ch: string) => `${MARK}${ch.charCodeAt(0)}${MARK}`,
    );

  const stripped = RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    parked,
  ).replace(PARKED, (_match, code: string) =>
    String.fromCharCode(Number(code)),
  );

  if (max === undefined) {
    return stripped.replace(/\n{3,}/g, "\n\n").trim();
  }

  const oneLine = stripped.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max).trimEnd()}…`;
}
