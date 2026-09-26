import type { Sprite } from "../cats/sprites";

// Small pure tools for the camp's 16-bit people and their cats: an outline
// drawn round a filled shape, a mirror, and one sprite laid over another.
// Every character is drawn as fill only and outlined here, so a shorter
// haircut or a different skirt keeps a clean edge without redrawing it.

/** The outline letter: the desktop's cats already colour it (DESK_COLOURS). */
export const OUTLINE = "O";

/**
 * The sprite with a one-pixel outline round everything drawn: each clear
 * pixel that touches a drawn one across an edge (not a corner) becomes `O`.
 * The sprite must leave a clear pixel at its borders for the outline to land
 * on; a pixel off the grid is never drawn.
 */
export function outlined(sprite: Sprite): Sprite {
  const h = sprite.length;
  const w = Math.max(0, ...sprite.map((r) => r.length));
  const at = (x: number, y: number) =>
    y >= 0 && y < h && x >= 0 && x < w ? (sprite[y]![x] ?? ".") : ".";
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      if (ch !== ".") {
        row += ch;
        continue;
      }
      const touches = [
        at(x - 1, y),
        at(x + 1, y),
        at(x, y - 1),
        at(x, y + 1),
      ].some((n) => n !== "." && n !== OUTLINE);
      row += touches ? OUTLINE : ".";
    }
    out.push(row);
  }
  return out;
}

/** The sprite with `n` clear pixels added on every side. */
export function padded(sprite: Sprite, n = 1): Sprite {
  const w = Math.max(0, ...sprite.map((r) => r.length));
  const clear = ".".repeat(w + 2 * n);
  const side = ".".repeat(n);
  return [
    ...Array<string>(n).fill(clear),
    ...sprite.map((r) => side + r.padEnd(w, ".") + side),
    ...Array<string>(n).fill(clear),
  ];
}

/** The sprite facing the other way. */
export function mirrored(sprite: Sprite): Sprite {
  const w = Math.max(0, ...sprite.map((r) => r.length));
  return sprite.map((r) => r.padEnd(w, ".").split("").reverse().join(""));
}

/**
 * `top` laid over `base` with its top-left corner at (dx, dy); clear pixels
 * of `top` let `base` show. The result is `base`'s size: whatever of `top`
 * falls outside is cut off.
 */
export function laidOver(
  base: Sprite,
  top: Sprite,
  dx: number,
  dy: number,
): Sprite {
  return base.map((row, y) => {
    const src = top[y - dy];
    if (!src) return row;
    let out = "";
    for (let x = 0; x < row.length; x++) {
      const ch = src[x - dx];
      out += ch && ch !== "." ? ch : row[x]!;
    }
    return out;
  });
}

/**
 * `top` inlaid in `base` at (dx, dy), both fill only (not yet outlined):
 * `top` covers `base`, and where `top`'s edge meets something of `base` a
 * line (`edge`) is drawn, so a white cat on a white top still reads. Where
 * it meets nothing, nothing is drawn: outline the whole afterwards.
 */
export function inlaid(
  base: Sprite,
  top: Sprite,
  dx: number,
  dy: number,
  edge: string,
): Sprite {
  const drawnAt = (x: number, y: number) => {
    const ch = top[y - dy]?.[x - dx];
    return ch !== undefined && ch !== ".";
  };
  return base.map((row, y) => {
    let out = "";
    for (let x = 0; x < row.length; x++) {
      if (drawnAt(x, y)) {
        out += top[y - dy]![x - dx]!;
        continue;
      }
      const touches =
        drawnAt(x - 1, y) ||
        drawnAt(x + 1, y) ||
        drawnAt(x, y - 1) ||
        drawnAt(x, y + 1);
      out += touches && row[x] !== "." ? edge : row[x]!;
    }
    return out;
  });
}

/** Every letter a sprite uses, clear excepted. */
export function lettersOf(sprites: readonly Sprite[]): Set<string> {
  const used = new Set<string>();
  for (const s of sprites)
    for (const row of s) for (const ch of row) if (ch !== ".") used.add(ch);
  return used;
}
