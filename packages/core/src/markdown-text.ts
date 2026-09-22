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
// CODE IS PARKED, NOT STRIPPED. Inside a fence or a code span markdown stops
// being markdown: the renderer shows those characters exactly as typed. So the
// scanners below lift that text out BEFORE any rule runs and put it back after.
// Otherwise a fenced "1. Run **exactly**" reaches a lock screen as "Run
// exactly" while the page still shows the line the captain wrote. Backslash
// escapes are parked the same way and for the same reason — and they are parked
// SECOND, because `\*` inside code is two literal characters, not an escape.
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
 * A parked run of text, held out of the way while the strip runs. The marker
 * is a Unicode private-use character, which has no meaning of its own and is
 * cleared from the input first, so a body cannot smuggle one in and steer the
 * restore.
 */
const MARK = "";
const PARKED = /(\d+)/g;

/**
 * Set `value` aside and return the token that stands in its place. The token
 * is inert to every rule in `RULES`, which is the whole point: what goes in
 * comes back out character for character.
 */
function park(value: string, parked: string[]): string {
  parked.push(value);
  return `${MARK}${parked.length - 1}${MARK}`;
}

/** The opening line of a fenced code block: indent, fence, info string. */
const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})([^\n]*)$/;

/** A closing fence: the same character, at least as long, and nothing after. */
const FENCE_CLOSE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Drop up to `width` leading spaces or tabs — the indent an opening fence's
 * own position hides from the code inside it, so a block written inside a list
 * item does not arrive with that list item's indent baked in.
 */
function stripIndent(line: string, width: number): string {
  let i = 0;
  while (i < width && (line[i] === " " || line[i] === "\t")) i += 1;
  return line.slice(i);
}

/**
 * Park every fenced code block, leaving its contents on a line of their own.
 * A fence that is never closed runs to the end of the body — what CommonMark
 * says, and therefore what a member reads on the page.
 */
function parkFencedCode(text: string, parked: string[]): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const open = FENCE_OPEN.exec(line);
    const fence = open?.[2] ?? "";
    // A backtick fence's info string may not hold a backtick; such a line is
    // ordinary prose with code spans in it.
    if (!open || (fence.startsWith("`") && (open[3] ?? "").includes("`"))) {
      out.push(line);
      continue;
    }
    const indent = (open[1] ?? "").length;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const close = FENCE_CLOSE.exec(lines[j] ?? "")?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) break;
      body.push(stripIndent(lines[j] ?? "", indent));
    }
    out.push(park(body.join("\n"), parked));
    i = j;
  }
  return out.join("\n");
}

/**
 * Park every inline code span. A run of N backticks opens one and only a run
 * of exactly N closes it, which is how ``` ``a ` b`` ``` keeps its inner
 * backtick. A run with no partner is literal text and is left where it is.
 */
function parkCodeSpans(text: string, parked: string[]): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      out += text.charAt(i);
      i += 1;
      continue;
    }
    let open = 0;
    while (text[i + open] === "`") open += 1;

    let j = i + open;
    let close = -1;
    while (j < text.length) {
      if (text[j] === "`") {
        let run = 0;
        while (text[j + run] === "`") run += 1;
        if (run === open) {
          close = j;
          break;
        }
        j += run;
        continue;
      }
      // A blank line ends the paragraph, so it ends the search: an unmatched
      // backtick must not swallow the rest of the announcement.
      if (text[j] === "\n" && /^[ \t]*(?:\n|$)/.test(text.slice(j + 1))) break;
      j += 1;
    }

    if (close === -1) {
      out += text.slice(i, i + open);
      i += open;
      continue;
    }

    let content = text.slice(i + open, close).replace(/\n/g, " ");
    // One space either side is the writer making room for a backtick of their
    // own, not part of the code.
    if (
      content.length >= 2 &&
      content.startsWith(" ") &&
      content.endsWith(" ") &&
      content.trim() !== ""
    ) {
      content = content.slice(1, -1);
    }
    out += park(content, parked);
    i = close + open;
  }
  return out;
}

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
 * Applied in order, and only to what the code scanners left behind. Block
 * markers first (they are anchored to line starts and would be disturbed by
 * inline edits), then links before emphasis so that `[**Water**](…)` loses the
 * link and then the bold.
 */
const RULES: readonly [RegExp, string][] = [
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
  const parked: string[] = [];
  const source = markdown.replace(/\r\n?/g, "\n").replaceAll(MARK, "");
  const withCode = parkCodeSpans(parkFencedCode(source, parked), parked);
  const withEscapes = withCode.replace(ESCAPED, (_match, ch: string) =>
    park(ch, parked),
  );

  const stripped = RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    withEscapes,
  ).replace(PARKED, (_match, index: string) => parked[Number(index)] ?? "");

  if (max === undefined) {
    return stripped.replace(/\n{3,}/g, "\n\n").trim();
  }

  const oneLine = stripped.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max).trimEnd()}…`;
}
