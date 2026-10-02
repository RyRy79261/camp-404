"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@camp404/ui/lib/utils";

// Small client parts the Kitchen's menu, recipe picker and shopping list
// share, in the approved mock-ups' grammar (design/approved-{kmp,rp,kmenu,
// ks}.html, owner 2026-10-01): a square filter toggle, a search box, a tick.
// They are plain elements on purpose: the kit's Button turns every label
// into pixel capitals, and the mock-ups draw these in sentence case. The
// class lists and words they share with the server live in labels.ts.

/** A square row of mutually exclusive filters, each with its count. */
export function FilterToggle<V extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: V; label: string; count?: number }[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex h-10 border border-[var(--color-choice-edge,var(--color-input))]",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap border-l border-[var(--color-choice-edge,var(--color-input))] px-3 text-[13px] font-semibold first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
              on
                ? "bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_25%,var(--color-card)))] text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <b className="ml-1 font-bold tabular-nums text-foreground">
                {o.count}
              </b>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A search box with its magnifier, the mock-ups' filter field. */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  onKeyDown,
  autoFocus,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  /** The box's fill: the page's by default (the picker), or a choice's. */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-10 items-center gap-2 border border-[var(--color-choice-edge,var(--color-input))] bg-background px-3 text-muted-foreground focus-within:border-primary",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
      />
    </span>
  );
}

/** A tick, drawn as the mock-ups draw it. */
export function TickGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

/** A small spinner for "With Claude…": it turns only while shown. */
export function Spin() {
  return (
    <i
      aria-hidden
      className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

const WIDE = "(min-width: 640px)";

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the SCREEN is at least 640px wide, for a dialog (portalled to
 * <body>, outside any window, so the page-* variants do not reach it). True
 * where there is no matchMedia (the server, jsdom).
 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => !window.matchMedia || window.matchMedia(WIDE).matches,
    () => true,
  );
}
