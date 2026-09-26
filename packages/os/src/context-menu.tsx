"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

// The right-click menu (owner, 2026-09-25; visual-language doc 4.4a): a small
// panel at the pointer, kept on screen. Opens on right-click, and from the
// keyboard with Shift+F10 or the Menu key (the desktop icons do that part).
// Focus lands on the first row; arrows move, Home and End jump, Esc closes and
// hands focus back to what had it. What the rows are is the app's to say.
//
// Drawn in place, not portalled: it stays inside #os-desktop, so when the
// desktop goes inert (a blocking form) the menu goes with it.

export type ContextMenuEntry =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /** A delete: drawn in the danger colour. */
      danger?: boolean;
      /** The default action (Open): drawn bold. */
      bold?: boolean;
    }
  | "divider";

export type ContextMenuState = {
  /** Where it opens: the pointer, or the focused icon's corner. */
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  /** The menu's name, read out. "Actions" unless given. */
  label?: string;
} | null;

type Props = {
  menu: ContextMenuState;
  /** Shut it; `refocus` hands focus back to where it was when it opened. */
  onClose: (refocus: boolean) => void;
};

const ROW = "[role=menuitem]:not([disabled])";

/** Gap kept between the menu and the screen's edge, in px. */
const EDGE = 4;

export function ContextMenu({ menu, onClose }: Props) {
  if (!menu) return null;
  // Keyed by the menu, so each opening starts measured afresh.
  return (
    <OpenMenu
      key={`${menu.x}:${menu.y}:${menu.entries.length}`}
      menu={menu}
      onClose={onClose}
    />
  );
}

function OpenMenu({
  menu,
  onClose,
}: {
  menu: NonNullable<ContextMenuState>;
  onClose: (refocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // What had focus when the menu opened: the icon, or the desktop.
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Measured before paint, so it never flashes at the wrong place.
  useLayoutEffect(() => {
    const el = ref.current!;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(EDGE, Math.min(menu.x, window.innerWidth - r.width - EDGE)),
      y: Math.max(EDGE, Math.min(menu.y, window.innerHeight - r.height - EDGE)),
    });
  }, [menu]);

  // Focus the first row once the menu is placed and shown. Not in the
  // measuring effect: until then it is `visibility: hidden`, and a browser
  // will not focus a hidden element (measured: Shift+F10 opened a menu with
  // focus left on the icon).
  const placed = pos !== null;
  useLayoutEffect(() => {
    if (!placed) return;
    ref.current
      ?.querySelector<HTMLElement>(ROW)
      ?.focus({ preventScroll: true });
  }, [placed]);

  // A press anywhere else, the window losing focus, or a resize shuts it.
  useEffect(() => {
    const el = ref.current!;
    const away = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) closeRef.current(false);
    };
    const shut = () => closeRef.current(false);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("blur", shut);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("blur", shut);
      window.removeEventListener("resize", shut);
    };
  }, []);

  function close(refocus: boolean) {
    if (refocus && opener.current?.isConnected) {
      opener.current.focus({ preventScroll: true });
    }
    onClose(refocus);
  }

  function onKeyDown(e: KeyboardEvent) {
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>(ROW) ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      rows[(n + rows.length) % rows.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Tab") {
      // A menu is one stop: Tab leaves it, the way Esc does.
      e.preventDefault();
      close(true);
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label ?? "Actions"}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: (pos ?? menu).x, top: (pos ?? menu).y }}
      data-os-menu
      className={`fixed z-[105] min-w-52 select-none border border-os-primary bg-os-panel py-1 shadow-[6px_6px_0_0_rgb(0_0_0/0.45)] ${
        pos ? "" : "invisible"
      }`}
    >
      {menu.entries.map((m, i) =>
        m === "divider" ? (
          <div key={i} role="separator" className="my-1 h-px bg-os-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={m.disabled}
            data-danger={m.danger || undefined}
            onClick={() => {
              close(true);
              m.onSelect();
            }}
            className={`block w-full px-3 py-1.5 text-left text-[13px] outline-none disabled:opacity-40 ${
              m.bold ? "font-semibold" : ""
            } ${
              m.danger ? "text-os-danger" : "text-os-fg"
            } enabled:hover:bg-os-primary enabled:hover:text-os-bg enabled:focus-visible:bg-os-primary enabled:focus-visible:text-os-bg`}
          >
            {m.label}
          </button>
        ),
      )}
    </div>
  );
}
