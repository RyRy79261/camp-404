"use client";

import { useContext, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Pin } from "lucide-react";
import { LineIcon } from "./line-icons";
import { DesktopSignalsContext } from "./held-screen";

/** A pin as the strip draws it: the announcement's id and title only. */
export interface PinnedItem {
  id: string;
  title: string;
}

/** The address a pin's "Read" opens. */
export const pinHref = (id: string) => `/announcements/${id}`;

/**
 * Pinned announcements on the desktop: one line in the header, as the
 * approved prototype draws it ([CORRECTION 2026-09-26] it used to sit above
 * the taskbar), so a pin cannot be missed. More than one shows "1 of N" with
 * next and previous; nothing moves on its own (the prototype's ticker turned
 * every 9 s; this one waits for the member, so an idle desktop costs
 * nothing). No dismiss: a pin comes down when a captain unpins it (owner,
 * 2026-09-22).
 *
 * "Read" is a real link (a new tab still works); a plain click goes through
 * the desktop, like an icon, so the dirty guard and the last-seen copy run.
 */
export function PinnedStrip({ pins }: { pins: readonly PinnedItem[] }) {
  const desktop = useContext(DesktopSignalsContext);
  const [at, setAt] = useState(0);
  if (pins.length === 0) return null;
  const n = pins.length;
  const i = ((at % n) + n) % n;
  const pin = pins[i]!;
  const href = pinHref(pin.id);

  function read(e: MouseEvent) {
    if (!desktop) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    desktop.open(href);
  }

  const nav =
    "grid size-6 place-items-center text-os-muted outline-none hover:text-os-fg focus-visible:text-os-fg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-primary";

  return (
    <section
      aria-label="Pinned announcements"
      data-os-pins
      className="flex h-8 w-full min-w-0 select-none items-center gap-2 border border-os-line bg-os-panel pr-1 shadow-[inset_3px_0_0_0_var(--os-primary)]"
    >
      <span className="shrink-0 pl-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[color-mix(in_oklch,var(--os-primary)_70%,var(--os-fg))]">
        Pinned
      </span>
      <p
        aria-live="polite"
        className="min-w-0 flex-1 select-text truncate text-sm text-os-fg"
        title={pin.title}
      >
        {pin.title}
      </p>
      {n > 1 && (
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            className={nav}
            aria-label="Previous pinned announcement"
            onClick={() => setAt(i - 1)}
          >
            <LineIcon name="chevron-left" className="size-3.5" />
          </button>
          <span className="font-mono text-[10px] text-os-muted">
            {i + 1} of {n}
          </span>
          <button
            type="button"
            className={nav}
            aria-label="Next pinned announcement"
            onClick={() => setAt(i + 1)}
          >
            <LineIcon name="chevron-right" className="size-3.5" />
          </button>
        </span>
      )}
      <Link
        href={href as Route}
        onClick={read}
        aria-label={`Read ${pin.title}`}
        className="shrink-0 border border-os-line px-2 py-0.5 font-pixel text-[10px] uppercase text-os-fg outline-none hover:border-os-primary hover:bg-os-primary hover:text-os-bg focus-visible:border-os-primary"
      >
        Read
      </Link>
    </section>
  );
}

/**
 * The pins on a phone, where there is no room for the strip: a short list at
 * the top of the bell's panel (visual-language doc, section 9), each with its
 * "Read" link through the desktop.
 */
export function PinnedList({
  pins,
  onNavigate,
}: {
  pins: readonly PinnedItem[];
  onNavigate: () => void;
}) {
  const desktop = useContext(DesktopSignalsContext);
  if (pins.length === 0) return null;
  return (
    <section
      aria-label="Pinned announcements"
      className="border-b border-border px-4 py-2 shadow-[inset_3px_0_0_0_var(--os-primary)]"
    >
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-[color-mix(in_oklch,var(--os-primary)_70%,var(--os-fg))]">
        <Pin aria-hidden className="size-3" />
        Pinned ({pins.length})
      </p>
      <ul className="flex flex-col">
        {pins.map((pin) => {
          const href = pinHref(pin.id);
          return (
            <li key={pin.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                {pin.title}
              </span>
              <Link
                href={href as Route}
                aria-label={`Read ${pin.title}`}
                onClick={(e) => {
                  onNavigate();
                  if (
                    !desktop ||
                    e.button !== 0 ||
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey
                  ) {
                    return;
                  }
                  e.preventDefault();
                  desktop.open(href);
                }}
                className="flex min-h-11 shrink-0 items-center px-2 font-pixel text-[10px] uppercase text-accent"
              >
                Read
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
