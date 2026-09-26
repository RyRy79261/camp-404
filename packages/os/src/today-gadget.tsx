"use client";

import {
  useCallback,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";

// The Today gadget's frame (owner, 2026-09-25: "I don't like it being open the
// whole time"): closed by default, a handle on the desktop's right edge opens
// it, and the choice is remembered per browser. While closed its body is not
// in the DOM. What it shows is the app's.
//
// [CORRECTION 2026-09-26] It sits OVER the windows now, as the approved
// prototype draws it (owner, 2026-09-26: "this doesnt look like the pop out
// gadget from the prototype"): the app gives it a band above the window layer
// and below the taskbar and Start menu.

/** A remembered yes/no, read and written somewhere the app picks. */
export interface BooleanStore {
  /** The stored value; null when nothing (or nothing readable) is stored. */
  read(): boolean | null;
  write(value: boolean): void;
  /** Called when the value changes, here or in another tab. */
  subscribe(onChange: () => void): () => void;
}

/** Where the console keeps the gadget's open or closed (design doc, section 7). */
export const TODAY_OPEN_KEY = "camp404.os.today-open";

const stores = new Map<string, BooleanStore>();

/**
 * A boolean in `localStorage` under `key`, as "true" or "false". Anything
 * else there reads as nothing stored; a browser that refuses storage (a
 * private window) reads nothing and forgets. One store per key, so a
 * component can call this on every render.
 */
export function localStorageBoolean(key: string): BooleanStore {
  const known = stores.get(key);
  if (known) return known;
  const listeners = new Set<() => void>();
  const store: BooleanStore = {
    read() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === "true" ? true : raw === "false" ? false : null;
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch {
        // Not remembered; the gadget still opens and closes.
      }
      listeners.forEach((l) => l());
    },
    subscribe(onChange) {
      listeners.add(onChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
  stores.set(key, store);
  return store;
}

/**
 * A stored boolean as React state. The server, and the first paint, use
 * `fallback`; the stored value follows after hydration without a mismatch.
 */
export function useStoredBoolean(
  store: BooleanStore,
  fallback = false,
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.read() ?? fallback,
    () => fallback,
  );
  const set = useCallback((next: boolean) => store.write(next), [store]);
  return [value, set];
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Things due today: a chip on the handle, and in its name. */
  count?: number;
  /** The gadget's name. "Today" unless given. */
  label?: string;
  /** Where the frame sits; the app places it over the desktop's right edge. */
  className?: string;
  /**
   * A full-screen window is up: the handle drops below its title bar, so it
   * never sits on that window's buttons. Otherwise it sits at the top of the
   * panel, where the prototype draws it.
   */
  clearTitleBar?: boolean;
  /** The body, drawn only while open. */
  children: ReactNode;
};

/** The handle's arrow: points the way the panel will move. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className="size-3.5 shrink-0"
    >
      <path d={open ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
}

/**
 * The Today gadget (the prototype's pop-out, owner's approval 2026-09-26): a
 * tab on the desktop's right edge with the panel attached to it. Closed, only
 * the tab shows; open, the tab and the panel slide in together, over the
 * windows. Closing is instant, and a closed panel is not in the DOM.
 */
export function TodayGadget({
  open,
  onOpenChange,
  count = 0,
  label = "Today",
  className = "absolute inset-y-0 right-0",
  clearTitleBar = false,
  children,
}: Props) {
  const panelId = `${useId()}-today`;
  const handle = useRef<HTMLButtonElement>(null);

  // Esc inside the open gadget closes it and hands focus to the handle.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) {
      return;
    }
    e.stopPropagation();
    onOpenChange(false);
    handle.current?.focus();
  }

  const name = `${open ? "Hide" : "Show"} ${label}${
    count > 0 ? `, ${count} due` : ""
  }`;

  return (
    <div
      data-os-today
      data-open={open || undefined}
      // The frame runs the height of the desktop's edge but takes no
      // pointer itself, so a full-screen window's buttons under it still
      // answer; only the handle and the open panel do.
      className={`pointer-events-none flex select-none items-start ${open ? "os-slide-in" : ""} ${className}`}
    >
      <button
        ref={handle}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={name}
        title={name}
        // 44 px to aim at; the tab drawn inside is 28 px, flush with the
        // panel (or the screen's edge).
        className={`group pointer-events-auto flex w-11 shrink-0 justify-end outline-none ${
          clearTitleBar ? "mt-12" : "mt-2"
        }`}
      >
        <span
          className={`flex w-7 flex-col items-center gap-2 border border-r-0 py-3 font-pixel text-[10px] uppercase tracking-[0.3em] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-os-primary ${
            open
              ? "border-os-primary bg-os-primary text-os-bg"
              : "border-os-line bg-os-chrome text-os-fg group-hover:border-os-primary group-hover:text-os-primary"
          }`}
        >
          <Chevron open={open} />
          <span aria-hidden className="[writing-mode:vertical-rl]">
            {label}
          </span>
          {count > 0 && (
            <span
              aria-hidden
              className={`grid h-4 min-w-4 place-items-center px-0.5 font-mono text-[10px] font-bold tracking-normal ${
                open ? "bg-os-bg text-os-primary" : "bg-os-primary text-os-bg"
              }`}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
      </button>
      {/* Closed, it is not in the DOM; aria-controls still names it. */}
      {open && (
        <aside
          id={panelId}
          aria-label={label}
          onKeyDown={onKeyDown}
          className="pointer-events-auto max-h-full w-80 max-w-[calc(100vw-3rem)] select-text overflow-y-auto overscroll-contain border border-r-0 border-os-primary bg-os-bg shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
        >
          {children}
        </aside>
      )}
    </div>
  );
}
