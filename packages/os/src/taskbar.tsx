"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { StartMenu, type StartMenuItem } from "./start-menu";

/** One open window's button on the taskbar. */
export type TaskbarWindow<K extends string> = {
  id: K;
  label: string;
  /** Drawn before the label; the app sizes and tints it. */
  icon?: ReactNode;
  minimized?: boolean;
};

type Props<K extends string> = {
  windows: readonly TaskbarWindow<K>[];
  topId: K | undefined;
  /** A window's taskbar button: minimise it if it is on top, else raise it. */
  onToggleWindow: (id: K) => void;
  /** What the Start button says. */
  startLabel: ReactNode;
  startItems: readonly StartMenuItem[];
  /** Written up the side of the Start menu. */
  startBanner: string;
  /** The Start menu's name, read out. */
  startMenuLabel?: string;
  /** Wraps the Start menu in a nav landmark with this name, when given. */
  startLandmark?: string;
  /** The right-hand end: a clock, a countdown, tray icons. */
  tray?: ReactNode;
};

// The start bar along the bottom: a Start menu of every program, a button per
// open window, and whatever the app puts in the tray.
export function Taskbar<K extends string>({
  windows,
  topId,
  onToggleWindow,
  startLabel,
  startItems,
  startBanner,
  startMenuLabel = "Start",
  startLandmark,
  tray,
}: Props<K>) {
  const [menu, setMenu] = useState(false);
  const start = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setMenu(false);
    if (refocus) start.current?.focus();
  }, []);

  return (
    <>
      {menu && (
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
        className="fixed inset-x-0 bottom-0 z-[90] flex h-10 items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1"
      >
        <button
          ref={start}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className={`flex h-8 shrink-0 items-center gap-2 border px-3 font-pixel text-xs uppercase ${
            menu
              ? "border-os-primary bg-os-primary text-os-primary-fg"
              : "border-os-line bg-os-panel text-os-fg hover:border-os-primary"
          }`}
        >
          {startLabel}
        </button>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {windows.map((w) => {
            const active = w.id === topId && !w.minimized;
            return (
              <button
                key={w.id}
                type="button"
                data-task={w.id}
                aria-pressed={active}
                onClick={() => onToggleWindow(w.id)}
                className={`flex h-8 min-w-0 max-w-44 shrink-0 items-center gap-2 border px-2 font-pixel text-[10px] uppercase ${
                  active
                    ? "border-os-primary bg-os-bg text-os-fg"
                    : w.minimized
                      ? "border-os-line border-dashed bg-os-panel text-os-muted"
                      : "border-os-line bg-os-panel text-os-fg"
                }`}
              >
                {w.icon}
                <span className="truncate">{w.label}</span>
              </button>
            );
          })}
        </div>
        {tray}
      </div>
    </>
  );
}
