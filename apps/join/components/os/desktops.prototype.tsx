"use client";

// PROTOTYPE: three desktop compositions for 404 OS, switchable with
// ?variant=A|B|C (see prototype-switcher.tsx). The window system and every
// window's contents are shared; only the desktop around them changes. Once
// the owner picks one, the winner becomes the real desktop and this file
// moves to a throwaway branch.

import { useEffect, useState, type ReactNode } from "react";
import { APPS } from "@/lib/apps";
import { DESKTOP } from "@/lib/content";
import type { AppId, OsWindow } from "@/lib/window-manager";
import { DesktopIcon } from "./desktop-icon";
import { GlitchWordmark } from "./glitch-wordmark";
import { AppIcon } from "./icons";

export type DesktopProps = {
  windows: OsWindow[];
  topId: AppId | undefined;
  onOpen: (id: AppId) => void;
  onReboot: () => void;
  /** The window layer; each desktop decides the box it fills. */
  children: ReactNode;
};

export const VARIANTS = {
  A: "Dimensional",
  B: "Taskbar",
  C: "Horizon",
} as const;
export type VariantKey = keyof typeof VARIANTS;

function Surface() {
  return (
    <>
      <div
        aria-hidden
        className="os-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="camp404-scanlines pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="camp404-noise pointer-events-none absolute inset-0 opacity-[0.06]"
      />
      <div
        aria-hidden
        className="camp404-scanbeam pointer-events-none absolute inset-x-0 top-0 h-24"
      />
    </>
  );
}

function Footer({ onReboot }: { onReboot: () => void }) {
  return (
    <footer className="pointer-events-auto text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-os-muted/80">
      {DESKTOP.footer.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <button
        type="button"
        onClick={onReboot}
        className="mt-1 text-os-fg hover:text-os-primary"
      >
        {DESKTOP.reboot}
      </button>
    </footer>
  );
}

// A — Dimensional's own composition: header bar, centred wordmark, a
// two-column icon grid on the left, mock-legal footer.
export function DesktopA({
  windows,
  onOpen,
  onReboot,
  children,
}: DesktopProps) {
  const open = new Set(windows.map((w) => w.id));
  return (
    <main className="relative h-dvh overflow-hidden bg-os-bg">
      <Surface />
      <header className="relative z-10 flex h-11 items-center justify-between border-b border-os-line/60 bg-os-bg/80 px-4">
        <span className="os-glow font-pixel text-sm uppercase tracking-widest text-os-fg">
          Camp_404
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-os-muted">
          Tankwa Town · AfrikaBurn
        </span>
      </header>
      <div className="pointer-events-none relative z-0 mt-8 flex flex-col items-center gap-3">
        <GlitchWordmark
          text={DESKTOP.wordmark}
          size="clamp(3rem, 7vw, 5.5rem)"
        />
        <p className="camp404-chromatic font-mono text-[11px] uppercase tracking-[0.3em] text-os-fg">
          {DESKTOP.tagline}
        </p>
      </div>
      <nav
        aria-label="Desktop"
        className="absolute left-6 top-24 z-10 grid grid-cols-2 gap-x-3 gap-y-4"
      >
        {APPS.map((app) => (
          <DesktopIcon
            key={app.id}
            app={app}
            open={open.has(app.id)}
            onOpen={() => onOpen(app.id)}
            size="sm"
          />
        ))}
      </nav>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10">
        <Footer onReboot={onReboot} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20">
        {children}
      </div>
    </main>
  );
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

// B — a real 90s desktop: icons down the left edge, a faint 404 wallpaper,
// and a taskbar with a start menu, a button per open window and a clock.
export function DesktopB({
  windows,
  topId,
  onOpen,
  onReboot,
  children,
}: DesktopProps) {
  const open = new Set(windows.map((w) => w.id));
  const [menu, setMenu] = useState(false);
  const now = useClock();
  const tankwaTime = now?.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  });

  return (
    <main className="relative h-dvh overflow-hidden bg-os-bg">
      <Surface />
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">
        <GlitchWordmark text="404" size="clamp(10rem, 32vw, 26rem)" />
      </div>
      <nav
        aria-label="Desktop"
        className="absolute bottom-12 left-3 top-3 z-10 flex flex-col flex-wrap content-start gap-2"
      >
        {APPS.map((app) => (
          <DesktopIcon
            key={app.id}
            app={app}
            open={open.has(app.id)}
            onOpen={() => onOpen(app.id)}
            size="sm"
          />
        ))}
      </nav>
      <div className="pointer-events-none absolute inset-x-0 bottom-10 top-0 z-20">
        {children}
      </div>

      {menu && (
        <div
          role="menu"
          aria-label="Start"
          className="absolute bottom-10 left-0 z-[90] flex w-64 border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
          onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
        >
          <div className="flex w-8 items-end justify-center bg-os-primary pb-3">
            <span className="rotate-180 font-pixel text-sm uppercase tracking-widest text-os-primary-fg [writing-mode:vertical-rl]">
              Camp 404 OS
            </span>
          </div>
          <ul className="flex-1 py-1">
            {APPS.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onOpen(app.id);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left font-pixel text-[11px] uppercase text-os-fg hover:bg-os-primary hover:text-os-primary-fg focus-visible:bg-os-primary focus-visible:text-os-primary-fg"
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
                onClick={onReboot}
                className="w-full px-3 py-1.5 text-left font-pixel text-[11px] uppercase text-os-muted hover:bg-os-primary hover:text-os-primary-fg"
              >
                Reboot…
              </button>
            </li>
          </ul>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-[80] flex h-10 items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1">
        <button
          type="button"
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => setMenu((m) => !m)}
          className={`flex h-8 items-center gap-2 border px-3 font-pixel text-xs uppercase ${
            menu
              ? "border-os-primary bg-os-primary text-os-primary-fg"
              : "border-os-line bg-os-panel text-os-fg hover:border-os-primary"
          }`}
        >
          <span className="camp404-chromatic">404</span> Start
        </button>
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {windows.map((w) => {
            const app = APPS.find((a) => a.id === w.id)!;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onOpen(w.id)}
                className={`flex h-8 min-w-0 max-w-40 items-center gap-2 border px-2 font-pixel text-[10px] uppercase ${
                  w.id === topId
                    ? "border-os-primary bg-os-bg text-os-fg"
                    : "border-os-line bg-os-panel text-os-muted"
                }`}
              >
                <AppIcon id={w.id} className="size-4 shrink-0 text-os-accent" />
                <span className="truncate">{app.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex h-8 items-center gap-3 border border-os-line bg-os-panel px-3 font-mono text-[10px] uppercase tracking-wider text-os-muted">
          <span title="Tankwa Town time">{tankwaTime ?? "--:--"}</span>
        </div>
      </div>
    </main>
  );
}

// C — a synthwave desert: the glitched 404 as a sun over a moving grid, and
// the programs in a dock along the horizon.
export function DesktopC({
  windows,
  onOpen,
  onReboot,
  children,
}: DesktopProps) {
  const open = new Set(windows.map((w) => w.id));
  return (
    <main className="relative h-dvh overflow-hidden bg-os-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[58%] bg-[radial-gradient(ellipse_at_50%_100%,color-mix(in_oklch,var(--color-os-primary)_35%,transparent),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[58%] overflow-hidden"
      >
        <div className="os-horizon absolute -inset-x-1/2 top-0 h-[200%]" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[58%] h-px bg-os-primary shadow-[0_0_24px_4px_var(--color-os-primary)]"
      />
      <div
        aria-hidden
        className="camp404-scanlines pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="camp404-noise pointer-events-none absolute inset-0 opacity-[0.06]"
      />

      <div className="pointer-events-none absolute inset-x-0 top-[12%] flex flex-col items-center gap-4">
        <GlitchWordmark text="404" size="clamp(8rem, 22vw, 16rem)" />
        <p className="camp404-chromatic font-mono text-[11px] uppercase tracking-[0.4em] text-os-fg">
          {DESKTOP.tagline}
        </p>
      </div>

      <nav
        aria-label="Desktop"
        className="absolute inset-x-0 bottom-16 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap justify-center gap-1 border border-os-primary/50 bg-os-bg/70 px-3 py-2 backdrop-blur-sm"
      >
        {APPS.map((app) => (
          <DesktopIcon
            key={app.id}
            app={app}
            open={open.has(app.id)}
            onOpen={() => onOpen(app.id)}
            size="sm"
          />
        ))}
      </nav>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10">
        <Footer onReboot={onReboot} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20">
        {children}
      </div>
    </main>
  );
}

// Phone: one layout for every variant. Icons in a grid; windows open full
// screen over it as a stack.
export function PhoneDesktop({
  windows,
  onOpen,
  onReboot,
  children,
}: DesktopProps) {
  const open = new Set(windows.map((w) => w.id));
  return (
    <main className="relative min-h-dvh overflow-hidden bg-os-bg pb-6">
      <Surface />
      <div className="pointer-events-none relative flex flex-col items-center gap-2 pt-10">
        <GlitchWordmark text="404" size="clamp(5rem, 34vw, 9rem)" />
        <p className="camp404-chromatic px-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-os-fg">
          {DESKTOP.tagline}
        </p>
      </div>
      <nav
        aria-label="Desktop"
        className="relative mx-auto mt-8 grid max-w-sm grid-cols-3 justify-items-center gap-y-5 px-4"
      >
        {APPS.map((app) => (
          <DesktopIcon
            key={app.id}
            app={app}
            open={open.has(app.id)}
            onOpen={() => onOpen(app.id)}
          />
        ))}
      </nav>
      <div className="relative mt-10 px-4">
        <Footer onReboot={onReboot} />
      </div>
      {children}
    </main>
  );
}
