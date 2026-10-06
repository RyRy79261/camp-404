"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const LINE_MS = 110;
const HOLD_MS = 900;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const reducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const noReducedMotion = () => false;

type Props = {
  /** The start-up log, one line at a time. */
  lines: readonly string[];
  /** The last line, big, with a blinking cursor: the joke it ends on. */
  finale: string;
  /** What a screen reader hears while it plays. */
  label: string;
  onDone: () => void;
};

// A BIOS-style start-up that ends in the app's joke. Any key, click or tap
// skips it; under reduced motion every line shows at once and it ends fast.
export function Boot({ lines, finale, label, onDone }: Props) {
  const [ticked, setShown] = useState(0);
  const total = lines.length;
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotion,
    noReducedMotion,
  );
  // Under reduced motion every line, and the finale, show at once.
  const shown = reduced ? total + 1 : ticked;

  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(onDone, 700);
      return () => window.clearTimeout(t);
    }
    let i = 0;
    const tick = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i > total) {
        window.clearInterval(tick);
        window.setTimeout(onDone, HOLD_MS);
      }
    }, LINE_MS);
    return () => window.clearInterval(tick);
  }, [onDone, total, reduced]);

  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-label={label}
      className="fixed inset-0 z-[100] flex flex-col bg-os-bg p-6 font-mono text-xs text-os-muted sm:p-10 sm:text-sm"
    >
      <div
        aria-hidden
        className="os-scanlines pointer-events-none absolute inset-0"
      />
      <pre className="relative whitespace-pre-wrap leading-relaxed">
        {lines.slice(0, shown).join("\n")}
      </pre>
      {shown > total && (
        <p className="os-chromatic relative mt-4 font-pixel text-lg uppercase text-os-fg sm:text-2xl">
          {finale}
          <span className="os-cursor">_</span>
        </p>
      )}
      <p className="absolute bottom-6 right-6 text-[10px] uppercase tracking-[0.3em] text-os-muted/70">
        Press any key to skip
      </p>
    </div>
  );
}
