// The bowls fill at most once every six hours, and the six hours are kept in
// this browser, not on the server (owner, 2026-09-26: "B, browser based"). A
// member on two browsers can feed twice; that is the price of no server
// state for a toy. The key names nothing.

/** How long after a feed the bowls stay away. */
export const FEED_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Where the last feed's time (ms since the epoch) is kept. */
export const FEED_STORAGE_KEY = "camp404:bowls-filled-at";

/** The part of Storage the limit uses, so a test can hand it a fake. */
export type FeedStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Feeds a storage refused to keep (full, or blocked from writing), held for
 * the rest of the page's life, so the scene mounted again (the desktop
 * redrawn) still counts them.
 */
const unsaved = new WeakMap<FeedStorage, number>();

/** When the bowls were last filled here, or null for never (or unreadable). */
export function lastFedAt(storage: FeedStorage): number | null {
  const held = unsaved.get(storage) ?? null;
  let raw: string | null;
  try {
    raw = storage.getItem(FEED_STORAGE_KEY);
  } catch {
    return held;
  }
  const at = raw === null ? NaN : Number(raw);
  const stored = Number.isFinite(at) ? at : null;
  if (stored === null) return held;
  return held === null ? stored : Math.max(stored, held);
}

/**
 * Whether the bowls may be filled now: never fed, or the last feed is six
 * hours old. A last feed in the future (the clock was put back) is
 * forgotten rather than trusted, so a wrong clock never locks the bowls away
 * for longer than six hours from now.
 */
export function mayFeed(storage: FeedStorage, now: number): boolean {
  const last = lastFedAt(storage);
  if (last === null || last > now) return true;
  return now - last >= FEED_COOLDOWN_MS;
}

/**
 * Fills the bowls if allowed, and keeps the time. Checked again here, at the
 * click, so a feed in another tab since the bowls were drawn is refused.
 * Returns whether this feed happened.
 */
export function recordFeed(storage: FeedStorage, now: number): boolean {
  if (!mayFeed(storage, now)) return false;
  try {
    storage.setItem(FEED_STORAGE_KEY, String(now));
  } catch {
    // Storage full or blocked: this feed still counts for the rest of this
    // page's life, it just is not remembered after a reload.
    unsaved.set(storage, now);
  }
  return true;
}

/** A plain in-memory store, for a browser that refuses localStorage. */
export function memoryStorage(): FeedStorage {
  const kept = new Map<string, string>();
  return {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => void kept.set(k, v),
  };
}

let fallback: FeedStorage | null = null;

/** The browser's localStorage, or an in-memory stand-in where it is refused. */
export function browserFeedStorage(): FeedStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Blocked (a privacy setting): fall through.
  }
  fallback ??= memoryStorage();
  return fallback;
}
