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
  /** What choosing it does. Not needed when `render` draws a link. */
  onSelect?: () => void;
  /**
   * Draw the row yourself, as a link (the app's `<Link>` with its default
   * prefetch, or the sign-out link), spreading `props` onto it. The menu
   * still closes when it is chosen.
   */
  render?: (props: StartMenuRowProps) => ReactNode;
  /** A count of new things, drawn at the row's end and read out. */
  badge?: number;
  /**
   * A short tag after the label (LEAD on a team the member leads): `text` is
   * drawn, `spoken` is added to the row's name ("you lead it").
   */
  tag?: { text: string; spoken: string };
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
                item.onSelect?.();
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

/** What a row drawn with `render` must carry. */
export type StartMenuRowProps = {
  role: "menuitem";
  tabIndex: -1;
  className: string;
  onClick: () => void;
  "aria-label"?: string;
  children: ReactNode;
};

/** One section of the grouped Start menu: Me, Camp, Captains, My teams. */
export type StartMenuGroup = {
  key: string;
  /** Shown above the rows and read out as the group's name. */
  label: string;
  items: readonly StartMenuItem[];
};

type GroupedProps = {
  groups: readonly StartMenuGroup[];
  /** Rows along the bottom: Account, Report a problem, Log off. */
  footer?: readonly StartMenuItem[];
  /** Above the groups: the member's name and rank, as the app draws them. */
  header?: ReactNode;
  label: string;
  banner: string;
  anchor: RefObject<HTMLElement | null>;
  onClose: (refocus: boolean) => void;
  landmark?: string;
};

const GROUP_ROW =
  "group flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-pixel text-[11px] uppercase text-os-fg outline-none hover:bg-os-primary hover:text-os-primary-fg focus-visible:bg-os-primary focus-visible:text-os-primary-fg";

/**
 * The console's Start menu: the member's programs in their groups, then the
 * footer rows. Above every window and all chrome (band 100), at most half
 * the screen high on a desktop before it scrolls; a full-screen sheet on a
 * phone. Arrow keys walk every row, Home and End jump, Esc and Tab go back to
 * Start, and a press anywhere else shuts it.
 */
export function GroupedStartMenu({
  groups,
  footer = [],
  header,
  label,
  banner,
  anchor,
  onClose,
  landmark,
}: GroupedProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

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
    const go = (n: number) => {
      e.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(true);
    } else if (e.key === "Tab") {
      // A menu is one stop: Tab leaves it, the way Esc does (as the
      // right-click menu does), rather than leave it open behind focus.
      e.preventDefault();
      onClose(true);
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
  }

  function row(item: StartMenuItem, extra = "") {
    const pick = () => {
      onClose(false);
      item.onSelect?.();
    };
    const extras = [
      item.tag?.spoken,
      item.badge && item.badge > 0 ? `${item.badge} new` : undefined,
    ].filter(Boolean);
    const name =
      extras.length > 0 ? [item.label, ...extras].join(", ") : undefined;
    const children = (
      <>
        {item.icon}
        <span className="truncate">{item.label}</span>
        {item.tag && (
          <span
            aria-hidden
            className="border border-current px-0.5 text-[10px] leading-tight"
          >
            {item.tag.text}
          </span>
        )}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            aria-hidden
            className="ml-auto bg-os-primary px-1 font-mono text-[10px] font-bold text-os-primary-fg group-hover:bg-os-primary-fg group-hover:text-os-primary"
          >
            {item.badge}
          </span>
        )}
      </>
    );
    const className = `${GROUP_ROW} ${item.muted ? "text-os-muted" : ""} ${extra}`;
    if (item.render) {
      return item.render({
        role: "menuitem",
        tabIndex: -1,
        className,
        onClick: pick,
        "aria-label": name,
        children,
      });
    }
    return (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-label={name}
        onClick={pick}
        className={className}
      >
        {children}
      </button>
    );
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-os-start
      className="fixed inset-x-0 top-0 bottom-14 z-[100] flex select-none border-os-primary bg-os-panel md:inset-x-auto md:top-auto md:left-0 md:bottom-10 md:max-h-[50dvh] md:w-[46rem] md:max-w-[calc(100vw-1rem)] md:border md:shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
    >
      <div className="hidden w-8 shrink-0 items-end justify-center bg-os-primary pb-3 md:flex">
        <span className="rotate-180 font-pixel text-sm uppercase tracking-widest text-os-primary-fg [writing-mode:vertical-rl]">
          {banner}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {header && (
          <div className="shrink-0 border-b border-os-line bg-os-chrome/60 px-3 py-2.5">
            {header}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] md:divide-x md:divide-os-line">
            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div
                  key={g.key}
                  role="group"
                  aria-label={g.label}
                  className="py-1"
                >
                  <p
                    aria-hidden
                    className="px-3 pb-1 pt-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-os-muted"
                  >
                    {g.label}
                  </p>
                  <ul role="none">
                    {g.items.map((item) => (
                      <li key={item.key} role="none">
                        {row(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
        {footer.length > 0 && (
          <ul
            role="none"
            className="flex shrink-0 flex-wrap border-t border-os-line bg-os-chrome/40"
          >
            {footer.map((item) => (
              <li key={item.key} role="none" className="flex-1">
                {row(item, "py-2")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return landmark ? <nav aria-label={landmark}>{menu}</nav> : menu;
}
