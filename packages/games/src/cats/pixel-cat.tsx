"use client";

import { memo, useMemo, type CSSProperties } from "react";
import { DESK_COLOURS, pixelRuns, spriteWidth, type Sprite } from "./sprites";

export type PixelCatProps = {
  sprite: Sprite;
  className?: string;
  /** Keep it the same object between renders, or the memo cannot help. */
  style?: CSSProperties;
  /**
   * Colours laid over the desktop's (DESK_COLOURS), for a sprite that is not
   * a cat. Keep it the same object between renders, as with `style`.
   */
  palette?: Readonly<Record<string, string>>;
  /**
   * Degrees to turn the drawing, about its middle. Done inside the SVG, so
   * the turned corners are only painted over the edges and never change a
   * scroll container's size (a CSS rotate grows the box).
   */
  rotate?: number;
};

function PixelCatDrawing({
  sprite,
  className,
  style,
  palette,
  rotate,
}: PixelCatProps) {
  const colours = useMemo(
    () => (palette ? { ...DESK_COLOURS, ...palette } : DESK_COLOURS),
    [palette],
  );
  const runs = useMemo(() => pixelRuns(sprite, colours), [sprite, colours]);
  const w = spriteWidth(sprite);
  const h = sprite.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className={className}
      style={rotate ? { ...style, overflow: "visible" } : style}
    >
      <g transform={rotate ? `rotate(${rotate} ${w / 2} ${h / 2})` : undefined}>
        {runs.map((r) => (
          <rect
            key={`${r.x}-${r.y}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={colours[r.ch]}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * A pixel sprite as an SVG, one rectangle per run of like pixels. Memoised:
 * it redraws only when its frame, colours or turn change, not whenever the
 * thing around it does.
 */
export const PixelCat = memo(PixelCatDrawing);
