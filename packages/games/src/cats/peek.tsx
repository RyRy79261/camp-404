"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelCat } from "./pixel-cat";
import { useReducedMotion } from "./reduced-motion";
import { JINN_HEAD } from "./sprites";

/** How long one peek lasts: the cat-peek animation (4.2 s) and a breath. */
export const PEEK_MS = 4300;
export const PEEK_MIN_MS = 50_000;
export const PEEK_MAX_MS = 110_000;

/** The wait before the next peek, for a random number in [0, 1). */
export function nextPeekDelay(
  random: number,
  min = PEEK_MIN_MS,
  max = PEEK_MAX_MS,
): number {
  return min + random * (max - min);
}

export type PeekingCatProps = {
  /**
   * Extra classes. By default it sits on the top edge of its parent (the
   * focused window's frame, `position: relative`), 96px in from the right.
   */
  className?: string;
};

/**
 * Jinn's head rising over the top edge of a window, looking at you, and
 * ducking back down. Decorative: it never takes a click. Render it only
 * while `usePeek` says so, on the focused window.
 */
export function PeekingCat({ className = "" }: PeekingCatProps) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-full right-24 h-[27px] w-[30px] overflow-hidden ${className}`}
    >
      <PixelCat sprite={JINN_HEAD} className="cat-peek block h-[27px] w-auto" />
    </span>
  );
}

export type PeekOptions = {
  /** Shortest and longest wait between peeks, in ms (50 s to 110 s). */
  minMs?: number;
  maxMs?: number;
};

/**
 * When Jinn peeks: a random 50 to 110 seconds apart, and at once when asked
 * (the Terminal's `sudo feed cat` calls `show`). Never under reduced motion,
 * and never while the tab is hidden, when nobody would see it.
 */
export function usePeek({
  minMs = PEEK_MIN_MS,
  maxMs = PEEK_MAX_MS,
}: PeekOptions = {}): [peeking: boolean, show: () => void] {
  const reduced = useReducedMotion();
  const [peeking, setPeeking] = useState(false);
  const off = useRef<number | undefined>(undefined);

  const show = useCallback(() => {
    if (reduced) return;
    if (typeof document !== "undefined" && document.hidden) return;
    setPeeking(true);
    window.clearTimeout(off.current);
    off.current = window.setTimeout(() => setPeeking(false), PEEK_MS);
  }, [reduced]);

  useEffect(() => {
    if (reduced) {
      window.clearTimeout(off.current);
      setPeeking(false);
      return;
    }
    let t: number | undefined;
    const again = () => {
      t = window.setTimeout(
        () => {
          show();
          again();
        },
        nextPeekDelay(Math.random(), minMs, maxMs),
      );
    };
    again();
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(off.current);
    };
  }, [reduced, show, minMs, maxMs]);

  return [peeking, show];
}
