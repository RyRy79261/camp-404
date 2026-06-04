"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { cn } from "../lib/utils";

export interface DictatePillProps {
  /**
   * Fired when the user taps the pill to open the RecorderPanel. The host owns
   * the `dictating` state and swaps DictatePill ↔ RecorderPanel — the pill is a
   * dumb trigger and holds no recorder state.
   */
  onActivate: () => void;
  /**
   * Label next to the mic icon — this is the button's accessible name. An empty
   * or whitespace-only value falls back to the default rather than rendering a
   * nameless button. @default "Dictate instead"
   */
  label?: string;
  /** Suppress re-activation (host sets true while RecorderPanel is busy). */
  disabled?: boolean;
  className?: string;
}

/**
 * Board-canonical dictation trigger (boards OB-03/04 + S05): an `r:999` pill —
 * mic + label in muted tones — that fires `onActivate`. A plain `<button>` (not
 * the `Button` leaf) so the pill radius/tokens stay self-evident and don't fight
 * Button's rectangular geometry.
 */
export function DictatePill({
  onActivate,
  label = "Dictate instead",
  disabled = false,
  className,
}: DictatePillProps) {
  // The label IS the button's accessible name — guard against an empty/
  // whitespace override so the pill never renders nameless.
  const text = label.trim() ? label : "Dictate instead";
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1.5",
        "text-xs font-normal text-muted-foreground",
        "transition-colors hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </button>
  );
}
