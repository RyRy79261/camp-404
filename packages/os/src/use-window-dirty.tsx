"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// A window with unsaved input asks before it goes: on close, minimise, a
// switch to another window, a launch, and a page unload. A page says it is
// dirty with useWindowDirty; the frame and the desktop ask with
// useLeaveGuard. With no WindowDirtyProvider above them, nothing is ever
// dirty and every guard lets the window go.
//
// Some leaves cannot be asked about: a Back (the browser's, a phone's, a
// swipe) fires popstate, which cannot be cancelled. So a page may also hand
// useWindowDirty its unsaved values (the `draft`). If the page goes while
// still dirty and nobody said "leave anyway", the provider keeps that draft
// IN MEMORY for the window, and the page takes it back with useKeptDraft when
// the member opens that window again in the same session (design doc,
// section 5, "Back keeps unsaved input"). It is never written to browser
// storage here; the app drops it on save, Discard, close, sign-out, a user
// change and a new manifest.

type Entry = { key: string | null; message: string };

type Registry = {
  add: (token: symbol, entry: Entry) => void;
  remove: (token: symbol) => void;
  /** The first unsaved message for one window, or for any window. */
  pending: (key?: string) => string | undefined;
  confirm: (message: string) => boolean;
  /** The member agreed to leave this window (or every window): drop, don't keep. */
  release: (key?: string) => void;
  /** Whether the window was released, forgetting it either way. */
  takeReleased: (key: string) => boolean;
  keep: (key: string, draft: unknown) => void;
  peek: (key: string) => unknown;
  drop: (key: string) => void;
  clear: () => void;
};

const DirtyContext = createContext<Registry | null>(null);
const WindowKeyContext = createContext<string | null>(null);

export function WindowDirtyProvider({
  children,
  confirm,
}: {
  children: ReactNode;
  /** How to ask. The browser's own confirm box unless given. */
  confirm?: (message: string) => boolean;
}) {
  const entries = useRef(new Map<symbol, Entry>());
  const released = useRef(new Set<string>());
  const drafts = useRef(new Map<string, unknown>());
  const ask = useRef(confirm);
  useEffect(() => {
    ask.current = confirm;
  }, [confirm]);

  const registry = useMemo<Registry>(
    () => ({
      add: (token, entry) => {
        entries.current.set(token, entry);
        // Dirty again after an earlier "leave anyway": that answer is spent.
        if (entry.key !== null) released.current.delete(entry.key);
      },
      remove: (token) => entries.current.delete(token),
      pending: (key) => {
        for (const e of entries.current.values()) {
          if (key === undefined || e.key === key) return e.message;
        }
        return undefined;
      },
      confirm: (message) => (ask.current ?? window.confirm)(message),
      release: (key) => {
        for (const e of entries.current.values()) {
          if (e.key !== null && (key === undefined || e.key === key)) {
            released.current.add(e.key);
          }
        }
        if (key !== undefined) {
          released.current.add(key);
          drafts.current.delete(key);
        }
      },
      takeReleased: (key) => released.current.delete(key),
      keep: (key, draft) => drafts.current.set(key, draft),
      peek: (key) => drafts.current.get(key),
      drop: (key) => {
        drafts.current.delete(key);
      },
      clear: () => {
        drafts.current.clear();
        released.current.clear();
      },
    }),
    [],
  );

  // Closing the tab or reloading with unsaved input: the browser asks, in its
  // own words (it ignores ours).
  useEffect(() => {
    function onUnload(e: BeforeUnloadEvent) {
      if (entries.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return (
    <DirtyContext.Provider value={registry}>{children}</DirtyContext.Provider>
  );
}

/** Tells useWindowDirty which window a page is in. OsWindowFrame sets it. */
export function WindowKeyProvider({
  windowKey,
  children,
}: {
  windowKey: string;
  children: ReactNode;
}) {
  return (
    <WindowKeyContext.Provider value={windowKey}>
      {children}
    </WindowKeyContext.Provider>
  );
}

/** The key of the window a page is drawn in, or null outside any window. */
export function useWindowKey(): string | null {
  return useContext(WindowKeyContext);
}

/**
 * While `isDirty`, leaving this page's window asks `message` first. With a
 * `draft` (the unsaved values, anything the page can read back), a leave
 * nobody could ask about (a Back) keeps the draft in memory for this window
 * instead of losing it; the page takes it back with useKeptDraft.
 *
 * Returns `settle`: call it when the input is saved (or thrown away on
 * purpose) just before the page moves on, so nothing is kept.
 *
 * `onGone` hears how the page left its window: "kept" (dirty, nobody asked,
 * the draft is kept), "released" (the member said leave anyway) or "clean"
 * (nothing unsaved). An editor that also autosaves uses it to write its last
 * keystrokes, or to throw its stored draft away.
 */
export function useWindowDirty(
  isDirty: boolean,
  message: string,
  draft?: unknown,
  onGone?: (how: "kept" | "released" | "clean") => void,
): () => void {
  const registry = useContext(DirtyContext);
  const key = useContext(WindowKeyContext);
  useEffect(() => {
    if (!registry || !isDirty) return;
    const token = Symbol("dirty");
    registry.add(token, { key, message });
    return () => registry.remove(token);
  }, [registry, key, isDirty, message]);

  // The values as of the last render, read when the page goes.
  const latest = useRef({ isDirty, draft });
  const gone = useRef(onGone);
  useEffect(() => {
    latest.current = { isDirty, draft };
    gone.current = onGone;
  });
  useEffect(() => {
    if (!registry || key === null) return;
    return () => {
      const released = registry.takeReleased(key);
      const { isDirty: dirty, draft: values } = latest.current;
      if (!dirty) {
        gone.current?.("clean");
      } else if (released) {
        gone.current?.("released");
      } else {
        if (values !== undefined) registry.keep(key, values);
        gone.current?.("kept");
      }
    };
  }, [registry, key]);

  return useCallback(() => {
    latest.current = { isDirty: false, draft: undefined };
    if (registry && key !== null) registry.drop(key);
  }, [registry, key]);
}

/**
 * The draft this window kept when the member last left it with unsaved
 * input (a Back), or undefined. Read once, when the page mounts; it is then
 * the page's (the provider forgets it). What it holds is whatever the page
 * gave useWindowDirty: check it before use.
 */
export function useKeptDraft(): unknown {
  const registry = useContext(DirtyContext);
  const key = useContext(WindowKeyContext);
  const [kept] = useState<unknown>(() =>
    registry && key !== null ? registry.peek(key) : undefined,
  );
  useEffect(() => {
    if (registry && key !== null && kept !== undefined) registry.drop(key);
  }, [registry, key, kept]);
  return kept;
}

/**
 * Ask before a window goes. `leave(key)` asks about that window,
 * `leave()` about any; true means go ahead. A yes means the member chose to
 * lose that input, so the window keeps no draft of it.
 */
export function useLeaveGuard(): (key?: string) => boolean {
  const registry = useContext(DirtyContext);
  return useCallback(
    (key?: string) => {
      const message = registry?.pending(key);
      if (message === undefined) return true;
      if (!registry!.confirm(message)) return false;
      registry!.release(key);
      return true;
    },
    [registry],
  );
}

/**
 * The hold on kept drafts: `drop(key)` when a window is closed on purpose,
 * `clear()` on a user change or a new manifest (a demotion), so a draft
 * never outlives the access it was typed under; `release(key)` when the
 * member throws a window's input away themselves (Discard), so the page
 * that goes next keeps nothing.
 */
export function useKeptDrafts(): {
  drop: (key: string) => void;
  clear: () => void;
  release: (key: string) => void;
} {
  const registry = useContext(DirtyContext);
  return useMemo(
    () => ({
      drop: (key: string) => registry?.drop(key),
      clear: () => registry?.clear(),
      release: (key: string) => registry?.release(key),
    }),
    [registry],
  );
}
