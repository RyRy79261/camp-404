import type { Sprite } from "../cats/sprites";
import { CELL_H, CELL_W } from "./art";

// Each cat's every frame drawn ONCE, side by side, into one picture (a PNG
// data URL). A pose is shown by sliding that picture inside a cat-sized box
// (a transform), so walking, scratching and eating change no DOM and cost
// React nothing: the compositor steps the frames.

/** Where each pose's frames start in the strip, and how many there are. */
export type AtlasLayout<P extends string> = Record<
  P,
  { start: number; count: number }
>;

/** The strip's order: the poses as listed, their frames in turn. */
export function atlasLayout<P extends string>(
  frames: Readonly<Record<P, readonly Sprite[]>>,
): { layout: AtlasLayout<P>; total: number } {
  const layout = {} as AtlasLayout<P>;
  let at = 0;
  for (const pose of Object.keys(frames) as P[]) {
    const count = frames[pose].length;
    layout[pose] = { start: at, count };
    at += count;
  }
  return { layout, total: at };
}

/**
 * A colour a canvas can use. The cats' outline and white are the OS's CSS
 * variables, which a canvas cannot read: they are looked up on `where` (an
 * element inside the desktop, where the variables are set).
 */
export function resolveColour(value: string, where: Element | null): string {
  if (!value.includes("var(") || !where) return value;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  where.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour || value;
}

const drawn = new Map<object, string | null>();

/**
 * The frames as one strip picture, drawn the first time and kept for the
 * page. Null without a canvas (a test's jsdom): the caller draws the frame
 * as squares instead.
 */
export function atlasUrl<P extends string>(
  frames: Readonly<Record<P, readonly Sprite[]>>,
  palette: Readonly<Record<string, string>>,
  where: Element | null,
): string | null {
  if (drawn.has(frames)) return drawn.get(frames)!;
  let url: string | null = null;
  if (typeof document !== "undefined") {
    const { layout, total } = atlasLayout(frames);
    const canvas = document.createElement("canvas");
    canvas.width = total * CELL_W;
    canvas.height = CELL_H;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const colours = new Map<string, string>();
      const colourOf = (ch: string) => {
        if (!colours.has(ch)) {
          const v = palette[ch];
          colours.set(ch, v ? resolveColour(v, where) : "");
        }
        return colours.get(ch)!;
      };
      for (const pose of Object.keys(frames) as P[]) {
        frames[pose].forEach((sprite, i) => {
          const ox = (layout[pose].start + i) * CELL_W;
          sprite.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
              const fill = colourOf(row[x]!);
              if (!fill) continue;
              ctx.fillStyle = fill;
              ctx.fillRect(ox + x, y, 1, 1);
            }
          });
        });
      }
      url = canvas.toDataURL();
    }
  }
  drawn.set(frames, url);
  return url;
}

/** Forgets every drawn strip. For tests. */
export function forgetAtlases(): void {
  drawn.clear();
}
