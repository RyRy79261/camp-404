"use client";

import * as React from "react";

// TableFit: the guard that keeps a ResponsiveDataTable inside its box.
//
// The table's container query (`stackBelow`) picks the layout from the
// table's own width, but a guessed width cannot know how wide a row's
// content is (a long name, a select, three buttons). So this measures: when
// the table is wider than its box, the rows are drawn as cards instead, and
// the table comes back only once the box is as wide as the table needed. A
// row's buttons are never left past the window's edge behind a sideways
// scroll.

export interface FitState {
  /** The rows are drawn as cards because the table did not fit. */
  stacked: boolean;
  /** The box width the table needed when it last did not fit. */
  needed: number | null;
}

export interface FitMeasure {
  /** The width of the whole table's box (the guard's own element). */
  boxWidth: number;
  /** Whether the table layout is on screen (not hidden by CSS). */
  tableVisible: boolean;
  /** How far the table runs past its scroll box, in px (0 when it fits). */
  overflow: number;
}

/**
 * The next layout, from what was measured. Pure, so it is tested directly.
 * A table that overflows by more than a pixel stacks, remembering the width
 * it would have needed; stacked rows come back as a table only when the box
 * reaches that width, so the layout never flips back and forth.
 */
export function nextFit(state: FitState, m: FitMeasure): FitState {
  if (m.tableVisible) {
    if (m.overflow > 1) {
      return { stacked: true, needed: m.boxWidth + m.overflow };
    }
    return state.stacked ? { stacked: false, needed: state.needed } : state;
  }
  if (state.stacked && state.needed !== null && m.boxWidth >= state.needed) {
    return { stacked: false, needed: state.needed };
  }
  return state;
}

const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export function TableFit({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  const state = React.useRef<FitState>({ stacked: false, needed: null });
  const [stacked, setStacked] = React.useState(false);

  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const scroller = root.querySelector<HTMLElement>(
        '[data-rdt-layout="table"] [data-slot="table-container"]',
      );
      const tableVisible = !!scroller && scroller.getClientRects().length > 0;
      const next = nextFit(state.current, {
        boxWidth: root.clientWidth,
        tableVisible,
        overflow: tableVisible
          ? scroller!.scrollWidth - scroller!.clientWidth
          : 0,
      });
      state.current = next;
      setStacked(next.stacked);
    };
    const observer = new ResizeObserver(check);
    observer.observe(root);
    const table = root.querySelector('[data-rdt-layout="table"] table');
    if (table) observer.observe(table);
    check();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-stacked={stacked ? "true" : undefined}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}
