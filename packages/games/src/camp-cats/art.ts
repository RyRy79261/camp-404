import { DESK_COLOURS, type Sprite } from "../cats/sprites";

// Moda and Nipster, two more real camp cats (owner, 2026-09-26), drawn from
// the owner's photos in the cats' 16-bit style: one pixel of the OS's muted
// outline (O) all round, flat fills, one shade. Moda is an orange tabby with
// darker stripes, a white blaze, chin and chest, a pink nose and her tongue
// out (she is silly, and cross-eyed when she sits). Nipster is a tortoiseshell:
// black with orange mottling, a white blaze, chin, chest and paws; she is
// sassy (nose in the air, eyes shut). Every frame is CELL_W x CELL_H, facing
// right, feet on the bottom row, so a strip of them is one picture (atlas.ts).
// Plain data, no React. Easter eggs: never name them in the UI.

export type { Sprite };

/** Every cat frame's size, in sprite pixels. */
export const CELL_W = 20;
export const CELL_H = 17;

/** The bowls' size, in sprite pixels. */
export const BOWL_W = 14;
export const BOWL_H = 7;

/**
 * The two cats' colours: the desktop cats' (DESK_COLOURS: the lifted
 * outline, white as the OS's text colour, Jinn's black and sheen), and
 * Moda's orange ramp, a pink nose, green eyes and kibble.
 */
export const CAMP_CATS_COLOURS: Readonly<Record<string, string>> = {
  ...DESK_COLOURS,
  // Orange coat, and its darker stripe (also Nipster's mottling).
  A: "oklch(0.72 0.15 58)",
  a: "oklch(0.56 0.14 45)",
  // Nose, tongue and the inside of an ear.
  P: "oklch(0.78 0.11 5)",
  // Eyes: the photos' green-yellow.
  L: "oklch(0.84 0.15 115)",
  // Kibble, dark and light.
  k: "oklch(0.5 0.09 55)",
  n: "oklch(0.68 0.11 70)",
};

// The poses both cats share are drawn once as templates: B is the coat, S a
// stripe (Moda's) or sheen (Nipster's), X a patch (orange on Nipster, plain
// coat on Moda) and Q the tongue (only Moda's shows).
function paint(t: Sprite, map: Readonly<Record<string, string>>): Sprite {
  return t.map((r) => r.replace(/[BSXQ]/g, (c) => map[c] ?? c));
}
const MODA_COAT = { B: "A", S: "a", X: "A", Q: "P" } as const;
const NIPSTER_COAT = { B: "K", S: "D", X: "A", Q: "W" } as const;

const WALK_TOP = [
  "....................",
  "....................",
  "....................",
  ".............O...O..",
  "............OPO.OXO.",
  "............OBBOBXBO",
  ".OO.........OXSBSXXO",
  "OXO.........OXLOWLOO",
  "OBO.........OXBWWWPO",
  "OSO.........OBBWWQO.",
  "OXO..OOOOOOOOBWWWO..",
  ".OBOOBSXXSBBSBWWO...",
  "..OBXXSBBSBXXSWWO...",
  "..OBBBXBBBBXXBBBO...",
];

/** The legs of the four-step walk: near legs B, far legs S. */
const WALK_LEGS = [
  ["..OBOSOOOOOOOSOBO...", ".OBO.OSO...OSO..OBO.", ".OOO.OOO...OOO..OOO."],
  ["..OBOSOOOOOOOSOBO...", "..OBOSO.....OSOBO...", "..OOOOO.....OOOOO..."],
  ["..OSOBOOOOOOOBOSO...", ".OSO.OBO...OBO..OSO.", ".OOO.OOO...OOO..OOO."],
  ["..OSOBOOOOOOOBOSO...", "..OSOBO.....OBOSO...", "..OOOOO.....OOOOO..."],
];
const WALK_T: Sprite[] = WALK_LEGS.map((legs) => [...WALK_TOP, ...legs]);

const EAT_TOP = [
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  ".OO.................",
  "OBO.................",
  "OSO..OOOOOOOOO.O..O.",
  ".OBOOBSXBSBBBOOPOOBO",
  "..OBXXSBBSXXBOBBBBBO",
  "..OBBXXBBBBBBOXSWSXO",
];
/** Head down in the bowl: eyes open, then shut as she chews. */
const EAT_T: Sprite[] = [
  [
    ...EAT_TOP,
    "..OBBBBBXXBBOBLOWLOO",
    "..OBOBOOOOOBOOBBWWPO",
    "..OBOBO...OBOBOWWQO.",
    "..OOOOO...OOOOOOOO..",
  ],
  [
    ...EAT_TOP,
    "..OBBBBBXXBBOBOOWOOO",
    "..OBOBOOOOOBOOBBWWPO",
    "..OBOBO...OBOBOWQWO.",
    "..OOOOO...OOOOOOOO..",
  ],
];

/** A loaf, paws tucked, as Nipster lies in the photo: the pose on an icon. */
const PERCH_T: Sprite = [
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  ".............O...O..",
  "............OPO.OBO.",
  "............OBBOBBBO",
  "....OOOOOOOOOXSWSBBO",
  "...OBXXBSBBOOLOWLOXO",
  "..OBXXSBBSXXOXBWPWBO",
  ".OBSBBBXXBBBBOWWQWO.",
  ".OXXBBBXBBSBBOWWWWO.",
  ".OBXBBBBBBXXOWWOWWO.",
  "..OOOOOOOOOOOOOOOO..",
];

/** Moda sitting, cross-eyed, tongue out. */
const MODA_SIT: Sprite = [
  "....................",
  "....................",
  ".....O.....O........",
  "....OPO...OPO.......",
  "....OPAOOOAPO.......",
  "...OAAaAWAaAAO......",
  "...OAaAAWAAaAO......",
  "...OALOAWAOLAO......",
  "...OAAAWPWAAAO......",
  "....OAWWPWWAO.......",
  ".....OWWWWWO........",
  "....OAAWWWAAO.......",
  "...OAaAWWWAaAO..OO..",
  "...OAAAWWWAAAO.OAO..",
  "..OAaAAWWWAAaAOOaO..",
  "..OAAAOWOWOAAAAAO...",
  "..OOOOOOOOOOOOOOO...",
];

const SCRATCH_TOP = [
  "..........O...O.....",
  ".........OPO.OBO....",
  ".........OBBOBBBO...",
  ".........OBSWSBBO...",
  ".........OLOWLOBO...",
  ".........OBBWWPWO...",
  "..........OWWQWO....",
];

/** Moda up on her back legs against the screen's edge, one paw then the other. */
const MODA_SCRATCH: Sprite[] = [
  paint(
    [
      ...SCRATCH_TOP,
      ".........OBWWWOOOOO.",
      ".........OBWWWBBBBBO",
      "........OBBWWBOOOOO.",
      "........OBBWWBBBBBO.",
      "........OBSBBBOOOOO.",
      "........OBBSBBO.....",
      "........OBBBSBO.....",
      "...OOOOOOBBBBBO.....",
      "..OSBSBOBBOBBBO.....",
      "...OOOOOOOOOOOO.....",
    ],
    MODA_COAT,
  ),
  paint(
    [
      ...SCRATCH_TOP,
      ".........OBWWWOOOO..",
      ".........OBWWWBBBBO.",
      "........OBBWWBOOOOO.",
      "........OBBWWBBBBBBO",
      "........OBSBBBOOOOO.",
      "........OBBSBBO.....",
      "........OBBBSBO.....",
      "...OOOOOOBBBBBO.....",
      "..OSBSBOBBOBBBO.....",
      "...OOOOOOOOOOOO.....",
    ],
    MODA_COAT,
  ),
];

/** Nipster sitting, giving you a side-eye. */
const NIPSTER_SIT: Sprite = [
  "....................",
  "....................",
  ".....O.....O........",
  "....ODO...OAO.......",
  "....OKKOOOKAO.......",
  "...OKKKKWKAAKO......",
  "...OKOOKWKOOAO......",
  "...OKLOKWKLOAO......",
  "...OKAKWPWKKKO......",
  "....OKWWWWWKO.......",
  ".....OWWWWWO........",
  "....OKKWWWKAO.......",
  "...OKAKWWWKKKO..OO..",
  "...OKKKWWWKAKO.OKO..",
  "..OKAKKWWWKKKKOOAO..",
  "..OKKKOWOWOKKAKKO...",
  "..OOOOOOOOOOOOOOO...",
];

/** Nipster sitting, nose in the air, eyes shut: sassy. */
const NIPSTER_SASSY: Sprite = [
  "....................",
  "......O...O.........",
  ".....OKO.OAO........",
  ".....OKKOAAAO.......",
  "....OKKKKAAAAO......",
  "....OKKKKOOAAWO.....",
  "....OKKKKKAAWWPO....",
  ".....OKKKKWWWWO.....",
  "......OKKWWWWO......",
  ".....OKKWWWWO.......",
  ".....OKWWWWWO.......",
  "....OKKWWWKAO.......",
  "...OKAKWWWKKKO..OO..",
  "...OKKKWWWKAKO.OKO..",
  "..OKAKKWWWKKKKOOAO..",
  "..OKKKOWOWOKKAKKO...",
  "..OOOOOOOOOOOOOOO...",
];

export type ModaPose = "walk" | "sit" | "scratch" | "eat" | "perch";
export type NipsterPose = "walk" | "sit" | "sassy" | "eat" | "perch";

export const MODA_FRAMES: Readonly<Record<ModaPose, readonly Sprite[]>> = {
  walk: WALK_T.map((t) => paint(t, MODA_COAT)),
  sit: [MODA_SIT],
  scratch: MODA_SCRATCH,
  eat: EAT_T.map((t) => paint(t, MODA_COAT)),
  perch: [paint(PERCH_T, MODA_COAT)],
};

export const NIPSTER_FRAMES: Readonly<Record<NipsterPose, readonly Sprite[]>> =
  {
    walk: WALK_T.map((t) => paint(t, NIPSTER_COAT)),
    sit: [NIPSTER_SIT],
    sassy: [NIPSTER_SASSY],
    eat: EAT_T.map((t) => paint(t, NIPSTER_COAT)),
    perch: [paint(PERCH_T, NIPSTER_COAT)],
  };

/** A food bowl in the camp's magenta, empty, and full of kibble. */
export const BOWL_EMPTY: Sprite = [
  "..............",
  "..............",
  ".OOOOOOOOOOOO.",
  "OMmmmmmmmmmmMO",
  "OMMMMMMMMMMMMO",
  ".OmMMMMMMMMmO.",
  "..OOOOOOOOOO..",
];
export const BOWL_FULL: Sprite = [
  "..............",
  ".....OnO......",
  "..OOnkknkOOO..",
  "OMknkknknkknMO",
  "OMMMMMMMMMMMMO",
  ".OmMMMMMMMMmO.",
  "..OOOOOOOOOO..",
];
