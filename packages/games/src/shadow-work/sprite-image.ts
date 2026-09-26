"use client";

import { useSyncExternalStore } from "react";
import { spriteWidth, type Sprite } from "../cats/sprites";

// A big sprite drawn once to a picture, then shown (and turned) as an image:
// Shadow Work's ball is about 1,300 pixels, far too many to redraw as squares
// on every frame while it rolls. Each sprite is drawn once per page, however
// many strips show it.

const drawn = new Map<Sprite, string | null>();

/**
 * The sprite as a PNG data URL, drawn on a canvas the first time and kept.
 * Null where there is no canvas to draw on (the server, a test's jsdom): the
 * caller draws squares instead. A sprite is always drawn in the palette it
 * was first asked for.
 */
export function spriteDataUrl(
  sprite: Sprite,
  palette: Readonly<Record<string, string>>,
): string | null {
  if (drawn.has(sprite)) return drawn.get(sprite)!;
  let url: string | null = null;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = spriteWidth(sprite);
    canvas.height = sprite.length;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      sprite.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const fill = palette[row[x]!];
          if (!fill) continue;
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, 1, 1);
        }
      });
      url = canvas.toDataURL();
    }
  }
  drawn.set(sprite, url);
  return url;
}

/** Forgets every drawn sprite. For tests. */
export function forgetDrawnSprites(): void {
  drawn.clear();
}

const noop = () => () => {};

/**
 * The sprite's picture. Null on the server and while hydrating, so the
 * server's squares and the first client render agree; straight away on a
 * later mount.
 */
export function useSpriteUrl(
  sprite: Sprite,
  palette: Readonly<Record<string, string>>,
): string | null {
  return useSyncExternalStore(
    noop,
    () => spriteDataUrl(sprite, palette),
    () => null,
  );
}
