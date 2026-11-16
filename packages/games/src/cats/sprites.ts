import { CAT_FRAMES } from "../inkblot/cat";
import { COLOURS, type Sprite } from "../inkblot/sprites";

// The camp's two cats, and only these two (owner, 2026-09-25): Jinn, all
// black, who is best; and Prince, white and fluffy with a black cap, a black
// patch on his back and a big black tail. Jinn is INKBLOT's cat, cut from the
// game's own frames; Prince is drawn from the owner's photo. Plain data, no
// React, so a test or a server-drawn picture can read it.

export type { Sprite };

/** Jinn's every pose, as INKBLOT.EXE draws him (17 x 16, facing right). */
export const JINN_FRAMES = CAT_FRAMES;

/**
 * The cats' colours on the desktop: INKBLOT's, except that the near-black
 * outline is lifted to the OS's muted tone so a black cat reads on a dark
 * desktop, and Prince's white fur wears the OS's own text colour.
 */
export const DESK_COLOURS: Readonly<Record<string, string>> = {
  ...COLOURS,
  O: "var(--os-muted)",
  W: "var(--os-fg)",
  G: "color-mix(in oklch, var(--os-fg) 70%, var(--os-bg))",
};

/** Jinn's head and shoulders, cut from the idle frame, for peeking. */
export const JINN_HEAD: Sprite = CAT_FRAMES.idle[0]!.slice(4, 13).map((r) =>
  r.slice(6, 16),
);

/** Jinn sitting, from the game's idle frame, cropped to the cat. */
export const JINN_SITTING: Sprite = CAT_FRAMES.idle[0]!.slice(4).map((r) =>
  r.slice(3, 16),
);

/** Jinn curled up asleep, head on the right like the game's cat. */
export const JINN_SLEEPING: Sprite = [
  "...........O...O.",
  "..........ODO.ODO",
  ".....OOOOOODKKKDO",
  "....ODDKKKKKKKKKO",
  "...ODKKKKKKKDDKKO",
  "..ODKKKKKKKKKKKKO",
  "..ODKKKKKKKKKKKO.",
  ".ODDKKKKKKKKKKDO.",
  "ODDOOOOOOOOOOODO.",
  "ODDDDDDDDDDDDDO..",
  ".OOOOOOOOOOOOO...",
];

/**
 * Prince (owner's photo, 2026-09-25), 21 x 12: white and fluffy, a black cap
 * over both ears with a white blaze down the middle, a black patch on his
 * back and a big black tail. Curled up asleep, head on the right, tail
 * wrapped round the front.
 */
export const PRINCE_SLEEPING: Sprite = [
  "..............O...O..",
  ".............OKO.OKO.",
  ".............OKKDKKKO",
  "......OOOOOOOKKWWWKKO",
  ".....OWWWDKKKOWWWWWWO",
  "....OWWWKKKKKKWOOWWWO",
  "...OWWWWWKKKKWWWWWWO.",
  "...OWWWWWWWWWWWWWWGO.",
  "..OGWWWWWWWWWWWWWGO..",
  ".ODDKKKKKKKKKKKDDO...",
  "ODKKDKKKKDKKKKKDO....",
  ".OOOOOOOOOOOOOOO.....",
];

/** A sprite's width: its longest row. */
export function spriteWidth(sprite: Sprite): number {
  return Math.max(0, ...sprite.map((r) => r.length));
}

/** One run of same-coloured pixels on a row, drawn as a single square. */
export type PixelRun = { x: number; y: number; w: number; ch: string };

/**
 * The sprite as runs: each row's neighbouring pixels of one colour merged
 * into one rectangle, so the Prince sprite is about 60 shapes, not 180.
 * Letters with no colour in `palette` are skipped, as "." is.
 */
export function pixelRuns(
  sprite: Sprite,
  palette: Readonly<Record<string, string>>,
): PixelRun[] {
  const runs: PixelRun[] = [];
  sprite.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== "." && palette[ch]) runs.push({ x, y, w: end - x, ch });
      x = end;
    }
  });
  return runs;
}
