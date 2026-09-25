"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Boot,
  INITIAL_WM,
  OsWindowFrame,
  topWindow,
  usePhone,
  wmReducer,
  type Viewport,
} from "@camp404/os";
import { appById } from "@/lib/apps";
import { BOOT_ERROR, bootLines } from "@/lib/content";
import type { AppId } from "@/lib/window-manager";
import { Desktop } from "./desktop";
import { Taskbar } from "./taskbar";
import { JoinDataProvider } from "./join-data";
import type { JoinData } from "@/lib/join-data";
import { WindowContent } from "./windows";

// join.camp-404.com's desktop, on the shared 404 OS engine (@camp404/os):
// Join decides which programs there are and what they show.
export function Os({ data }: { data: JoinData }) {
  const [booting, setBooting] = useState(true);
  const [wm, dispatch] = useReducer(wmReducer<AppId>, INITIAL_WM);
  const phone = usePhone();
  const layer = useRef<HTMLDivElement>(null);

  const viewport = useCallback((): Viewport => {
    const r = layer.current?.getBoundingClientRect();
    return r
      ? { width: r.width, height: r.height }
      : { width: window.innerWidth, height: window.innerHeight };
  }, []);

  const openApp = useCallback(
    (id: AppId) =>
      dispatch({
        type: "open",
        id,
        size: appById(id).size,
        viewport: viewport(),
      }),
    [viewport],
  );

  const closeApp = useCallback((id: AppId) => {
    dispatch({ type: "close", id });
    // Focus goes back where the visitor was: the next window down, or the
    // icon that opened this one.
    requestAnimationFrame(() => {
      const next = document.querySelector<HTMLElement>("[data-top]");
      const icon = document.querySelector<HTMLElement>(`[data-icon="${id}"]`);
      (next ?? icon)?.focus({ preventScroll: true });
    });
  }, []);

  const finishBoot = useCallback(() => setBooting(false), []);

  // README.TXT opens as the boot ends (and after every reboot).
  useEffect(() => {
    if (!booting) openApp("readme");
  }, [booting, openApp]);

  // Esc with focus on the desktop (not in a window) closes the top window.
  // A window answers its own Esc, and one already used is left alone.
  const top = topWindow(wm);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || booting || !top) return;
      if ((e.target as HTMLElement | null)?.closest("[data-window]")) return;
      closeApp(top.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booting, top, closeApp]);

  function reboot() {
    dispatch({ type: "closeAll" });
    setBooting(true);
  }

  function minimizeApp(id: AppId) {
    dispatch({ type: "minimize", id });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-task="${id}"]`)
        ?.focus({ preventScroll: true }),
    );
  }

  function restoreApp(id: AppId) {
    dispatch({ type: "focus", id });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-window="${id}"]`)
        ?.focus({ preventScroll: true }),
    );
  }

  // Every open window stays mounted, so a minimised terminal keeps its
  // history. A minimised one is hidden; on a phone only the top one shows.
  const hiddenWin = (w: (typeof wm.windows)[number]) =>
    !!w.minimized || (phone && w.id !== top?.id);

  return (
    <JoinDataProvider data={data}>
      <Desktop
        windows={wm.windows}
        phone={phone}
        onOpen={openApp}
        onReboot={reboot}
      >
        {/* isolate: window z-indexes stay inside this layer, so on a phone
            (no z-20 wrapper) a window never rises over the taskbar. */}
        <div
          ref={layer}
          className="pointer-events-none absolute inset-0 isolate"
        >
          {wm.windows.map((w) => (
            <OsWindowFrame
              key={w.id}
              win={w}
              hidden={hiddenWin(w)}
              title={appById(w.id).label}
              // Join's window bodies start at h3, under this h2.
              titleHeading
              isTop={w.id === top?.id}
              phone={phone}
              onFocus={() => dispatch({ type: "focus", id: w.id })}
              onClose={() => closeApp(w.id)}
              onMinimize={() => minimizeApp(w.id)}
              onToggleMaximize={() =>
                dispatch({ type: "toggleMaximize", id: w.id })
              }
              onMove={(x, y) =>
                dispatch({ type: "move", id: w.id, x, y, viewport: viewport() })
              }
              onResize={(from, edge, dx, dy) =>
                dispatch({
                  type: "resize",
                  id: w.id,
                  from,
                  edge,
                  dx,
                  dy,
                  viewport: viewport(),
                })
              }
            >
              <WindowContent
                id={w.id}
                openApp={openApp}
                close={() => closeApp(w.id)}
              />
            </OsWindowFrame>
          ))}
        </div>
      </Desktop>
      <Taskbar
        windows={wm.windows}
        topId={top?.id}
        onOpen={openApp}
        onToggleWindow={(id) =>
          id === top?.id ? minimizeApp(id) : restoreApp(id)
        }
        onReboot={reboot}
      />
      {booting && (
        <Boot
          lines={bootLines(data.year)}
          finale={BOOT_ERROR}
          label="Starting Camp 404 OS"
          onDone={finishBoot}
        />
      )}
    </JoinDataProvider>
  );
}
