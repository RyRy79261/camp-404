"use client";

import { useEffect, useRef, useState } from "react";
import { APPS, appById } from "@/lib/apps";
import { DESKTOP } from "@/lib/content";
import { useJoinData } from "./join-data";
import {
  burnCountdown,
  burnDatesLabel,
  countdownLabel,
  countdownShort,
  tankwaToday,
  type BurnCountdown,
} from "@/lib/countdown";
import type { AppId, OsWindow } from "@/lib/window-manager";
import { AppIcon } from "./icons";

type Props = {
  windows: OsWindow[];
  topId: AppId | undefined;
  onOpen: (id: AppId) => void;
  /** A window's taskbar button: minimise it if it is on top, else raise it. */
  onToggleWindow: (id: AppId) => void;
  onReboot: () => void;
};

function useBurnCountdown(burn: { start: string; end: string } | null) {
  const [c, setC] = useState<BurnCountdown | null>(null);
  useEffect(() => {
    if (!burn) return;
    const tick = () => setC(burnCountdown(tankwaToday(new Date()), burn));
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [burn]);
  return c;
}

// The start bar along the bottom (owner, 2026-09-25: somewhere to open and
// minimise): a Start menu of every program, a button per open window, and
// a countdown to the Burn (owner, 2026-09-25).
export function Taskbar({
  windows,
  topId,
  onOpen,
  onToggleWindow,
  onReboot,
}: Props) {
  const [menu, setMenu] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { burn } = useJoinData();
  const countdown = useBurnCountdown(burn);

  // Opening the menu puts focus on its first item; a click elsewhere shuts it.
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    function away(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !start.current?.contains(t)) {
        setMenu(false);
      }
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  function close(refocus = true) {
    setMenu(false);
    if (refocus) start.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ??
        []),
    ];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  }

  const item =
    "flex w-full items-center gap-3 px-3 py-1.5 text-left font-pixel text-[11px] uppercase outline-none hover:bg-os-primary hover:text-os-primary-fg focus-visible:bg-os-primary focus-visible:text-os-primary-fg";

  return (
    <>
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Start"
          onKeyDown={onMenuKey}
          className="fixed bottom-10 left-0 z-[95] flex max-h-[calc(100dvh-3rem)] w-64 border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
        >
          <div className="flex w-8 shrink-0 items-end justify-center bg-os-primary pb-3">
            <span className="rotate-180 font-pixel text-sm uppercase tracking-widest text-os-primary-fg [writing-mode:vertical-rl]">
              Camp 404 OS
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto py-1">
            {APPS.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    onOpen(app.id);
                  }}
                  className={`${item} text-os-fg`}
                >
                  <AppIcon id={app.id} className="size-5 text-os-accent" />
                  {app.label}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-os-line pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close(false);
                  onReboot();
                }}
                className={`${item} text-os-muted`}
              >
                {DESKTOP.reboot}
              </button>
            </li>
          </ul>
        </div>
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
          <span className="camp404-chromatic">404</span> Start
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
                <AppIcon id={w.id} className="size-4 shrink-0 text-os-accent" />
                <span className="truncate">{appById(w.id).label}</span>
              </button>
            );
          })}
        </div>
        {/* No dates yet (a captain sets them in the app): no countdown. */}
        {burn && (
          <div
            title={`AfrikaBurn: ${burnDatesLabel(burn)}`}
            className="flex h-8 shrink-0 items-center border border-os-line bg-os-panel px-2 font-mono text-[11px] uppercase tracking-wider text-os-fg sm:px-3"
          >
            <span className="sm:hidden">
              {countdown ? countdownShort(countdown) : "T-…"}
            </span>
            <span className="hidden sm:inline">
              {countdown ? countdownLabel(countdown) : "T-…"}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
