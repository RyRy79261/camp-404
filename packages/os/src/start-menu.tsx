"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

export type StartMenuItem = {
  key: string;
  label: string;
  /** Drawn before the label; the app sizes and tints it. */
  icon?: ReactNode;
  onSelect: () => void;
  /** Quieter text, for housekeeping entries such as a reboot. */
  muted?: boolean;
  /** A rule above this entry. */
  separated?: boolean;
};

type Props = {
  items: readonly StartMenuItem[];
  /** The name read out for the menu. */
  label: string;
  /** Written up the menu's side, like an old Start menu's banner. */
  banner: string;
  /** The button that opened the menu: a press on it is not a press away. */
  anchor: RefObject<HTMLElement | null>;
  /** Shut the menu; `refocus` hands focus back to the anchor. */
  onClose: (refocus: boolean) => void;
  /** Wraps the menu in a nav landmark with this name, when given. */
  landmark?: string;
};

const ITEM =
  "flex w-full items-center gap-3 px-3 py-1.5 text-left font-pixel text-[11px] uppercase outline-none hover:bg-os-primary hover:text-os-primary-fg focus-visible:bg-os-primary focus-visible:text-os-primary-fg";

// The Start menu: every program the app lists, above the taskbar. Arrow keys
// walk it, Esc shuts it, and a press anywhere else shuts it too.
export function StartMenu({
  items,
  label,
  banner,
  anchor,
  onClose,
  landmark,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent's re-render (a clock tick) does not
  // re-run the opening effect and pull focus back to the first item.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Opening the menu puts focus on its first item; a click elsewhere shuts it.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    function away(e: globalThis.PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !anchor.current?.contains(t)) {
        closeRef.current(false);
      }
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [anchor]);

  function onKeyDown(e: KeyboardEvent) {
    const all = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ??
        []),
    ];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      all[(i + 1) % all.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length]?.focus();
    }
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="fixed bottom-10 left-0 z-[95] flex max-h-[calc(100dvh-3rem)] w-64 border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
    >
      <div className="flex w-8 shrink-0 items-end justify-center bg-os-primary pb-3">
        <span className="rotate-180 font-pixel text-sm uppercase tracking-widest text-os-primary-fg [writing-mode:vertical-rl]">
          {banner}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {items.map((item) => (
          <li
            key={item.key}
            className={
              item.separated ? "mt-1 border-t border-os-line pt-1" : undefined
            }
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose(false);
                item.onSelect();
              }}
              className={`${ITEM} ${item.muted ? "text-os-muted" : "text-os-fg"}`}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return landmark ? <nav aria-label={landmark}>{menu}</nav> : menu;
}
