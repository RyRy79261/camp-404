"use client";

import { useState } from "react";
import { PixelCat } from "./pixel-cat";
import { PRINCE_SLEEPING } from "./sprites";

/** What Prince says when he is petted, in turn. */
export const PRINCE_PETTED = [
  "prrr",
  "prrrrr",
  "…",
  "mrrp?",
  "(Prince ignores you)",
] as const;

/** Which line the n-th pet (1, 2, ...) gets: round and round the list. */
export function petLine(lines: readonly string[], pets: number): string {
  if (pets < 1 || lines.length === 0) return "";
  return lines[(pets - 1) % lines.length]!;
}

export type ClockCatProps = {
  /**
   * Extra classes. He sits absolutely on top of his parent (the clock, which
   * must be `position: relative`), 4px in from its right edge; override the
   * placement here (for example `right-2` on the phone's bar).
   */
  className?: string;
  /** What he says when petted. */
  lines?: readonly string[];
};

/**
 * Prince, curled up asleep on top of the taskbar clock with a slow "z". Tap
 * him to pet him and he answers in a little bubble. Under reduced motion the
 * "z" holds still and the bubble simply shows, then goes (cats.css).
 *
 * An easter egg, so never labelled and never a stop: hidden from assistive
 * tech and out of the Tab order, a toy for the pointer only. The keyboard's
 * cats are the Terminal's (`sudo feed cat`, `meow`).
 */
export function ClockCat({
  className = "",
  lines = PRINCE_PETTED,
}: ClockCatProps) {
  const [pets, setPets] = useState(0);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-cat="prince"
      onClick={() => setPets((n) => n + 1)}
      className={`group/cat absolute bottom-full right-1 z-10 -mb-[3px] outline-none ${className}`}
    >
      <PixelCat sprite={PRINCE_SLEEPING} className="block h-[26px] w-auto" />
      <span
        aria-hidden
        className="cat-zzz pointer-events-none absolute -right-1.5 -top-1 font-pixel text-[8px] text-os-muted"
      >
        z
      </span>
      {pets > 0 && (
        <span
          key={pets}
          className="cat-bubble pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap border border-os-line bg-os-panel px-1.5 py-0.5 font-pixel text-[9px] uppercase text-os-fg"
        >
          {petLine(lines, pets)}
        </span>
      )}
    </button>
  );
}
