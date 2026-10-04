import type { SearchKind } from "@camp404/db/search";
import type { ClientProgram, ProgramManifest } from "./programs";

// Ctrl+K search (issue #326). Pure and browser-safe. Programs come from the
// member's manifest, which the server already filtered by rank, so search can
// never offer a program the Start menu would not; they filter here, at once.
// Camp entries (recipes, chapters, people…) come from /api/search, which
// applies each page's own rule on the server (step 2); this module ranks,
// groups and highlights them, and keeps Recent.

/** A program as search lists it: the program, and where it lives. */
export interface SearchProgram {
  program: ClientProgram;
  /** The group named on the row's right: "Me", "Kitchen", "Power and Lighting". */
  where: string;
}

/**
 * Every program the member may open, in the desktop's order, once each.
 * An id the manifest lists for search but holds nowhere is skipped.
 */
export function searchablePrograms(manifest: ProgramManifest): SearchProgram[] {
  const byId = new Map<string, ClientProgram>();
  for (const p of manifest.programs) byId.set(p.id, p);
  for (const f of manifest.folders) {
    for (const p of f.programs) if (!byId.has(p.id)) byId.set(p.id, p);
  }
  const seen = new Set<string>();
  const list: SearchProgram[] = [];
  for (const { id, where } of manifest.search) {
    const program = byId.get(id);
    if (!program || seen.has(id)) continue;
    seen.add(id);
    list.push({ program, where });
  }
  return list;
}

/** A run of matched letters in a title. */
export interface Mark {
  start: number;
  length: number;
}

/** A matched program, with the parts of its name that matched. */
export interface SearchHit extends SearchProgram {
  /** 0 the whole name, 1 its start, 2 a word's start, 3 anywhere. */
  rank: number;
  marks: Mark[];
}

/** The typed text as lower-case words. */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

const WORD_START = /[\s\-(/&,:.'"]/;

function startsWord(text: string, at: number): boolean {
  return at === 0 || WORD_START.test(text[at - 1] ?? "");
}

/**
 * How well a title matches the typed text, the one rule programs and camp
 * entries share: every word must appear (any case). Then 0 the whole title is
 * the text, 1 the title starts with it, 2 every word starts a word in the
 * title, 3 anywhere. Null when a word is missing. `marks` are the letters to
 * light: each word where it starts a word if it does, else where it first
 * appears.
 */
export function rankTitle(
  title: string,
  query: string,
): { rank: number; marks: Mark[] } | null {
  const words = queryWords(query);
  if (words.length === 0) return null;
  const text = title.toLowerCase();
  const found: { at: number; word: string; wordStart: boolean }[] = [];
  for (const word of words) {
    let at = text.indexOf(word);
    if (at < 0) return null;
    let best = at;
    while (at >= 0) {
      if (startsWord(text, at)) {
        best = at;
        break;
      }
      at = text.indexOf(word, at + 1);
    }
    found.push({ at: best, word, wordStart: startsWord(text, best) });
  }
  const phrase = words.join(" ");
  const rank =
    text === phrase
      ? 0
      : text.startsWith(phrase)
        ? 1
        : found.every((f) => f.wordStart)
          ? 2
          : 3;
  const marks: Mark[] = [];
  let end = 0;
  for (const f of [...found].sort((a, b) => a.at - b.at)) {
    if (f.at < end) continue;
    marks.push({ start: f.at, length: f.word.length });
    end = f.at + f.word.length;
  }
  return { rank, marks };
}

/**
 * The programs whose name holds every typed word, best first (rankTitle);
 * within a rank, shorter names first, then the desktop's order. Empty text
 * matches nothing (the empty box shows Recent instead).
 */
export function filterPrograms(
  list: readonly SearchProgram[],
  query: string,
): SearchHit[] {
  const hits: { hit: SearchHit; order: number }[] = [];
  list.forEach((entry, order) => {
    const ranked = rankTitle(entry.program.label, query);
    if (ranked) hits.push({ hit: { ...entry, ...ranked }, order });
  });
  // Within a rank, the shorter name first: more of it is what was typed, so
  // "pow" puts Power before the Power and Lighting team's page.
  return hits
    .sort(
      (a, b) =>
        a.hit.rank - b.hit.rank ||
        a.hit.program.label.length - b.hit.program.label.length ||
        a.order - b.order,
    )
    .map((h) => h.hit);
}

/** A title cut into plain and matched runs, for the highlight. */
export function splitMarks(
  title: string,
  marks: readonly Mark[],
): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) out.push({ text: title.slice(at, m.start), hit: false });
    out.push({ text: title.slice(m.start, m.start + m.length), hit: true });
    at = m.start + m.length;
  }
  if (at < title.length) out.push({ text: title.slice(at), hit: false });
  return out;
}

// --- Camp entries ----------------------------------------------------------------

/** One thing in camp the member may open, as /api/search returns it. */
export interface SearchEntry {
  kind: SearchKind;
  id: string;
  title: string;
  /** The words after the title: "40 plates", "Kitchen · 19:00–21:00". */
  detail: string;
  /** The exact page it opens. */
  href: string;
  /** A Survival Guide duty card (its own icon), not a chapter. */
  card?: boolean;
}

/** Each kind's group heading, in the order groups tie-break. */
export const ENTRY_GROUP: Record<SearchKind, string> = {
  recipe: "Recipes",
  chapter: "Survival Guide",
  meeting: "Meetings",
  task: "Tasks",
  inventory: "Inventory",
  shift: "Shifts",
  gear: "Gear",
  lounge: "Lounge",
  person: "People",
  announcement: "Announcements",
  questionnaire: "Questionnaires",
};

/** One entry, named by kind ("Recipe · Kitchen" in Recent). */
export const ENTRY_KIND_LABEL: Record<SearchKind, string> = {
  recipe: "Recipe",
  chapter: "Chapter",
  meeting: "Meeting",
  task: "Task",
  inventory: "Inventory",
  shift: "Shift",
  gear: "Gear",
  lounge: "Lounge",
  person: "Person",
  announcement: "Announcement",
  questionnaire: "Questionnaire",
};

export const ENTRY_KINDS = Object.keys(ENTRY_GROUP) as SearchKind[];

export function isEntryKind(value: unknown): value is SearchKind {
  return typeof value === "string" && Object.hasOwn(ENTRY_GROUP, value);
}

/** A matched entry, ranked as programs are. */
export interface EntryHit {
  entry: SearchEntry;
  rank: number;
  marks: Mark[];
}

export interface EntryGroup {
  kind: SearchKind;
  label: string;
  hits: EntryHit[];
}

/** How many rows a group shows before "Show N more". */
export const GROUP_CAP = 3;

/**
 * Entries grouped by kind. Rows rank as programs do (rankTitle), shorter
 * titles first, then the server's order (newest first where a kind has a
 * date). Groups follow their best row, and the kinds' fixed order breaks a
 * tie. An entry whose title no longer holds the typed words (an answer to
 * an earlier, shorter text) is left out, so the list narrows at once while
 * the next answer is on its way.
 */
export function groupEntries(
  entries: readonly SearchEntry[],
  query: string,
): EntryGroup[] {
  const byKind = new Map<SearchKind, { hit: EntryHit; order: number }[]>();
  entries.forEach((entry, order) => {
    const ranked = rankTitle(entry.title, query);
    if (!ranked) return;
    const list = byKind.get(entry.kind) ?? [];
    list.push({ hit: { entry, ...ranked }, order });
    byKind.set(entry.kind, list);
  });
  return [...byKind.entries()]
    .map(([kind, list]) => ({
      kind,
      label: ENTRY_GROUP[kind],
      hits: list
        .sort(
          (a, b) =>
            a.hit.rank - b.hit.rank ||
            a.hit.entry.title.length - b.hit.entry.title.length ||
            a.order - b.order,
        )
        .map((x) => x.hit),
    }))
    .sort(
      (a, b) =>
        a.hits[0]!.rank - b.hits[0]!.rank ||
        ENTRY_KINDS.indexOf(a.kind) - ENTRY_KINDS.indexOf(b.kind),
    );
}

/** The guide's own full-text page, for the box's last row. */
export function guideTextHref(query: string): string {
  return `/guide?q=${encodeURIComponent(query.trim())}`;
}

// --- Recent ----------------------------------------------------------------------
// The last few things the member opened, programs and entries mixed, kept in
// this browser (`localStorage`, key `camp404.search.recent.v2:<campUserId>`):
// a kind and an id each, never a title, an address or what was in the window
// (owner, 2026-10-04). Never authority: a program shows only while the
// manifest holds it, and entries are looked up again on the server through
// each page's rule, which drops anything the member may no longer open.

export type RecentKind = "program" | SearchKind;
export interface RecentRef {
  kind: RecentKind;
  id: string;
}

export const RECENT_PREFIX = "camp404.search.recent.v2:";
/** Step 1's list: program ids only. Read once, then moved to v2. */
export const RECENT_PREFIX_V1 = "camp404.search.recent.v1:";
/** How many recent things the empty box shows. */
export const RECENT_MAX = 8;
const MAX_ID = 100;

export function recentStorageKey(userId: string): string {
  return `${RECENT_PREFIX}${userId}`;
}

export function refKey(ref: RecentRef): string {
  return `${ref.kind}:${ref.id}`;
}

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
}

function unique(refs: RecentRef[]): RecentRef[] {
  const seen = new Set<string>();
  return refs
    .filter((r) => {
      const k = refKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, RECENT_MAX);
}

/** The stored refs, newest first; anything malformed reads as none. */
export function parseRecent(raw: string | null): RecentRef[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return unique(
      value.flatMap((v): RecentRef[] => {
        if (!v || typeof v !== "object") return [];
        const { kind, id } = v as { kind?: unknown; id?: unknown };
        if ((kind === "program" || isEntryKind(kind)) && validId(id)) {
          return [{ kind, id }];
        }
        return [];
      }),
    );
  } catch {
    return [];
  }
}

/** Step 1's stored program ids, as v2 refs. */
export function parseRecentV1(raw: string | null): RecentRef[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return unique(
      value.filter(validId).map((id) => ({ kind: "program" as const, id })),
    );
  } catch {
    return [];
  }
}

/** The list with `ref` moved to the front, at most RECENT_MAX long. */
export function pushRecent(
  recent: readonly RecentRef[],
  ref: RecentRef,
): RecentRef[] {
  const k = refKey(ref);
  return [ref, ...recent.filter((x) => refKey(x) !== k)].slice(0, RECENT_MAX);
}

/** A Recent row: a program from the manifest, or an entry from the server. */
export type RecentRow =
  | { type: "program"; program: SearchProgram }
  | { type: "entry"; entry: SearchEntry };

/**
 * The recent refs the member may still open, newest first: programs the
 * manifest holds, and entries the server returned (`entries`, by refKey).
 */
export function recentRows(
  list: readonly SearchProgram[],
  recent: readonly RecentRef[],
  entries: ReadonlyMap<string, SearchEntry>,
): RecentRow[] {
  const byId = new Map(list.map((e) => [e.program.id, e]));
  return recent.flatMap((ref): RecentRow[] => {
    if (ref.kind === "program") {
      const program = byId.get(ref.id);
      return program ? [{ type: "program", program }] : [];
    }
    const entry = entries.get(refKey(ref));
    return entry ? [{ type: "entry", entry }] : [];
  });
}

/**
 * This browser's Recent for the member. Step 1's v1 list is moved over once
 * (written as v2, the old key removed).
 */
export function readRecent(
  storage: Storage | null,
  userId: string,
): RecentRef[] {
  try {
    const v2 = storage?.getItem(recentStorageKey(userId)) ?? null;
    if (v2 !== null) return parseRecent(v2);
    const v1Key = `${RECENT_PREFIX_V1}${userId}`;
    const moved = parseRecentV1(storage?.getItem(v1Key) ?? null);
    if (moved.length > 0) {
      writeRecent(storage, userId, moved);
      storage?.removeItem(v1Key);
    }
    return moved;
  } catch {
    return [];
  }
}

export function writeRecent(
  storage: Storage | null,
  userId: string,
  recent: readonly RecentRef[],
): void {
  try {
    storage?.setItem(
      recentStorageKey(userId),
      JSON.stringify(recent.map(({ kind, id }) => ({ kind, id }))),
    );
  } catch {
    // Storage refused (private mode, full): Recent just stays as it was.
  }
}

// --- The shortcut ------------------------------------------------------------------

/**
 * Ctrl+K, or Cmd+K on a Mac, that search may take. Not when something else
 * already answered it (`defaultPrevented`), never inside a rich-text editor
 * (a contenteditable): an editor's Ctrl+K (a link, in most) stays the
 * editor's, and never from inside another open dialog. A plain field has no
 * Ctrl+K of its own, so it opens search.
 */
export function isSearchShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}): boolean {
  if (e.defaultPrevented || e.altKey || e.shiftKey) return false;
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return false;
  const el = e.target as HTMLElement | null;
  if (el && typeof el.closest === "function") {
    if (
      el.isContentEditable ||
      el.closest('[contenteditable]:not([contenteditable="false"])')
    )
      return false;
    // Another dialog holds focus (a page's form, a confirm): the box would
    // open under it and the typing would land in the dialog's field. Search
    // waits until it closes. The search box's own Ctrl+K still shuts it.
    if (
      !el.closest("[data-os-search]") &&
      el.closest('[role="dialog"], [role="alertdialog"]')
    )
      return false;
  }
  return true;
}
