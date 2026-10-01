"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// A print is A4 paper, never a phone layout (owner, 2026-10-01). On screen the
// sheet keeps its A4 width and is scaled down to fit a narrow window, as a PDF
// viewer shows a page; on paper the scale is dropped (print:[zoom:1]) and the
// page's own margins apply. CSS zoom, not a transform, so the scaled sheet
// takes up only its scaled height. It is measured once and again only when
// the window is resized: no loop.

/** One millimetre in CSS pixels. */
const MM = 96 / 25.4;

export function PaperFit({
  widthMm,
  children,
}: {
  /** The paper's width: 210 for A4 portrait, 297 for landscape. */
  widthMm: number;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => {
      const room = el.clientWidth;
      setZoom(room > 0 ? Math.min(1, room / (widthMm * MM)) : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [widthMm]);

  return (
    <div ref={outer} className="w-full print:w-auto">
      <div
        className="mx-auto w-fit [zoom:var(--paper-zoom)] print:w-auto print:[zoom:1]"
        style={{ "--paper-zoom": zoom } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
