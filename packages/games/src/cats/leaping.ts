import type { Sprite } from "../inkblot/sprites";

// The camp's four cats mid-leap, for the Survival Guide's link preview (owner,
// 2026-11-15: "all the cats in jumping state flying out from a 16 bit
// explosion"). One pose drawn once as a template and painted four ways, in the
// camp cats' 16-bit style: flat fills, one shade, facing right, front paws
// reaching forward and back legs and tail trailing. The one-pixel outline all
// round is worked out, not drawn (`outlined`), so it never has a gap. Plain
// data, no React, so a server-drawn picture can read it. Easter eggs: never
// name them in the UI or an image's alt text.

export type { Sprite };

// The fills, body (x 0-16) and head (x 17-23) side by side. B coat, S stripe
// or sheen, X the patch on the back, H the cap on the head, T the tail, W the
// chest, muzzle and blaze, F the paws, L an eye, O a pupil, P the nose and the
// inside of an ear.
const BODY = [
  ".................",
  ".TT..............",
  ".TT..............",
  "..TT.............",
  "...TBSBBXXXXBBSBB",
  "...BBBSBXXXXXBBSB",
  "...BBBBBSXXXBBBBB",
  "...BBSBBBBBBBSBBW",
  "...BBBBSBBBBBBWWW",
  ".BBBB.BBB.....WWW",
  "BBB..BBB.......WW",
  "FF..FF..........W",
];
const HEAD = [
  ".......",
  ".H...H.",
  "HPH.HHH",
  "HHHWHHH",
  "BLOWLOB",
  "BBWWWWP",
  "BWWWWW.",
  "WWWW...",
  "WWWW...",
  "WWWWW..",
  "W.WWWW.",
  "F..FFFF",
];
const LEAP_FILL: Sprite = BODY.map((b, i) => b + HEAD[i]!);

type Coat = Readonly<
  Record<"B" | "S" | "X" | "H" | "T" | "W" | "F" | "L" | "P", string>
>;

export type LeapingCat = "jinn" | "moda" | "nipster" | "prince";

// The letters each cat is painted in are the cats' own palettes' (INKBLOT's
// K, D and E for Jinn; the camp cats' A, a, L and P; W and G for white and
// its shade).
const COATS: Readonly<Record<LeapingCat, Coat>> = {
  // All black, a dark sheen, glowing pink eyes.
  jinn: {
    B: "K",
    S: "D",
    X: "K",
    H: "K",
    T: "K",
    W: "K",
    F: "K",
    L: "E",
    P: "D",
  },
  // An orange tabby: darker stripes, white blaze, chest and paws.
  moda: {
    B: "A",
    S: "a",
    X: "A",
    H: "A",
    T: "A",
    W: "W",
    F: "W",
    L: "L",
    P: "P",
  },
  // A tortoiseshell: black with orange mottling and a patch, white blaze and paws.
  nipster: {
    B: "K",
    S: "A",
    X: "A",
    H: "K",
    T: "K",
    W: "W",
    F: "W",
    L: "L",
    P: "P",
  },
  // White, a black cap with a white blaze, a black back patch and a black tail.
  prince: {
    B: "W",
    S: "G",
    X: "K",
    H: "K",
    T: "K",
    W: "W",
    F: "W",
    L: "L",
    P: "P",
  },
};

export const LEAPING_CATS = Object.keys(COATS) as LeapingCat[];

/** Every letter a leaping cat is drawn in, besides "." (see-through). */
export const LEAPING_LETTERS = [
  "O",
  "K",
  "D",
  "E",
  "A",
  "a",
  "W",
  "G",
  "L",
  "P",
] as const;

function paint(t: Sprite, coat: Coat): Sprite {
  return t.map((r) => r.replace(/[BSXHTWFLP]/g, (c) => coat[c as keyof Coat]));
}

/** A sprite turned to face the other way. */
export function mirrorSprite(sprite: Sprite): Sprite {
  return sprite.map((r) => [...r].reverse().join(""));
}

/**
 * A one-pixel outline (O) round every filled pixel that touches the air, on a
 * grid one pixel bigger all round. A pupil (an O inside) stays as it is.
 */
export function outlined(sprite: Sprite): Sprite {
  const w = Math.max(0, ...sprite.map((r) => r.length));
  const padded = [
    ".".repeat(w + 2),
    ...sprite.map((r) => `.${r.padEnd(w, ".")}.`),
    ".".repeat(w + 2),
  ];
  const filled = (x: number, y: number) => {
    const c = padded[y]?.[x] ?? ".";
    return c !== "." && c !== "O";
  };
  return padded.map((row, y) =>
    [...row]
      .map((c, x) =>
        c === "." &&
        (filled(x + 1, y) ||
          filled(x - 1, y) ||
          filled(x, y + 1) ||
          filled(x, y - 1))
          ? "O"
          : c,
      )
      .join(""),
  );
}

/** A cat mid-leap, outlined, facing right or left. */
export function leaping(
  cat: LeapingCat,
  facing: "right" | "left" = "right",
): Sprite {
  const painted = outlined(paint(LEAP_FILL, COATS[cat]));
  return facing === "left" ? mirrorSprite(painted) : painted;
}

export { pixelRuns, type PixelRun } from "./sprites";
