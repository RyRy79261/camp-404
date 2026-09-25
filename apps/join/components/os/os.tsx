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
import { Taskbar } from "./taskbar";
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
      <Taskbar
        windows={wm.windows}
        topId={top?.id}
        onOpen={openApp}
        onToggleWindow={(id) =>
          id === top?.id ? minimizeApp(id) : restoreApp(id)
        }
        onReboot={reboot}
      />
      {booting && <Boot onDone={finishBoot} />}
    </>
  );
}
