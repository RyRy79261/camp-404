"use client";

import * as React from "react";
import { cn } from "@camp404/ui/lib/utils";
import { scrollInWindow } from "@/lib/scroll-in-window";

// About's "On this page" list (approved redesign, 2026-10-01): a click
// scrolls the window to the card, and the card in view is marked. The mark
// follows an IntersectionObserver (an event, not a loop), so nothing runs
// while the page sits still. In a wide window it is the left column; in a
// narrow one, a row of links over the cards.

export type TocItem = { id: string; label: string };

export function AboutToc({
  items,
  variant,
}: {
  items: readonly TocItem[];
  variant: "column" | "row";
}) {
  const [current, setCurrent] = React.useState(items[0]?.id ?? "");

  React.useEffect(() => {
    if (variant !== "column" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const cards = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    const root = cards[0]?.closest<HTMLElement>("[data-window-body]") ?? null;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setCurrent(first.id);
      },
      { root, rootMargin: "0px 0px -60% 0px" },
    );
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [items, variant]);

  const go = (id: string) => {
    setCurrent(id);
    scrollInWindow(document.getElementById(id));
  };

  if (variant === "row") {
    return (
      <nav
        aria-label="On this page"
        className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 @min-[60rem]/page:hidden"
      >
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => go(i.id)}
            className="shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium"
          >
            {i.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="On this page"
      className="sticky top-6 hidden flex-col @min-[60rem]/page:flex"
    >
      <p className="pb-2 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        On this page
      </p>
      {items.map((i) => {
        const on = i.id === current;
        return (
          <button
            key={i.id}
            type="button"
            aria-current={on ? "location" : undefined}
            onClick={() => go(i.id)}
            className={cn(
              "border-l py-1.5 pl-3 text-left text-[13px] leading-5 text-muted-foreground hover:text-foreground",
              on
                ? "border-l-2 border-accent pl-[11px] text-foreground"
                : "border-border",
            )}
          >
            {i.label}
          </button>
        );
      })}
    </nav>
  );
}
