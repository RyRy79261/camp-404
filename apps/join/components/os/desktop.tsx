"use client";

import type { ReactNode } from "react";
import { DesktopIcon, IconGroup } from "@camp404/os";
import { APPS } from "@/lib/apps";
import { DESKTOP } from "@/lib/content";
import type { AppId, JoinWindow } from "@/lib/window-manager";
import { AppIcon } from "./icons";
import { useJoinData } from "./join-data";
import { GlitchWordmark } from "./glitch-wordmark";

// The desktop, composed after dimensional.org/prototype (owner's pick of three
// prototypes, 2026-09-25; the other two are on the prototype/join-desktops
// branch): header bar, glitched wordmark, a two-column icon grid on the left
// and a mock-legal footer. Below md it becomes a phone home screen.

type Props = {
  windows: JoinWindow[];
  phone: boolean;
  onOpen: (id: AppId) => void;
  onReboot: () => void;
  /** The window layer. */
  children: ReactNode;
};

function Surface() {
  return (
    <>
      <div
        aria-hidden
        className="os-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="os-scanlines pointer-events-none absolute inset-0"
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
    <footer className="text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-os-muted/80">
      {DESKTOP.footer.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <button
        type="button"
        onClick={onReboot}
        className="pointer-events-auto mt-1 text-os-fg hover:text-os-primary"
      >
        {DESKTOP.reboot}
      </button>
    </footer>
  );
}

export function Desktop({ windows, phone, onOpen, onReboot, children }: Props) {
  const { year } = useJoinData();
  const open = new Set(windows.map((w) => w.id));
  const icons = APPS.map((app) => (
    <DesktopIcon
      key={app.id}
      id={app.id}
      label={app.label}
      icon={(className) => <AppIcon id={app.id} className={className} />}
      open={open.has(app.id)}
      onOpen={() => onOpen(app.id)}
      size={phone ? "md" : "sm"}
    />
  ));

  if (phone) {
    return (
      <main className="relative min-h-dvh overflow-x-clip bg-os-bg pb-16">
        <Surface />
        <h1 className="sr-only">Camp 404</h1>
        <div className="pointer-events-none relative flex flex-col items-center gap-2 pt-10">
          <GlitchWordmark text="404" size="clamp(5rem, 34vw, 9rem)" />
          <p className="os-chromatic px-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-os-fg">
            {DESKTOP.tagline(year)}
          </p>
        </div>
        <IconGroup
          label="Desktop"
          className="relative mx-auto mt-8 grid max-w-sm grid-cols-3 justify-items-center gap-y-5 px-2"
        >
          {icons}
        </IconGroup>
        <div className="relative mt-10 px-4">
          <Footer onReboot={onReboot} />
        </div>
        {children}
      </main>
    );
  }

  return (
    <main className="relative h-dvh overflow-clip bg-os-bg">
      <Surface />
      <header className="relative z-10 flex h-11 items-center justify-between border-b border-os-line/60 bg-os-bg/80 px-4">
        <span className="os-glow font-pixel text-sm uppercase tracking-widest text-os-fg">
          Camp_404
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-os-muted">
          {DESKTOP.location}
        </span>
      </header>
      <div className="pointer-events-none relative mt-8 flex flex-col items-center gap-3">
        <h1 className="sr-only">Camp 404</h1>
        <GlitchWordmark
          text={DESKTOP.wordmark}
          size="clamp(3rem, 7vw, 5.5rem)"
        />
        <p className="os-chromatic font-mono text-[11px] uppercase tracking-[0.3em] text-os-fg">
          {DESKTOP.tagline(year)}
        </p>
      </div>
      <IconGroup
        label="Desktop"
        className="absolute left-4 top-20 z-10 grid grid-cols-2 gap-x-1 gap-y-3"
      >
        {icons}
      </IconGroup>
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10">
        <Footer onReboot={onReboot} />
      </div>
      {/* Windows stop above the taskbar, so full screen never covers it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-10 z-20">
        {children}
      </div>
    </main>
  );
}
