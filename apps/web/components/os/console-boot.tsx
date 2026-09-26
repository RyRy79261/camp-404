"use client";

import { useCallback, useEffect, useState } from "react";
import { Surface } from "@camp404/os";
import { BOOT_COOKIE, type BootLine } from "@/lib/boot";

// The boot screen (decision 6 A; the approved prototype's ABoot): Join's BIOS
// log with the member's own lines, one every 70 ms, then "Welcome back". Any
// key or tap skips it. Once per browser session (a session cookie the server
// reads, lib/boot.ts), never under E2E_TEST_MODE (the layout does not draw
// it), and never under reduced motion (hidden by CSS on the first paint, and
// ended at once). It covers the desktop; nothing behind it waits for it.
//
// For a screen reader it is one line, not a log: the BIOS lines are a
// picture (hidden from assistive tech), the welcome is said once, and the
// desktop underneath is inert while the boot covers it, so nothing behind
// can take focus or be read out through it.

const LINE_MS = 70;
const HOLD_MS = 450;

export function ConsoleBoot({
  lines,
  welcome,
}: {
  lines: readonly BootLine[];
  /** The last line: "Welcome back, Nova". */
  welcome: string;
}) {
  const [done, setDone] = useState(false);
  const [shown, setShown] = useState(0);
  const total = lines.length;

  const finish = useCallback(() => {
    document.cookie = `${BOOT_COOKIE}=1; path=/; SameSite=Lax`;
    setDone(true);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    let i = 0;
    let hold: number | undefined;
    const tick = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i > total) {
        window.clearInterval(tick);
        hold = window.setTimeout(finish, HOLD_MS);
      }
    }, LINE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(hold);
    };
  }, [finish, total]);

  // The desktop under the boot sleeps until it goes. Left alone if it was
  // asleep already (a blocking form), so this never wakes what something
  // else put to sleep.
  useEffect(() => {
    if (done) return;
    const desk = document.getElementById("os-desktop");
    if (!desk || desk.hasAttribute("inert")) return;
    desk.setAttribute("inert", "");
    return () => desk.removeAttribute("inert");
  }, [done]);

  useEffect(() => {
    if (done) return;
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);
    return () => {
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [done, finish]);

  if (done) return null;
  return (
    <div
      data-os-boot
      className="fixed inset-0 z-[130] select-none overflow-hidden bg-os-bg p-6 font-mono text-sm text-os-fg motion-reduce:hidden sm:p-10"
    >
      <Surface beam={false} />
      {/* The one thing said: the welcome, once the log has run. */}
      <p role="status" className="sr-only">
        {shown > total ? welcome : ""}
      </p>
      <div aria-hidden className="relative max-w-2xl space-y-1">
        {lines.slice(0, shown).map((l) => (
          <p key={l.text} className="flex gap-2">
            <span className="truncate">{l.text}</span>
            {l.ok && (
              <>
                <span
                  aria-hidden
                  className="min-w-4 flex-1 overflow-hidden whitespace-nowrap text-os-line"
                >
                  {".".repeat(80)}
                </span>
                <span className="shrink-0 text-os-accent">{l.ok}</span>
              </>
            )}
          </p>
        ))}
        {shown > total && (
          <p className="pt-3 font-pixel uppercase tracking-widest text-os-primary">
            {welcome}
            <span aria-hidden className="os-cursor ml-1">
              _
            </span>
          </p>
        )}
      </div>
      <p
        aria-hidden
        className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-[0.3em] text-os-muted sm:left-10"
      >
        Press any key to skip
      </p>
    </div>
  );
}
