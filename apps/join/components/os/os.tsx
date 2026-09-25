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
import { PrototypeSwitcher } from "../prototype-switcher";
import { Boot } from "./boot";
import {
  DesktopA,
  DesktopB,
  DesktopC,
  PhoneDesktop,
  VARIANTS,
  type VariantKey,
} from "./desktops.prototype";
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

function readVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get("variant");
  return v && v in VARIANTS ? (v as VariantKey) : "A";
}

export function Os() {
  const [booting, setBooting] = useState(true);
  const [wm, dispatch] = useReducer(wmReducer, INITIAL_WM);
  const [variant, setVariant] = useState<VariantKey>("A");
  const phone = usePhone();
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => setVariant(readVariant()), []);

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

  function changeVariant(key: VariantKey) {
    setVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
    dispatch({ type: "closeAll" });
    requestAnimationFrame(() => openApp("readme"));
  }

  const Desktop = phone
    ? PhoneDesktop
    : { A: DesktopA, B: DesktopB, C: DesktopC }[variant];

  // On a phone the stack shows only its top window; the rest wait under it.
  const shown = phone && top ? [top] : wm.windows;

  return (
    <>
      <Desktop
        windows={wm.windows}
        topId={top?.id}
        onOpen={openApp}
        onReboot={reboot}
      >
        <div ref={layer} className="pointer-events-none absolute inset-0">
          {shown.map((w) => (
            <OsWindowFrame
              key={w.id}
              win={w}
              title={appById(w.id).label}
              isTop={w.id === top?.id}
              phone={phone}
              onFocus={() => dispatch({ type: "focus", id: w.id })}
              onClose={() => closeApp(w.id)}
              onMove={(x, y) =>
                dispatch({ type: "move", id: w.id, x, y, viewport: viewport() })
              }
              onResize={(width, height) =>
                dispatch({
                  type: "resize",
                  id: w.id,
                  w: width,
                  h: height,
                  viewport: viewport(),
                })
              }
            >
              <WindowContent id={w.id} openApp={openApp} />
            </OsWindowFrame>
          ))}
        </div>
      </Desktop>
      {booting && <Boot onDone={finishBoot} />}
      {!phone && (
        <PrototypeSwitcher
          variants={VARIANTS}
          current={variant}
          onChange={changeVariant}
        />
      )}
    </>
  );
}
