// Has this visitor opened README.TXT yet? Until they have, its desktop icon
// glows "start here" (owner, 2026-10-01: README no longer opens by itself,
// so the icon has to say where to begin). Remembered on this device in
// localStorage; where storage is blocked, the icon glows every visit and
// stops for the rest of that one once README has been opened.

export const README_SEEN_KEY = "join.readme.opened.v1";

type Store = Pick<Storage, "getItem" | "setItem">;

let seenThisVisit = false;
const listeners = new Set<() => void>();

function storage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Reading localStorage itself throws when the browser blocks it.
    return null;
  }
}

export function readmeSeen(store: Store | null = storage()): boolean {
  if (seenThisVisit) return true;
  try {
    return store?.getItem(README_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markReadmeSeen(store: Store | null = storage()): void {
  if (seenThisVisit) return;
  seenThisVisit = true;
  try {
    store?.setItem(README_SEEN_KEY, "1");
  } catch {
    // Blocked or full: remembered for this visit only.
  }
  for (const listener of listeners) listener();
}

export function subscribeReadmeSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: forget this visit. */
export function resetReadmeSeenForTests(): void {
  seenThisVisit = false;
  listeners.clear();
}
