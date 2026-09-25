"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

// A window with unsaved input asks before it goes: on close, minimise, a
// switch to another window, a launch, and a page unload. A page says it is
// dirty with useWindowDirty; the frame and the desktop ask with
// useLeaveGuard. With no WindowDirtyProvider above them, nothing is ever
// dirty and every guard lets the window go.

type Entry = { key: string | null; message: string };

type Registry = {
  add: (token: symbol, entry: Entry) => void;
  remove: (token: symbol) => void;
  /** The first unsaved message for one window, or for any window. */
  pending: (key?: string) => string | undefined;
  confirm: (message: string) => boolean;
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
  const ask = useRef(confirm);
  useEffect(() => {
    ask.current = confirm;
  }, [confirm]);

  const registry = useMemo<Registry>(
    () => ({
      add: (token, entry) => entries.current.set(token, entry),
      remove: (token) => entries.current.delete(token),
      pending: (key) => {
        for (const e of entries.current.values()) {
          if (key === undefined || e.key === key) return e.message;
        }
        return undefined;
      },
      confirm: (message) => (ask.current ?? window.confirm)(message),
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

/** While `isDirty`, leaving this page's window asks `message` first. */
export function useWindowDirty(isDirty: boolean, message: string) {
  const registry = useContext(DirtyContext);
  const key = useContext(WindowKeyContext);
  useEffect(() => {
    if (!registry || !isDirty) return;
    const token = Symbol("dirty");
    registry.add(token, { key, message });
    return () => registry.remove(token);
  }, [registry, key, isDirty, message]);
}

/**
 * Ask before a window goes. `leave(key)` asks about that window,
 * `leave()` about any; true means go ahead.
 */
export function useLeaveGuard(): (key?: string) => boolean {
  const registry = useContext(DirtyContext);
  return useCallback(
    (key?: string) => {
      const message = registry?.pending(key);
      return message === undefined || registry!.confirm(message);
    },
    [registry],
  );
}
