"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "./reduced-motion";

/** Pointer travel between two prints, in CSS pixels. */
export const PAW_STRIDE = 34;
/** Prints on screen at once, at most. */
export const PAW_MAX = 15;
/** How long a print lasts (the cat-paw fade is 1.1 s). */
export const PAW_MS = 1200;

export type Paw = {
  id: number;
  x: number;
  y: number;
  /** Degrees, pointing the way the pointer went. */
  angle: number;
  /** -1 left foot, 1 right foot. */
  side: 1 | -1;
};

/**
 * Where the next print goes, if the pointer has gone a stride since the
 * last one: a print at the pointer, turned the way it went, on alternate
 * feet. Null when it has not gone far enough.
 */
export function nextPaw(
  last: { x: number; y: number },
  x: number,
  y: number,
  id: number,
): Paw | null {
  const dx = x - last.x;
  const dy = y - last.y;
  if (Math.hypot(dx, dy) < PAW_STRIDE) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return { id, x, y, angle, side: id % 2 ? 1 : -1 };
}

function PawPrint({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className={className}
      style={style}
      fill="currentColor"
    >
      <rect x="0" y="1" width="1" height="2" />
      <rect x="2" y="0" width="1" height="2" />
      <rect x="4" y="0" width="1" height="2" />
      <rect x="6" y="1" width="1" height="2" />
      <rect x="1" y="3" width="5" height="3" />
      <rect x="2" y="6" width="3" height="1" />
    </svg>
  );
}

export type PawTrailProps = {
  /** Whether the trail follows the pointer ("meow" toggles it). */
  on: boolean;
};

/**
 * Little magenta paw prints behind the pointer that fade away. A layer over
 * the whole screen that never takes a click; nothing at all under reduced
 * motion or while off. Only a new print (every 34px of travel) re-renders.
 */
export function PawTrail({ on }: PawTrailProps) {
  const reduced = useReducedMotion();
  const [paws, setPaws] = useState<Paw[]>([]);

  const nextId = useRef(0);
  useEffect(() => {
    if (!on || reduced) return;
    let last: { x: number; y: number } | null = null;
    const timers = new Set<number>();
    function move(e: PointerEvent) {
      if (!last) {
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      const paw = nextPaw(last, e.clientX, e.clientY, nextId.current);
      if (!paw) return;
      nextId.current++;
      last = { x: paw.x, y: paw.y };
      setPaws((ps) => [...ps.slice(-(PAW_MAX - 1)), paw]);
      const t = window.setTimeout(() => {
        timers.delete(t);
        setPaws((ps) => ps.filter((p) => p.id !== paw.id));
      }, PAW_MS);
      timers.add(t);
    }
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      timers.forEach((t) => window.clearTimeout(t));
      setPaws([]);
    };
  }, [on, reduced]);

  if (!on || reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[120]">
      {paws.map((p) => (
        <PawPrint
          key={p.id}
          className="cat-paw absolute size-3 text-os-primary"
          style={{
            left: p.x - 6,
            top: p.y - 6,
            transform: `rotate(${p.angle}deg) translateX(${p.side * 6}px)`,
          }}
        />
      ))}
    </div>
  );
}
