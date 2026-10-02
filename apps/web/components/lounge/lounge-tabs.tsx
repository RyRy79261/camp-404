"use client";

import * as React from "react";
import { cn } from "@camp404/ui/lib/utils";

// The lounge's tabs (redesign option A, owner 2026-10-01): Programme and My
// offers for everyone, Offers and Event guide for the people who run the
// lounge. A runner lands on Offers when anything waits on them; a member on
// the Programme (the page picks `initial`). Every panel is rendered by the
// server and stays mounted, so a refresh after Accept keeps the tab, the
// filter and the day where they were. The tab is written to the address
// (?tab=) so a reload or a shared link opens the same one.

export interface LoungeTab {
  value: string;
  label: string;
  /** A count in the main colour: what waits on this viewer there. */
  count?: number;
  panel: React.ReactNode;
}

export function LoungeTabs({
  tabs,
  initial,
}: {
  tabs: readonly LoungeTab[];
  initial: string;
}) {
  const [current, setCurrent] = React.useState(
    tabs.some((t) => t.value === initial) ? initial : (tabs[0]?.value ?? ""),
  );
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const uid = React.useId();

  function pick(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    setCurrent(tab.value);
    refs.current[tabs.indexOf(tab)]?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab.value);
    window.history.replaceState(window.history.state, "", url);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight") pick(index + 1);
    else if (e.key === "ArrowLeft") pick(index - 1);
    else if (e.key === "Home") pick(0);
    else if (e.key === "End") pick(tabs.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        {/* A phone: two tabs side by side, four as two rows of two, so no
            tab hides past the edge. */}
        <div
          role="tablist"
          aria-label="Lounge"
          className="grid grid-cols-2 gap-1 border border-border bg-[color-mix(in_oklab,var(--color-background)_55%,var(--color-card))] p-1 page-sm:inline-flex"
        >
          {tabs.map((tab, i) => {
            const on = tab.value === current;
            return (
              <button
                key={tab.value}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${tab.value}`}
                aria-selected={on}
                aria-controls={`${uid}-panel-${tab.value}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-2 px-3 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring page-sm:flex-none",
                  on
                    ? "bg-card text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    data-testid="tab-count"
                    className="inline-flex h-5 min-w-5 items-center justify-center bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums"
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.value}
          role="tabpanel"
          id={`${uid}-panel-${tab.value}`}
          aria-labelledby={`${uid}-tab-${tab.value}`}
          hidden={tab.value !== current}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
