// The 16-bit explosion behind the cats on the guide's link preview: a
// starburst of uneven spikes, white at the heart, then yellow, orange and the
// camp's magenta, with dithered edges between the bands and sparks flung
// round it. Worked out on a grid of letters from a fixed seed, so every build
// draws the same picture. Plain data, no React.

/** W white, Y yellow, R orange, M magenta, m deep magenta; "." is see-through. */
export type BlastLetter = "W" | "Y" | "R" | "M" | "m" | ".";

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

/** The angle between two directions, in radians, 0 to pi. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * The explosion as `size` rows of `size` letters. `spikes` points of uneven
 * length; the body between them is a little over half the longest.
 */
export function explosion(size: number, spikes = 11, seed = 404): string[] {
  const rand = seeded(seed);
  const turn = (2 * Math.PI) / spikes;
  const points = Array.from({ length: spikes }, (_, i) => ({
    angle: i * turn + (rand() - 0.5) * turn * 0.5,
    reach: 0.72 + rand() * 0.28,
  }));
  const max = size / 2 - 1;
  const centre = (size - 1) / 2;

  /** How far the burst reaches in this direction, in cells. */
  const edge = (theta: number): number => {
    let r = 0.56;
    for (const p of points) {
      const t = 1 - apart(theta, p.angle) / (turn * 0.7);
      if (t > 0) r = Math.max(r, 0.56 + (p.reach - 0.56) * t ** 1.4);
    }
    return r * max;
  };

  const grid: BlastLetter[][] = Array.from({ length: size }, () =>
    Array<BlastLetter>(size).fill("."),
  );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre;
      const dy = y - centre;
      const ratio = Math.hypot(dx, dy) / edge(Math.atan2(dy, dx));
      // A checkerboard nudge at each band's edge: the 16-bit dither.
      const r = ratio + ((x + y) % 2 === 0 ? 0.035 : -0.035);
      grid[y]![x] =
        r > 1
          ? "."
          : r > 0.88
            ? "m"
            : r > 0.66
              ? "M"
              : r > 0.44
                ? "R"
                : r > 0.24
                  ? "Y"
                  : "W";
    }
  }

  // Sparks: single cells and small crosses just outside the burst.
  for (let i = 0; i < spikes * 3; i++) {
    const theta = rand() * 2 * Math.PI;
    const dist = edge(theta) * (1.08 + rand() * 0.34);
    const sx = Math.round(centre + Math.cos(theta) * dist);
    const sy = Math.round(centre + Math.sin(theta) * dist);
    const colour: BlastLetter = (["W", "Y", "M"] as const)[i % 3]!;
    const cells =
      i % 4 === 0
        ? [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
        : [[0, 0]];
    for (const [cx, cy] of cells) {
      const row = grid[sy + cy!];
      if (row && row[sx + cx!] === ".") row[sx + cx!] = colour;
    }
  }
  return grid.map((row) => row.join(""));
}
