import type { Sprite } from "../cats/sprites";
import { outlined, padded } from "./pixels";

/** A fill drawing, given room for its outline and outlined. */
const drawn = (fill: Sprite): Sprite => outlined(padded(fill));

// Prince on the move, for the reunion (prince-reunion.md), in the clock
// sprite's colours and letters (DESK_COLOURS: W white fur, G its shadow,
// K black, D black's sheen, E an eye): white and fluffy, a black cap over
// both ears with a white blaze down the middle, a black patch on his back
// and a big black fluffy tail. Drawn as fill and outlined here, at the scale
// of the camp's people (a 16 x 24 person), so he is smaller than the big
// sleeping Prince on the clock. Facing right: he runs in from the left.

const RUN_FILL: readonly Sprite[] = [
  // Stretched out: front paws reaching, hind legs pushing off, tail up.
  [
    "KK.............K..K.",
    "KKKK..........KKWWKK",
    ".KKKKWWKKKKKWWKWWWWK",
    "..KKKWWWKKKKWWWDWWDW",
    "....WWWWWWWWWWWWWWGW",
    "....WWWWWWWWWWWWWGG.",
    "....GWWWWWWWWWWGG...",
    "...WWG........WWW...",
    "..WW............WW..",
    ".WW..............WW.",
  ],
  // Gathered: all four paws under him, tail streaming flat.
  [
    "....................",
    "...............K..K.",
    "KK............KKWWKK",
    "KKKKKWWKKKKKWWKWWWWK",
    ".KKKKWWWKKKKWWWDWWDW",
    "....WWWWWWWWWWWWWWGW",
    "....WWWWWWWWWWWWWGG.",
    "....GWWWWWWWWWWGG...",
    "......WW.WW.WW......",
    ".....WW..W...WW.....",
  ],
  // Pushing off: hind legs out behind, front paws tucked, tail up.
  [
    ".KK............K..K.",
    "KKKK..........KKWWKK",
    "KKKKKWWKKKKKWWKWWWWK",
    "..KKKWWWKKKKWWWDWWDW",
    "....WWWWWWWWWWWWWWGW",
    "....WWWWWWWWWWWWWGG.",
    "...GGWWWWWWWWWWGG...",
    "..WWG.........WW....",
    ".WW...........W.....",
    "WW..................",
  ],
  // Landing: front paws down, hind paws coming through, tail waving.
  [
    "....................",
    "KK.............K..K.",
    "KKK...........KKWWKK",
    ".KKKKWWKKKKKWWKWWWWK",
    "..KKKWWWKKKKWWWDWWDW",
    "....WWWWWWWWWWWWWWGW",
    "....WWWWWWWWWWWWWGG.",
    "....GWWWWWWWWWWGG...",
    ".....WW.......WW....",
    "......WW......WW....",
  ],
];

/** Prince running, 20 x 11, four frames, facing right. */
export const PRINCE_RUN: readonly Sprite[] = RUN_FILL.map(drawn);

/** Prince in mid-air, flying at her: paws out in front, tail streaming. */
export const PRINCE_LEAP: Sprite = drawn([
  "...............K..K.....",
  "..............KKWWKK....",
  "KKK....KKKK...KWWWWK....",
  "KKKKKWWKKKKKWWKWWWWKWWW.",
  ".KKKKWWWKKKKWWWDWWDWWGW.",
  "....WWWWWWWWWWWWWWGW....",
  "..GWWWWWWWWWWWWWGG......",
  "WWG.....................",
]);

/**
 * Prince curled up on a lap, 12 x 6, fill only: head on the right, eyes
 * shut, his big black tail wrapped round the front. `withLapCat` (human.ts)
 * lays him on a sitting person and outlines them together.
 */
export const PRINCE_LAP: Sprite = [
  ".......K...K",
  "..WKKW.KKWKK",
  ".WWKKWWKWWWK",
  "WWWWWWWWDWDW",
  "KWWWWWWWWWGW",
  "KKKKKKKKKK..",
];

/** The same, his tail tip flicked up: when she is tapped. */
export const PRINCE_LAP_FLICK: Sprite = [
  "K......K...K",
  "K.WKKW.KKWKK",
  "KWWKKWWKWWWK",
  "KWWWWWWWDWDW",
  "WWWWWWWWWWGW",
  ".KKKKKKKKK..",
];
