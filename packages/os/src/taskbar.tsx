"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { StartMenu, type StartMenuItem } from "./start-menu";

/** One open window's button on the taskbar. */
export type TaskbarWindow<K extends string> = {
  id: K;
  label: string;
  /** Drawn before the label; the app sizes and tints it. */
  icon?: ReactNode;
  minimized?: boolean;
  /**
   * The button's name, read out, when it should differ from the label (the
   * console says "Tasks window", so a page's own "Tasks" button is never
   * confused with it).
   */
  ariaLabel?: string;
};

type Props<K extends string> = {
  windows: readonly TaskbarWindow<K>[];
  topId: K | undefined;
  /** A window's taskbar button: minimise it if it is on top, else raise it. */
  onToggleWindow: (id: K) => void;
  /** What the Start button says. */
  startLabel: ReactNode;
  /** The flat Start menu's rows; unused with `renderStartMenu`. */
  startItems?: readonly StartMenuItem[];
  /** Written up the side of the flat Start menu. */
  startBanner?: string;
  /** The Start menu's name, read out. */
  startMenuLabel?: string;
  /** Wraps the Start menu in a nav landmark with this name, when given. */
  startLandmark?: string;
  /** The right-hand end: a clock, a countdown, tray icons. */
  tray?: ReactNode;
  /**
   * A thin "Show desktop" strip at the very end, as on an old desktop, when
   * given: it minimises every window.
   */
  onShowDesktop?: () => void;
  /**
   * The console's taskbar (the approved prototype): a rule after Start, and
   * a magenta line under the window button that is on top.
   */
  console?: boolean;
  /**
   * Draw a Start menu of your own (the grouped one) instead of the flat list
   * of `startItems`. Given the Start button, to leave alone on a press away,
   * and the way to shut the menu.
   */
  renderStartMenu?: (menu: {
    anchor: RefObject<HTMLElement | null>;
    onClose: (refocus: boolean) => void;
  }) => ReactNode;
};

// The start bar along the bottom: a Start menu of every program, a button per
// open window, and whatever the app puts in the tray.
export function Taskbar<K extends string>({
  windows,
  topId,
  onToggleWindow,
  startLabel,
  startItems = [],
  startBanner = "",
  startMenuLabel = "Start",
  startLandmark,
  tray,
  renderStartMenu,
  onShowDesktop,
  console: consoleLook = false,
}: Props<K>) {
  const [menu, setMenu] = useState(false);
  const start = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setMenu(false);
    if (refocus) start.current?.focus();
  }, []);

  return (
    <>
      {menu && renderStartMenu?.({ anchor: start, onClose: close })}
      {menu && !renderStartMenu && (
        <StartMenu
          items={startItems}
          label={startMenuLabel}
          banner={startBanner}
          anchor={start}
          onClose={close}
          landmark={startLandmark}
        />
      )}

      <div
        role="toolbar"
        aria-label="Taskbar"
        className="fixed inset-x-0 bottom-0 z-[90] flex h-10 select-none items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1"
      >
        <button
          ref={start}
          type="button"
          data-os-start-button
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className={`flex h-8 shrink-0 items-center gap-2 border px-3 font-pixel text-xs uppercase ${
            menu
              ? "border-os-primary bg-os-primary text-os-bg"
              : "border-os-line bg-os-panel text-os-fg hover:border-os-primary"
          }`}
        >
          {startLabel}
        </button>
        {consoleLook && (
          <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-os-line" />
        )}
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {windows.map((w) => {
            const active = w.id === topId && !w.minimized;
            return (
              <button
                key={w.id}
                type="button"
                data-task={w.id}
                aria-label={w.ariaLabel ?? w.label}
                aria-pressed={active}
                onClick={() => onToggleWindow(w.id)}
                className={`flex h-8 min-w-0 max-w-44 shrink-0 items-center gap-2 border px-2 font-pixel text-[10px] uppercase ${
                  active
                    ? `border-os-primary bg-os-bg text-os-fg ${
                        consoleLook
                          ? "shadow-[inset_0_-2px_0_0_var(--os-primary)]"
                          : ""
                      }`
                    : w.minimized
                      ? "border-os-line border-dashed bg-os-panel text-os-muted"
                      : "border-os-line bg-os-panel text-os-fg"
                }`}
              >
                {w.icon}
                {/* Drawn by CSS, so a window's name on its taskbar button
                    never collides with the same words in its page. */}
                <span
                  aria-hidden
                  data-label={w.label}
                  className="truncate after:content-[attr(data-label)]"
                />
              </button>
            );
          })}
        </div>
        {tray}
        {onShowDesktop && (
          <button
            type="button"
            onClick={onShowDesktop}
            aria-label="Show desktop"
            title="Show desktop"
            className="-mr-1 h-full w-2 shrink-0 border-l border-os-line outline-none hover:bg-os-primary focus-visible:bg-os-primary"
          />
        )}
      </div>
    </>
  );
}
