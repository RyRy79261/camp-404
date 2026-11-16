// The campfire on the guide's link preview, as plain pixel data: the fire on
// its logs in a ring of stones, the warm light it throws on the ground and the
// stars over the Tankwa. All fixed, so every build draws the same picture.

/**
 * The fire, 16 x 18, one letter a pixel ("." is see-through): W white heat,
 * Y yellow, R orange, M the camp's magenta at the tips, B and b the logs, S
 * the stones.
 */
export const FIRE: readonly string[] = [
  ".......M........",
  "......MM....M...",
  "......MRM...MM..",
  ".....MRRM..MRM..",
  "..M..MRRRM.MRM..",
  "..MM.MRYRRMMRRM.",
  "..MRMRRYYRRMRRM.",
  "..MRRRYYYRRRRM..",
  "...MRRYYWYRRRM..",
  "...MRYYWWYYRRM..",
  "..MRRYWWWWYRRRM.",
  "..MRYYWWWWYYRM..",
  "...MRYWWWWYRM...",
  "....MRYYYYRM....",
  "..bBBMRRRRMBBb..",
  ".bBBBBbMMbBBBBb.",
  "SSbbBBBBBBBBbbSS",
  ".SSSSSSSSSSSSSS.",
];

/**
 * The firelight on the ground: an ellipse `w` x `h` cells, brightest (L) at
 * the middle, then l, then g at the rim, each band's edge dithered on a
 * checkerboard as a 16-bit palette would.
 */
export function glow(w: number, h: number): string[] {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
      const r = d + ((x + y) % 2 === 0 ? 0.04 : -0.04);
      row += r > 1 ? "." : r > 0.7 ? "g" : r > 0.4 ? "l" : "L";
    }
    rows.push(row);
  }
  return rows;
}

/** A small fixed-seed random number source (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` stars, each a cell on a `w` x `h` grid; every fifth one bright. */
export function stars(
  w: number,
  h: number,
  count: number,
  seed = 404,
): { x: number; y: number; bright: boolean }[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor(rand() * w),
    y: Math.floor(rand() * h),
    bright: i % 5 === 0,
  }));
}
