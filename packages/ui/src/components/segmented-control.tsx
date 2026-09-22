"use client";

import * as React from "react";

import { cn } from "../lib/utils";

// A row of equal-width segments. Two shapes share one skin:
//
//   - SegmentedControl — a controlled single-choice toggle (the questionnaire's
//     `toggle` kind). Proper radiogroup semantics with roving focus +
//     arrow-key navigation (the inline version it replaces was click-only).
//   - SegmentedLinks — the same row of segments drawn as LINKS, for a filter
//     whose state lives in the URL (the notification inbox's All / Unread /
//     Announcements tabs, from AfrikaBurn's inbox). Each segment navigates, so
//     the filtered list stays a server render, is linkable, and survives the
//     back button; the group is a <nav> and the current segment carries
//     aria-current="page", which is what a set of links means.
export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

/** The shared segment skin, so both shapes stay one control. */
const SEGMENT =
  "flex-1 rounded-sm px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SEGMENT_ON = "bg-primary text-primary-foreground shadow-sm";
const SEGMENT_OFF = "text-muted-foreground hover:text-foreground";
const SEGMENT_GROUP = "inline-flex w-full rounded-md border p-1";

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value?: string;
  onValueChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

function SegmentedControl({
  options,
  value,
  onValueChange,
  id,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function focusSelect(index: number) {
    // Wrap around; the modulo on a non-negative base handles -1 → last.
    const target = (index + options.length) % options.length;
    const next = options[target];
    if (!next) return;
    onValueChange(next.value);
    refs.current[target]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusSelect(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusSelect(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusSelect(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusSelect(options.length - 1);
    }
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(SEGMENT_GROUP, className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        // Roving tabindex: the selected segment (or the first, when none is
        // selected) is the single tab stop into the group.
        const tabbable = selected || (selectedIndex === -1 && i === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => focusSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(SEGMENT, selected ? SEGMENT_ON : SEGMENT_OFF)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SegmentedLinkOption extends SegmentedOption {
  /** Where this segment navigates. */
  href: string;
}

export interface SegmentedLinksProps {
  options: SegmentedLinkOption[];
  /** The option that is showing; no match highlights nothing. */
  value?: string;
  "aria-label": string;
  className?: string;
  /**
   * The anchor to render each segment as. Defaults to a plain `<a>`; a Next.js
   * app passes its `Link` so the filter is a client-side navigation. Kept as a
   * prop because this package must not depend on next.
   */
  linkAs?: React.ElementType;
}

/** The segment row as links — a URL-backed filter, not a form control. */
function SegmentedLinks({
  options,
  value,
  className,
  linkAs,
  "aria-label": ariaLabel,
}: SegmentedLinksProps) {
  const Anchor = (linkAs ?? "a") as React.ElementType;
  return (
    <nav aria-label={ariaLabel} className={cn(SEGMENT_GROUP, className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Anchor
            key={option.value}
            href={option.href}
            aria-current={selected ? "page" : undefined}
            className={cn(SEGMENT, selected ? SEGMENT_ON : SEGMENT_OFF)}
          >
            {option.label}
          </Anchor>
        );
      })}
    </nav>
  );
}

export { SegmentedControl, SegmentedLinks };
