import type { ItemKind } from "@/lib/inkblot";

// INKBLOT.EXE's 16-bit art. Each sprite is a grid of palette letters, one per
// screen pixel; "." is see-through. One screen pixel is PX world units.

export const PX = 2;

/**
 * The game's colours: shades of the site's own hues (the landing's violet
 * 295, magenta 340, blue 255), stepped like a 16-bit console's ramps.
 */
export const COLOURS = {
  // The black cat: coat, sheen, outline and a glowing eye.
  K: "oklch(0.13 0.02 295)",
  D: "oklch(0.3 0.06 295)",
  O: "oklch(0.05 0.01 295)",
  E: "oklch(0.75 0.24 340)",
  // Room.
  // A lighter wall than the site's background, so the black cat reads.
  wall: "oklch(0.32 0.08 295)",
  wallDot: "oklch(0.37 0.09 295)",
  skirting: "oklch(0.32 0.14 340)",
  floor: "oklch(0.24 0.07 300)",
  floorLine: "oklch(0.18 0.06 300)",
  floorEdge: "oklch(0.65 0.27 340)",
  frame: "oklch(0.55 0.05 325)",
  // Furniture: a blue ramp, a pink ramp, and a pale one for the fridge.
  outline: "oklch(0.13 0.05 280)",
  blueDark: "oklch(0.34 0.12 255)",
  blue: "oklch(0.48 0.16 255)",
  blueLight: "oklch(0.64 0.15 255)",
  pinkDark: "oklch(0.38 0.17 340)",
  pink: "oklch(0.52 0.22 340)",
  pinkLight: "oklch(0.68 0.2 340)",
  paleDark: "oklch(0.62 0.04 300)",
  pale: "oklch(0.8 0.03 300)",
  paleLight: "oklch(0.92 0.02 300)",
  // Things to knock off.
  W: "oklch(0.95 0.02 330)",
  M: "oklch(0.65 0.27 340)",
  m: "oklch(0.45 0.2 340)",
  B: "oklch(0.62 0.18 255)",
  b: "oklch(0.42 0.14 255)",
  G: "oklch(0.7 0.14 200)",
  g: "oklch(0.5 0.12 200)",
  S: "oklch(0.55 0.04 325)",
  Y: "oklch(0.9 0.1 90)",
} as const;

export type Sprite = readonly string[];

export const ITEMS: Record<ItemKind, Sprite> = {
  mug: ["WWWW..", "WMMWWW", "WMMW.W", "WMMWWW", "WmmW..", ".WW..."],
  glass: [
    "W...W",
    "W...W",
    "WBBBW",
    "WBBBW",
    "WbBBW",
    ".WBW.",
    "..W..",
    ".WWW.",
  ],
  vase: [
    "..mmm..",
    "...m...",
    "..mMm..",
    ".mMMMm.",
    "mMMWMMm",
    "mMWMWMm",
    "mMMWMMm",
    "mMMMMMm",
    "mMMMMMm",
    ".mMMMm.",
    ".mmmmm.",
    "..mmm..",
  ],
  plant: [
    "...G....",
    ".G.G.G..",
    ".GgGG.G.",
    "G.GGgGG.",
    ".GGgGG..",
    "...g....",
    "mmmmmmm.",
    ".mMMMm..",
    ".mMMMm..",
    ".mMMMm..",
    "..mmm...",
  ],
  lamp: [
    "..WWWW..",
    ".WWWWWW.",
    ".WYYYYW.",
    "WYYYYYYW",
    "WWWWWWWW",
    "...SS...",
    "...SS...",
    "...SS...",
    "...SS...",
    "...SS...",
    "...SS...",
    "...SS...",
    "..SSSS..",
    ".SSSSSS.",
  ],
  book: ["BBBBBBBBB", "BWWWWWWWB", "BBBBBBBBB", "bbbbbbbbb"],
  candle: [".M.", ".Y.", ".K.", "WWW", "WWW", "WWW", "WWW", "WWW"],
};

/** A sprite turned a quarter, as a thing lies once it has fallen. */
export function lyingDown(sprite: Sprite): Sprite {
  const w = Math.max(...sprite.map((r) => r.length));
  const rows: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = "";
    for (let y = sprite.length - 1; y >= 0; y--) row += sprite[y]![x] ?? ".";
    rows.push(row);
  }
  return rows;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  flip = false,
  colours: Record<string, string> = COLOURS,
) {
  const w = Math.max(...sprite.map((r) => r.length));
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row]!;
    for (let col = 0; col < line.length; col++) {
      const c = line[col]!;
      if (c === ".") continue;
      const colour = colours[c];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x + (flip ? w - 1 - col : col), y + row, 1, 1);
    }
  }
}
