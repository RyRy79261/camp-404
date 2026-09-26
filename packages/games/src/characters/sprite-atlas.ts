import { spriteWidth, type Sprite } from "../cats/sprites";

// Every frame of a scene drawn once, side by side, into one picture: the
// scene then shows a frame by moving that picture behind a box
// (background-position), so a frame change is two style writes and never a
// redraw. Packing is pure and tested; drawing needs a canvas.

export type AtlasCell = { x: number; y: number; w: number; h: number };

export type AtlasLayout = {
  width: number;
  height: number;
  cells: ReadonlyMap<Sprite, AtlasCell>;
};

/**
 * The sprites in one row, left to right, `gap` clear pixels between them so
 * a scaled frame never shows a sliver of its neighbour. A sprite listed twice
 * (the same object) gets one cell.
 */
export function packAtlas(sprites: readonly Sprite[], gap = 1): AtlasLayout {
  const cells = new Map<Sprite, AtlasCell>();
  let x = 0;
  let height = 0;
  for (const s of sprites) {
    if (cells.has(s)) continue;
    const w = spriteWidth(s);
    const h = s.length;
    cells.set(s, { x, y: 0, w, h });
    x += w + gap;
    height = Math.max(height, h);
  }
  return { width: Math.max(0, x - gap), height, cells };
}

/**
 * The palette with each CSS-variable colour (`var(--os-fg)`, a `color-mix`
 * of them) resolved to what `host` computes, so a canvas can paint it. A
 * colour the browser cannot resolve is left as it was.
 */
export function resolveColours(
  palette: Readonly<Record<string, string>>,
  host: Element,
): Record<string, string> {
  const out: Record<string, string> = { ...palette };
  const needs = Object.entries(palette).filter(([, c]) =>
    /var\(|color-mix\(/.test(c),
  );
  if (needs.length === 0 || typeof getComputedStyle !== "function") return out;
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  try {
    for (const [ch, colour] of needs) {
      probe.style.color = "";
      probe.style.color = colour;
      const computed = getComputedStyle(probe).color;
      if (computed) out[ch] = computed;
    }
  } finally {
    probe.remove();
  }
  return out;
}

/**
 * The atlas as a PNG data URL, or null where there is no canvas (the server,
 * a test's jsdom): the caller draws its still picture another way.
 */
export function drawAtlas(
  layout: AtlasLayout,
  palette: Readonly<Record<string, string>>,
): string | null {
  if (typeof document === "undefined" || layout.width === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  for (const [sprite, cell] of layout.cells) {
    sprite.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const fill = palette[row[x]!];
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(cell.x + x, cell.y + y, 1, 1);
      }
    });
  }
  return canvas.toDataURL();
}
