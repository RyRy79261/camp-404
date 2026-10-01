import type { ClientProgram, ProgramManifest } from "./programs";

// Ctrl+K program search (issue #326, step 1; the approved mock-up's Option A).
// Pure and browser-safe: the list comes from the member's manifest, which the
// server already filtered by rank, so search can never offer a program the
// Start menu would not. Nothing here asks the server anything.

/** A program as search lists it: the program, and where it lives. */
export interface SearchProgram {
  program: ClientProgram;
  /** The group named on the row's right: "Me", "Kitchen", "Power and Lighting". */
  where: string;
}

/** A matched program, with the part of its name that matched. */
export interface SearchHit extends SearchProgram {
  /** Where the typed text starts in the name, and how long it is. */
  match: { start: number; length: number } | null;
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

/** How well a name matches: its start, then a word's start, then anywhere. */
function rankOf(name: string, at: number): number {
  if (at === 0) return 0;
  return /[\s\-(/&]/.test(name[at - 1] ?? "") ? 1 : 2;
}

/**
 * The programs whose name holds the typed text anywhere, case-insensitive:
 * names that start with it first, then those with a word that starts with
 * it, then the rest; within each, shorter names first, then the desktop's
 * order. Empty text matches nothing
 * (the empty box shows Recent instead).
 */
export function filterPrograms(
  list: readonly SearchProgram[],
  query: string,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { hit: SearchHit; rank: number; order: number }[] = [];
  list.forEach((entry, order) => {
    const name = entry.program.label.toLowerCase();
    // The earliest word start beats an earlier match inside a word, so
    // "light" lights "Power and Lighting"'s word, not a middle.
    let at = name.indexOf(q);
    if (at < 0) return;
    let best = at;
    while (at >= 0) {
      if (rankOf(name, at) < rankOf(name, best)) best = at;
      at = name.indexOf(q, at + 1);
    }
    hits.push({
      hit: { ...entry, match: { start: best, length: q.length } },
      rank: rankOf(name, best),
      order,
    });
  });
  // Within a kind, the shorter name first: more of it is what was typed, so
  // "pow" puts Power before the Power and Lighting team's page.
  return hits
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.hit.program.label.length - b.hit.program.label.length ||
        a.order - b.order,
    )
    .map((h) => h.hit);
}

/** A name cut into the part before the match, the match, and the part after. */
export function splitMatch(
  name: string,
  match: SearchHit["match"],
): { before: string; matched: string; after: string } {
  if (!match) return { before: name, matched: "", after: "" };
  const end = match.start + match.length;
  return {
    before: name.slice(0, match.start),
    matched: name.slice(match.start, end),
    after: name.slice(end),
  };
}

// --- Recent ----------------------------------------------------------------------
// The last few programs the member opened, kept in this browser
// (`localStorage`, key `camp404.search.recent.v1:<campUserId>`): program ids
// only, never an address, a title or what was in the window. Never
// authority: the box shows a recent id only while the manifest still holds it.

export const RECENT_PREFIX = "camp404.search.recent.v1:";
/** How many recent programs the empty box shows. */
export const RECENT_MAX = 5;
const MAX_ID = 100;

export function recentStorageKey(userId: string): string {
  return `${RECENT_PREFIX}${userId}`;
}

/** The stored ids, newest first; anything malformed reads as none. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter(
      (v): v is string =>
        typeof v === "string" && v.length > 0 && v.length <= MAX_ID,
    );
    return [...new Set(ids)].slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** The list with `id` moved to the front, at most RECENT_MAX long. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

/** The recent ids the member may still open, as search rows, newest first. */
export function recentPrograms(
  list: readonly SearchProgram[],
  recent: readonly string[],
): SearchProgram[] {
  const byId = new Map(list.map((e) => [e.program.id, e]));
  return recent
    .map((id) => byId.get(id))
    .filter((e): e is SearchProgram => e !== undefined);
}

export function readRecent(storage: Storage | null, userId: string): string[] {
  try {
    return parseRecent(storage?.getItem(recentStorageKey(userId)) ?? null);
  } catch {
    return [];
  }
}

export function writeRecent(
  storage: Storage | null,
  userId: string,
  recent: readonly string[],
): void {
  try {
    storage?.setItem(recentStorageKey(userId), JSON.stringify(recent));
  } catch {
    // Storage refused (private mode, full): Recent just stays as it was.
  }
}

// --- The shortcut ------------------------------------------------------------------

/**
 * Ctrl+K, or Cmd+K on a Mac, that search may take. Not when something else
 * already answered it (`defaultPrevented`), and never inside a rich-text
 * editor (a contenteditable): an editor's Ctrl+K (a link, in most) stays the
 * editor's. A plain field has no Ctrl+K of its own, so it opens search.
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
  }
  return true;
}
