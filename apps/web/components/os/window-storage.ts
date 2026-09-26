import type { OsWindow } from "@camp404/os";
import { matchProgram } from "@/lib/program-routes";
import { safeInternalPath } from "@/lib/safe-redirect";
import { windowProgram } from "./desktop-items";

// Which windows were open, kept for this browser tab only (design doc,
// section 7). `sessionStorage` key `camp404.os.v1:<campUserId>`, LAYOUT ONLY:
// the window's key, program, last address, place on screen, stacking order,
// minimised and maximised, and how far down it was scrolled. Never a title,
// never a copy of the page, never a form draft or a selection: a child's
// title and a page's copy can name a person or a record.
//
// It is never authority. On the way back in, every record whose address is
// not a console page (safeInternalPath, then matchProgram) is dropped, and
// the desktop prunes the rest against the member's fresh manifest.

export const WINDOW_STORAGE_PREFIX = "camp404.os.v1:";

/** The storage key for one member's windows. */
export function windowStorageKey(userId: string): string {
  return `${WINDOW_STORAGE_PREFIX}${userId}`;
}

/** One window as stored. */
export interface StoredWindow {
  key: string;
  programId: string;
  /** Its last address; null for a folder window, which has none. */
  lastUrl: string | null;
  rect: { x: number; y: number; w: number; h: number };
  z: number;
  minimized: boolean;
  maximized: boolean;
  scrollTop: number;
}

interface StoredStack {
  /** The manifest mode it was saved under; another mode starts afresh. */
  mode: string;
  windows: StoredWindow[];
}

/** The most windows a stored stack may hold; anything past it is dropped. */
const MAX_STORED = 100;
const MAX_KEY = 200;
const MAX_URL = 2000;

/** The stack as a string for sessionStorage. Titles are never written. */
export function serializeWindows(
  windows: readonly OsWindow<string>[],
  mode: string,
  scrollTops: ReadonlyMap<string, number>,
): string {
  const stored: StoredWindow[] = windows.map((w) => ({
    key: w.id,
    programId: w.program ?? w.id,
    lastUrl: w.lastUrl ?? null,
    rect: { x: w.x, y: w.y, w: w.w, h: w.h },
    z: w.z,
    minimized: !!w.minimized,
    maximized: !!w.maximized,
    scrollTop: scrollTops.get(w.id) ?? 0,
  }));
  const stack: StoredStack = { mode, windows: stored };
  return JSON.stringify(stack);
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/**
 * A console page's own address, or null: it must survive safeInternalPath
 * unchanged (no other origin, no `//`, no backslash trick) and match a
 * console program.
 */
function pageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_URL) return null;
  if (safeInternalPath(raw) !== raw) return null;
  const match = matchProgram(raw);
  if (!match || match.programId === "desktop") return null;
  return raw;
}

/**
 * The windows stored for this member, checked. Anything that is not a
 * well-formed record for this mode is dropped: an address that is not a
 * console page, a page window whose key is not its address's window, a
 * folder window whose folder `isFolderKey` does not know, bad numbers. The
 * program id is worked out again from the address, never read. Titles are
 * never read. Returns the windows and the scroll offsets to restore.
 */
export function parseWindows(
  raw: string | null,
  mode: string,
  isFolderKey: (key: string) => boolean,
): { windows: OsWindow<string>[]; scrollTops: Map<string, number> } {
  const empty = { windows: [], scrollTops: new Map<string, number>() };
  if (!raw) return empty;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof value !== "object" || value === null) return empty;
  const stack = value as Partial<StoredStack>;
  if (stack.mode !== mode || !Array.isArray(stack.windows)) return empty;

  const windows: OsWindow<string>[] = [];
  const scrollTops = new Map<string, number>();
  const seen = new Set<string>();
  for (const entry of stack.windows.slice(0, MAX_STORED)) {
    if (typeof entry !== "object" || entry === null) continue;
    const w = entry as Partial<StoredWindow>;
    if (typeof w.key !== "string" || w.key.length > MAX_KEY) continue;
    if (seen.has(w.key)) continue;
    const rect = w.rect;
    if (
      !rect ||
      !finite(rect.x) ||
      !finite(rect.y) ||
      !finite(rect.w) ||
      !finite(rect.h) ||
      !finite(w.z)
    ) {
      continue;
    }
    let program: string;
    let lastUrl: string | undefined;
    if (w.lastUrl === null || w.lastUrl === undefined) {
      if (!isFolderKey(w.key)) continue;
      program = w.key;
    } else {
      const url = pageUrl(w.lastUrl);
      const match = url ? matchProgram(url) : null;
      if (!url || !match || match.instanceKey !== w.key) continue;
      program = windowProgram(match.programId, match.instanceKey);
      lastUrl = url;
    }
    seen.add(w.key);
    windows.push({
      id: w.key,
      program,
      ...(lastUrl !== undefined && { lastUrl }),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      z: w.z,
      ...(w.minimized === true && { minimized: true }),
      ...(w.maximized === true && { maximized: true }),
    });
    if (finite(w.scrollTop) && w.scrollTop > 0) {
      scrollTops.set(w.key, w.scrollTop);
    }
  }
  return { windows, scrollTops };
}

// The one exception to "layout only" (design doc, sections 5 and 7): the
// four editors (meeting, meal plan, recipe source, announcements composer)
// autosave their unsaved draft for this tab, one key per member, window and
// editor: `camp404.os.draft.v1:<campUserId>:<windowKey>:<editor>`. None of
// them holds an ID, bank or safety field. Cleared on save, on close, on
// sign-out and when another member signs in on this tab. Never trusted: each
// editor checks what it reads back with its own schema.

export const DRAFT_STORAGE_PREFIX = "camp404.os.draft.v1:";

/** The storage key for one editor's draft in one member's window. */
export function draftStorageKey(
  userId: string,
  windowKey: string,
  editor: string,
): string {
  return `${DRAFT_STORAGE_PREFIX}${userId}:${windowKey}:${editor}`;
}

/** Forget every draft kept for one window: it was closed on purpose. */
export function forgetWindowDrafts(
  storage: Storage,
  userId: string,
  windowKey: string,
): void {
  const prefix = `${DRAFT_STORAGE_PREFIX}${userId}:${windowKey}:`;
  try {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(prefix)) storage.removeItem(key);
    }
  } catch {
    // Nothing to forget in storage we cannot read.
  }
}

/**
 * Forget every other member's windows and drafts in this tab (a shared
 * device, a sign-in as someone else). Storage that refuses (a private
 * window) is left alone.
 */
export function forgetOtherMembers(storage: Storage, userId: string): void {
  const mine = windowStorageKey(userId);
  const myDrafts = `${DRAFT_STORAGE_PREFIX}${userId}:`;
  try {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(WINDOW_STORAGE_PREFIX) && key !== mine) {
        storage.removeItem(key);
      } else if (
        key.startsWith(DRAFT_STORAGE_PREFIX) &&
        !key.startsWith(myDrafts)
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Nothing to forget in storage we cannot read.
  }
}

/** Forget every member's windows and drafts in this tab: sign-out. */
export function forgetAllWindows(storage: Storage): void {
  try {
    for (const key of Object.keys(storage)) {
      if (
        key.startsWith(WINDOW_STORAGE_PREFIX) ||
        key.startsWith(DRAFT_STORAGE_PREFIX)
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // As above.
  }
}
