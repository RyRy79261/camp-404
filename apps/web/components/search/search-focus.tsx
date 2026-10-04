"use client";

import { useEffect, useRef } from "react";
import { scrollInWindow } from "@/lib/scroll-in-window";

// Scrolls the row a search result named (marked `data-search-focus`) into
// its window's view once the page arrives (#326, step 2). Looks only inside
// its own window: a background window's last-seen copy may carry an old mark.
// Key it by the id it is for, so a new result scrolls again.

export function SearchFocus() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root: ParentNode =
      ref.current?.closest("[data-window-body]") ?? document;
    // The first one drawn: a page may mark both its wide table row and its
    // narrow card, and one of the two is hidden.
    const el = [
      ...root.querySelectorAll<HTMLElement>('[data-search-focus="true"]'),
    ].find((x) => x.getClientRects().length > 0);
    if (el) scrollInWindow(el);
  }, []);
  return <span ref={ref} hidden />;
}
