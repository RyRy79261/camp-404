import type { Sprite } from "../cats/sprites";
import { laidOver, outlined, padded } from "./pixels";

// The cartoon fight cloud: a lumpy ball of dust with swirl marks, little
// stars flying off it, and now a paw, now a foot, now a tail poking out.
// Comic, never violent: nobody is hurt in a dust cloud. Built from a few
// circles per frame, shaded and swirled here, so the four frames are data
// and a small generator rather than 1,000 hand-placed pixels.

/** The dust cloud's own letters: none is a cat's or a person's. */
export const DUST_COLOURS: Readonly<Record<string, string>> = {
  y: "oklch(0.88 0.035 80)", // dust, lit
  z: "oklch(0.76 0.05 75)", // dust
  q: "oklch(0.6 0.055 65)", // dust, shadow and swirl marks
  "*": "var(--os-primary)", // a star
  "+": "var(--os-fg)", // a twinkle
};

/** The cloud frames' size, outline included. */
export const DUST_W = 32;
export const DUST_H = 26;

type Puff = { x: number; y: number; r: number };
type Stamp = { at: [number, number]; sprite: Sprite };

/** A star: magenta, four points. */
const STAR: Sprite = [".*.", "*+*", ".*."];
/** A twinkle: one bright pixel with its glints. */
const TWINKLE: Sprite = ["+.+", ".+.", "+.+"];

// What pokes out of the cloud, in the cats' letters (W white fur, G its
// shade, K black) and the person's (S skin, F feet, H h hair, J bracelet).
const PAW: Sprite = ["WWW", "WGW", "WW."];
const TAIL: Sprite = ["KK..", ".KKK", "..KK", "...K"];
const FOOT: Sprite = ["FF.", "FFF"];
const HAND: Sprite = ["S.S", "SSS", ".J."];
const HAIR: Sprite = ["hH.", ".hH", "..h"];

type DustFrame = { puffs: Puff[]; swirl: number; stamps: Stamp[] };

/** The four frames: forming, two brawling, clearing. */
const FRAMES: readonly DustFrame[] = [
  // The hit: a small burst, one big star.
  {
    puffs: [
      { x: 15, y: 14, r: 6 },
      { x: 10, y: 16, r: 4 },
      { x: 20, y: 16, r: 4 },
    ],
    swirl: 0,
    stamps: [
      { at: [14, 3], sprite: STAR },
      { at: [5, 9], sprite: TWINKLE },
      { at: [24, 8], sprite: TWINKLE },
    ],
  },
  // Brawl: a paw out on the left, her foot out at the bottom right.
  {
    puffs: [
      { x: 15, y: 13, r: 8 },
      { x: 8, y: 16, r: 5 },
      { x: 22, y: 15, r: 6 },
      { x: 12, y: 7, r: 4 },
    ],
    swirl: 1,
    stamps: [
      { at: [1, 11], sprite: PAW },
      { at: [25, 20], sprite: FOOT },
      { at: [22, 2], sprite: STAR },
      { at: [4, 3], sprite: STAR },
      { at: [27, 9], sprite: TWINKLE },
    ],
  },
  // Brawl: his tail whipping out on top, her hand and hair on the right.
  {
    puffs: [
      { x: 16, y: 14, r: 8 },
      { x: 9, y: 13, r: 5 },
      { x: 23, y: 17, r: 5 },
      { x: 19, y: 7, r: 4 },
    ],
    swirl: 2,
    stamps: [
      { at: [9, 1], sprite: TAIL },
      { at: [27, 11], sprite: HAND },
      { at: [3, 19], sprite: HAIR },
      { at: [25, 3], sprite: STAR },
      { at: [2, 6], sprite: TWINKLE },
    ],
  },
  // Clearing: the cloud breaks into puffs, the last stars fly off.
  {
    puffs: [
      { x: 8, y: 17, r: 4 },
      { x: 16, y: 19, r: 5 },
      { x: 24, y: 17, r: 4 },
      { x: 13, y: 11, r: 3 },
      { x: 21, y: 10, r: 3 },
    ],
    swirl: 3,
    stamps: [
      { at: [27, 2], sprite: STAR },
      { at: [1, 4], sprite: TWINKLE },
    ],
  },
];

/**
 * One frame's cloud, fill only: lit on its top-left, shadowed on its
 * bottom-right, and a curl of swirl marks in each big puff (turned a
 * quarter each frame, so the cloud seems to tumble).
 */
function cloudFill(frame: DustFrame, w: number, h: number): Sprite {
  const inside = (x: number, y: number) =>
    frame.puffs.some((p) => (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r ** 2);
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        row += ".";
        continue;
      }
      let ch = "z";
      if (!inside(x - 1, y - 1) || !inside(x, y - 2)) ch = "y";
      else if (!inside(x + 1, y + 1) || !inside(x, y + 2)) ch = "q";
      for (const p of frame.puffs) {
        if (p.r < 5) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        const turn = (frame.swirl * Math.PI) / 2;
        const a =
          (Math.atan2(y - p.y, x - p.x) - turn + 4 * Math.PI) % (2 * Math.PI);
        // An arc a little over half the way round, at half the puff's size.
        if (Math.abs(d - p.r * 0.5) < 0.6 && a < Math.PI * 1.2) ch = "q";
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

function buildFrame(frame: DustFrame): Sprite {
  const w = DUST_W - 2;
  const h = DUST_H - 2;
  let s = cloudFill(frame, w, h);
  for (const st of frame.stamps) s = laidOver(s, st.sprite, st.at[0], st.at[1]);
  return outlined(padded(s));
}

/**
 * The dust cloud's four frames, 32 x 26: the hit, two frames of brawl to
 * alternate, and the cloud clearing. Its palette is DUST_COLOURS over the
 * cats' and the person's (every letter it borrows is theirs).
 */
export const DUST_FRAMES: readonly Sprite[] = FRAMES.map(buildFrame);
