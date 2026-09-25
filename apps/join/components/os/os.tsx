"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { appById } from "@/lib/apps";
import {
  INITIAL_WM,
  topWindow,
  wmReducer,
  type AppId,
  type Viewport,
} from "@/lib/window-manager";
import { Boot } from "./boot";
import { Desktop } from "./desktop";
import { OsWindowFrame } from "./os-window";
import { WindowContent } from "./windows";

const PHONE_QUERY = "(max-width: 767px)";

function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export function Os() {
  const [booting, setBooting] = useState(true);
  const [wm, dispatch] = useReducer(wmReducer, INITIAL_WM);
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
  const top = topWindow(wm);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || booting || !top) return;
      if ((e.target as HTMLElement | null)?.closest("[role=dialog]")) return;
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
        .querySelector<HTMLElement>(`[data-tray="${id}"]`)
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
  const minimized = wm.windows.filter((w) => w.minimized);

  return (
    <>
      <Desktop
        windows={wm.windows}
        phone={phone}
        onOpen={openApp}
        onReboot={reboot}
      >
        <div ref={layer} className="pointer-events-none absolute inset-0">
          {wm.windows.map((w) => (
            <OsWindowFrame
              key={w.id}
              win={w}
              hidden={hiddenWin(w)}
              title={appById(w.id).label}
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
      {minimized.length > 0 && (
        <nav
          aria-label="Minimised windows"
          className={`fixed z-[90] flex gap-1 ${
            phone
              ? "inset-x-0 bottom-0 overflow-x-auto border-t border-os-primary bg-os-chrome p-1"
              : "bottom-4 left-4"
          }`}
        >
          {minimized.map((w) => (
            <button
              key={w.id}
              type="button"
              data-tray={w.id}
              onClick={() => restoreApp(w.id)}
              aria-label={`Bring back ${appById(w.id).label}`}
              className="flex h-8 shrink-0 items-center gap-2 border border-os-line bg-os-panel px-3 font-pixel text-[10px] uppercase text-os-fg shadow-[4px_4px_0_0_rgb(0_0_0/0.4)] hover:border-os-primary"
            >
              <span aria-hidden className="text-os-primary">
                ▭
              </span>
              {appById(w.id).label}
            </button>
          ))}
        </nav>
      )}
      {booting && <Boot onDone={finishBoot} />}
    </>
  );
}
