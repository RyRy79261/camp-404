import { splitMembersOnly } from "./guide-public";
import { plainPreview } from "./markdown-text";

// Ctrl+K "search inside text" (#350). Pure: the parts of a recipe, a chapter
// or duty card, a meeting and an announcement that search reads, as plain
// text, and the short line (the snippet) a text hit shows. The database finds
// the rows (@camp404/db/search, ILIKE over the same fields); the server then
// builds the line here, so the browser gets about 110 characters around the
// match and never a body. The E2E twin and the browser's stale-line check use
// the same functions.

/** At most this many text hits a kind (title hits have their own limit). */
export const SEARCH_TEXT_LIMIT = 5;
/** About how long a snippet is, before the ellipses. */
export const SNIPPET_LENGTH = 110;
/** About how much comes before the matched word. */
export const SNIPPET_LEAD = 35;

/** Where the words were found, as the row says it. */
export const TEXT_WHERE = {
  summary: "in the summary",
  ingredients: "in the ingredients",
  method: "in the method",
  notes: "in the notes",
  chapter: "in the chapter",
  membersOnly: "In a Members only part",
  steps: "in the steps",
  hardRules: "in the hard rules",
  checklist: "in the checklist",
  subRoles: "in the sub-roles",
  askRole: "in who to ask",
  agenda: "in the agenda",
  decisions: "in the decisions",
  actions: "in the action items",
  message: "in the message",
} as const;

/** "under “Water”": the heading above the match in a chapter. */
export function underHeading(heading: string): string {
  return `under “${heading}”`;
}

/** A run of matched letters. */
export interface TextMark {
  start: number;
  length: number;
}

/** One part of an entry's text, plain and on one line. */
export interface SearchTextPart {
  where: string;
  /** Inside a chapter's `:::members` part. */
  membersOnly: boolean;
  text: string;
}

/** What a text hit carries to the browser: one line, never the body. */
export interface SearchTextMatch {
  where: string;
  membersOnly: boolean;
  /** About SNIPPET_LENGTH characters around the match, "…" on a cut side. */
  text: string;
  /** Every typed word inside `text`. */
  marks: TextMark[];
}

// --- Plain text --------------------------------------------------------------------

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Markdown as one plain line. */
function flat(markdown: string): string {
  return oneLine(plainPreview(markdown));
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function part(
  where: string,
  text: string,
  membersOnly = false,
): SearchTextPart[] {
  const line = oneLine(text);
  return line ? [{ where, membersOnly, text: line }] : [];
}

/**
 * A recipe version's words (a KitchenRecipe body), as its Recipe tab shows
 * them: the summary; each ingredient's component, name, preparation and note;
 * each step's instruction and note; each note's title and body. Never a key,
 * an enum (category, unit, allergens), a number or the scaling notes. Reads
 * defensively: a body from the first draft may have another shape.
 */
export function recipeTextParts(body: unknown): SearchTextPart[] {
  if (!body || typeof body !== "object") return [];
  const r = body as Record<string, unknown>;
  const ingredients = list(r.ingredients)
    .map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      const name = str(l.name);
      if (!name) return "";
      const component = str(l.component);
      const prep = str(l.preparation);
      const note = str(l.note);
      return `${component ? `${component}: ` : ""}${name}${prep ? `, ${prep}` : ""}${note ? ` (${note})` : ""}`;
    })
    .filter(Boolean)
    .join("; ");
  const method = list(r.steps)
    .flatMap((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      return [str(s.instruction), str(s.note)].filter((x) => x !== null);
    })
    .join(" ");
  const notes = list(r.notes)
    .map((raw) => {
      const n = (raw ?? {}) as Record<string, unknown>;
      const title = str(n.title);
      const text = str(n.body);
      if (!text) return title ?? "";
      return title ? `${title}: ${text}` : text;
    })
    .filter(Boolean)
    .join(" ");
  return [
    ...part(TEXT_WHERE.summary, str(r.summary) ?? ""),
    ...part(TEXT_WHERE.ingredients, ingredients),
    ...part(TEXT_WHERE.method, method),
    ...part(TEXT_WHERE.notes, notes),
  ];
}

const HEADING = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A published chapter's words: a duty card's steps, hard rules, checklist,
 * sub-roles and who to ask, then the Markdown, cut at its headings so the row
 * can say which one the match is under. A `:::members` part is one part of
 * its own, marked, as the in-app reader boxes it.
 */
export function chapterTextParts(
  markdown: string,
  card: unknown,
): SearchTextPart[] {
  const parts: SearchTextPart[] = [];
  if (card && typeof card === "object") {
    const c = card as Record<string, unknown>;
    const lines = (v: unknown) =>
      list(v)
        .map((x) => str(x))
        .filter((x) => x !== null)
        .join(" · ");
    parts.push(
      ...part(TEXT_WHERE.steps, lines(c.steps)),
      ...part(TEXT_WHERE.hardRules, lines(c.hardRules)),
      ...part(TEXT_WHERE.checklist, lines(c.checklist)),
      ...part(
        TEXT_WHERE.subRoles,
        lines(list(c.subRoles).map((r) => (r as { name?: unknown })?.name)),
      ),
      ...part(TEXT_WHERE.askRole, str(c.askRole) ?? ""),
    );
  }
  for (const segment of splitMembersOnly(markdown)) {
    if (segment.membersOnly) {
      parts.push(...part(TEXT_WHERE.membersOnly, flat(segment.markdown), true));
      continue;
    }
    let heading: string | null = null;
    let buffer: string[] = [];
    let fence: string | null = null;
    const flush = () => {
      const text = flat(buffer.join("\n"));
      buffer = [];
      parts.push(
        ...part(heading ? underHeading(heading) : TEXT_WHERE.chapter, text),
      );
    };
    for (const line of segment.markdown.split("\n")) {
      const code = FENCE.exec(line);
      if (code) fence = fence === null ? code[1]! : null;
      const h = fence === null ? HEADING.exec(line) : null;
      if (h) {
        flush();
        heading = flat(h[1]!) || null;
      }
      buffer.push(line);
    }
    flush();
  }
  return parts;
}

/** A meeting note's words: agenda, notes, decisions and action items. */
export function meetingTextParts(note: {
  agenda: string;
  notes: string;
  decisions: readonly string[];
  actions: readonly string[];
}): SearchTextPart[] {
  return [
    ...part(TEXT_WHERE.agenda, flat(note.agenda)),
    ...part(TEXT_WHERE.notes, flat(note.notes)),
    ...part(TEXT_WHERE.decisions, note.decisions.map(flat).join(" · ")),
    ...part(TEXT_WHERE.actions, note.actions.map(flat).join(" · ")),
  ];
}

/** An announcement's words: the copy delivered to the member. */
export function announcementTextParts(body: string): SearchTextPart[] {
  return part(TEXT_WHERE.message, flat(body));
}

// --- Matching ----------------------------------------------------------------------

/**
 * Lower case, one UTF-16 unit for one, so a position in the folded text is
 * the same position in the original ("İ" would grow to two units; it stays).
 */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const low = ch.toLowerCase();
    out += low.length === ch.length ? low : ch;
  }
  return out;
}

const LETTER = /[\p{L}\p{N}]/u;

function startsWord(text: string, at: number): boolean {
  return at === 0 || !LETTER.test(text[at - 1] ?? "");
}

/** Where `word` first starts a word in `low`, else where it first appears. */
function findWord(low: string, word: string): number {
  let at = low.indexOf(word);
  const first = at;
  while (at >= 0) {
    if (startsWord(low, at)) return at;
    at = low.indexOf(word, at + 1);
  }
  return first;
}

/** Every place a typed word appears in `text`, longest word first on overlap. */
export function markWords(text: string, words: readonly string[]): TextMark[] {
  const low = fold(text);
  const found: TextMark[] = [];
  for (const word of words) {
    if (!word) continue;
    let at = low.indexOf(word);
    while (at >= 0) {
      found.push({ start: at, length: word.length });
      at = low.indexOf(word, at + word.length);
    }
  }
  found.sort((a, b) => a.start - b.start || b.length - a.length);
  const marks: TextMark[] = [];
  let end = 0;
  for (const m of found) {
    if (m.start < end) continue;
    marks.push(m);
    end = m.start + m.length;
  }
  return marks;
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

/** Never cut between the two halves of an emoji. */
function safeCut(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code >= 0xdc00 && code <= 0xdfff ? at - 1 : at;
}

/**
 * About SNIPPET_LENGTH characters of `text` around the first typed word it
 * holds (where it starts a word, if it does): about SNIPPET_LEAD before it
 * (more near the text's end), from a sentence's start when one falls in that
 * lead, else from the next
 * whole word; ending at a whole word; "…" on a cut side. Marks every typed
 * word inside. Null when no word is in `text`.
 */
export function cutSnippet(
  text: string,
  words: readonly string[],
): { text: string; marks: TextMark[] } | null {
  const source = oneLine(text);
  const low = fold(source);
  let at = -1;
  let length = 0;
  for (const word of words) {
    if (!word) continue;
    const found = findWord(low, word);
    if (found >= 0) {
      at = found;
      length = word.length;
      break;
    }
  }
  if (at < 0) return null;

  // About SNIPPET_LEAD before the match; more when the text ends soon after
  // it, so the line is still about SNIPPET_LENGTH long.
  const lead = Math.max(SNIPPET_LEAD, SNIPPET_LENGTH - (source.length - at));
  let start = Math.max(0, at - lead);
  if (start > 0) {
    const before = source.slice(start, at);
    let sentence = -1;
    for (const m of before.matchAll(/[.!?]["')\]]*\s+/g)) {
      sentence = m.index + m[0].length;
    }
    if (sentence >= 0) {
      start += sentence;
    } else if (!isSpace(source[start - 1])) {
      const space = source.slice(start, at).search(/\s/);
      start = space >= 0 ? start + space + 1 : at;
    }
  }
  start = safeCut(source, start);

  let end = Math.min(source.length, start + SNIPPET_LENGTH);
  if (end < at + length) end = at + length;
  if (end < source.length && !isSpace(source[end])) {
    const space = source.lastIndexOf(" ", end);
    if (space > at + length) {
      end = space;
    } else {
      const next = source.slice(end).search(/\s/);
      end = next >= 0 ? end + next : source.length;
    }
  }
  end = safeCut(source, end);

  let body = source.slice(start, end).trim();
  const cutEnd = end < source.length;
  if (cutEnd) body = body.replace(/[\s;,.:·–-]+$/, "");
  const line = `${start > 0 ? "…" : ""}${body}${cutEnd ? "…" : ""}`;
  return { text: line, marks: markWords(line, words) };
}

/**
 * The text hit for an entry whose title alone does not hold every word:
 * every word must be in the title or the plain text (a word only in markup,
 * such as a link's address, is no hit), and the line comes from the first
 * part that holds the first word (where it starts a word, if any part does),
 * else from the first part holding any word.
 */
export function findTextMatch(
  title: string,
  parts: readonly SearchTextPart[],
  words: readonly string[],
): SearchTextMatch | null {
  const typed = words.filter(Boolean);
  if (typed.length === 0 || parts.length === 0) return null;
  const folded = parts.map((p) => fold(p.text));
  const all = [fold(title), ...folded];
  if (!typed.every((w) => all.some((t) => t.includes(w)))) return null;
  const first = typed[0]!;
  let pick = folded.findIndex((t) => {
    const at = findWord(t, first);
    return at >= 0 && startsWord(t, at);
  });
  if (pick < 0) pick = folded.findIndex((t) => t.includes(first));
  if (pick < 0)
    pick = folded.findIndex((t) => typed.some((w) => t.includes(w)));
  if (pick < 0) return null;
  const chosen = parts[pick]!;
  const snippet = cutSnippet(chosen.text, [
    first,
    ...typed.filter((w) => w !== first),
  ]);
  if (!snippet) return null;
  return {
    where: chosen.where,
    membersOnly: chosen.membersOnly,
    text: snippet.text,
    marks: snippet.marks,
  };
}
