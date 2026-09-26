import type { Sprite } from "../cats/sprites";

// The one human body every camp character is made from, in template letters
// (the alphabet is in human.ts). 18 x 27: a 16 x 24 figure with a clear
// pixel all round for the outline, and a row of headroom for the walk's bob
// (drawn below as 26 rows; `withHeadroom` adds the top one). Feet on the
// second-last row; side views face right.
// Drawn with the longest hair and a maxi skirt; the look trims or swaps them.

export const HUMAN_W = 18;
export const HUMAN_H = 27;

export type HumanPose = "idle" | "walk" | "call" | "look" | "surprised" | "sit";

// ---- Front view -----------------------------------------------------------

const FRONT_HEAD = [
  "..................",
  "......111111......",
  ".....11111111.....",
  "....1111111111....",
  "....111SSSS111....",
  "....11SSSSSS11....",
  "...211SeSSeS112...",
  "...21SSSSSSSS12...",
  "...22SSSNSSSS22...",
  "...222SSmmSS222...",
  "...2222CCCC2222...",
];

const IDLE: Sprite = [
  ...FRONT_HEAD,
  "..22AATTTTTTAA22..",
  "..33AATTTTTTXX33..",
  "..33AATTTTTTXX33..",
  "..33SSyyzwyySS33..",
  "..3.SSBBBBBBSS.3..",
  "....JSBBBBBBSJ....",
  "....SSBBBBBBSS....",
  ".....BBBBBBBB.....",
  "....gBBBggBBBg....",
  "....gkkkggkkkg....",
  "...ggkkkggkkkgg...",
  "...vgkkkggkkkgv...",
  "....vkkkvvkkkv....",
  "......FF..FF......",
  "..................",
];

/** Head turned to the left of the picture, looking for someone. */
const LOOK_LEFT: Sprite = [
  "..................",
  "......111111......",
  ".....11111111.....",
  "....1111111111....",
  "....11SSSS1111....",
  "....1SSSSSS111....",
  "...21eSSeSSS112...",
  "...21SSSSSSSS12...",
  "...22SSNSSSSS22...",
  "...222SmmSSS222...",
  "...2222CCCC2222...",
  ...IDLE.slice(11),
];

/** Head turned the other way (the head only: the tattoo stays put). */
const LOOK_RIGHT: Sprite = [
  ...LOOK_LEFT.slice(0, 11).map((r) => r.split("").reverse().join("")),
  ...IDLE.slice(11),
];

/** Arms flung up, hair flying, mouth an "O": the tackle lands. */
const SURPRISED: Sprite = [
  "..................",
  "..SS..111111..SS..",
  "..SS.11111111.SS..",
  "..J21111111111J2..",
  "..S2111SSSS1112S..",
  "..S211SeSSeS1123..",
  "..A3SSeSSSeSS23A..",
  "..A3SSSSSSSSS23A..",
  "..AA2SSSNSSSS2AA..",
  "..XA22SSmmSS22AA..",
  "...AA2SCmmCS2AA...",
  "...33ATTTTTTA33...",
  "..333TTTTTTTT333..",
  "..33.TTTTTTTT.33..",
  "..3...yyzwyy...3..",
  "......BBBBBB......",
  ".....BBBBBBBB.....",
  ".....BBBggBBB.....",
  "....gkkkggkkkg....",
  "....gkkkggkkkg....",
  "...ggkkkggkkkgg...",
  "...vgkkkggkkkgv...",
  "....vkkkvvkkkv....",
  ".....FF....FF.....",
  "..................",
  "..................",
];

// ---- Side view (facing right) ----------------------------------------------

const SIDE_HEAD = [
  "..................",
  "......11111.......",
  ".....11111111.....",
  "....1111111111....",
  "....1111111SSS....",
  "...2111111SSSS....",
  "...2111111SSeS....",
  "...2211111SSSSS...",
  "...2221111SSSN....",
  "...2222111SSmS....",
  "...222222sSSS.....",
  "...222222CCC......",
];

/** Walking: contact, the near arm swung back. */
const WALK_1: Sprite = [
  ...SIDE_HEAD,
  "...3322244TTTT....",
  "..33335XXATTTT....",
  "..33335XATTTtT....",
  "..3333SSwwyywy....",
  "...33JSSBBBBB.....",
  "....3SS.BBBBBB....",
  "........BBBBBBB...",
  ".......gkkBBkkg...",
  ".......kkggggkkg..",
  "......kkgggggkkg..",
  ".....kkggggggkkv..",
  ".....kkvvvvvvkkv..",
  ".....FF.....FFF...",
  "..................",
];

/** Walking: passing, a pixel higher, arms down. */
const WALK_2: Sprite = [
  ...SIDE_HEAD.slice(1),
  "...3322244TTTT....",
  "..33335TXXTTTT....",
  "..33335TXATTtT....",
  "..3333wwSSyywy....",
  "...33..BJBBBB.....",
  "....3..BSSBBBB....",
  ".......BBBBBBB....",
  ".......BBBBBBB....",
  "......gBkkkkBgg...",
  "......ggkkkkggg...",
  "......vgkkkkggv...",
  "......vvkkkkvvv...",
  "........FF.F......",
  "........FF.FF.....",
  "..................",
];

/** Walking: contact, the near arm swung forward. */
const WALK_3: Sprite = [
  ...SIDE_HEAD,
  "...3322244TTTT....",
  "..33335TTXXTTT....",
  "..33335TTTXATT....",
  "..3333wwwyySSy....",
  "...33..BBBBJSS....",
  "....3..BBBBBSS....",
  ".......BBBBBBBB...",
  ".......gkkBBkkg...",
  "......gkkggggkkg..",
  ".....gkkgggggkkg..",
  ".....kkggggggkkv..",
  "....vkkvvvvvvkkv..",
  "....FFF.....FF....",
  "..................",
];

/** Walking: passing again. */
const WALK_4: Sprite = [
  ...SIDE_HEAD.slice(1),
  "...3322244TTTT....",
  "..33335TXXTTTT....",
  "..33335TXATTtT....",
  "..3333wwSSyywy....",
  "...33..BJBBBB.....",
  "....3..BSSBBBB....",
  ".......BBBBBBB....",
  ".......BBBBBBB....",
  "......gBkkkkBgg...",
  "......ggkkkkggg...",
  "......vgkkkkggv...",
  "......vvkkkkvvv...",
  ".........FFF......",
  "........FF.F......",
  "..................",
];

/** Calling, a hand cupped at her mouth: "Prince!" */
const CALL_1: Sprite = [
  "..................",
  "......11111.......",
  ".....11111111.....",
  "....1111111111....",
  "....1111111SSS....",
  "...2111111SSSS....",
  "...2111111SSeS....",
  "...2211111SSSSS...",
  "...2221111SSSN.SS.",
  "...2222111SSmmoSS.",
  "...222222sSSS.JS..",
  "...222222CCC..S...",
  "...3322244TTTXS...",
  "..33335TTTTXXS....",
  "..33335TTTTTTT....",
  "..3333wwwwyywy....",
  "...33..BBBBBBB....",
  "....3..BBBBBBB....",
  ".......BBBBBBBB...",
  ".......BkkBBkkB...",
  "......gkkgggkkgg..",
  "......kkggggkkgg..",
  "......kkggggkkgv..",
  ".....vkkvvvvkkvv..",
  "......FF....FF....",
  "..................",
];

/** Between calls: the hand still up, mouth shut, listening. */
const CALL_2: Sprite = CALL_1.map((row, y) =>
  y === 9 ? "...2222111SSmSoSS." : row,
);

// ---- Sitting ---------------------------------------------------------------

/** The sitting frames are wider (22 x 27): crossed knees under a full skirt. */
export const SIT_W = 22;

/**
 * Sitting cross-legged, her full skirt spread over her knees and her arms
 * held forward round her lap: the lap cat is laid over at LAP_AT, then her
 * hands over him (SIT_HANDS). Line her up with the standing frames by the
 * middle of the bottom row.
 */
const SIT: Sprite = [
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "........111111........",
  ".......11111111.......",
  "......1111111111......",
  "......111SSSS111......",
  "......11SSSSSS11......",
  ".....211SeSSeS112.....",
  ".....21SSSSSSSS12.....",
  ".....22SSSNSSSS22.....",
  ".....222SSmmSS222.....",
  ".....2222CCCC2222.....",
  "....22AATTTTTTAA22....",
  "....33AATTTTTTXX33....",
  "...333SSTTTTTTSS333...",
  "..BBB3SSyyyyyySS3BBB..",
  ".BBBBBBSBBBBBBSBBBBBB.",
  ".BBBBBBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBBBBBb.",
  "..FbbbbbbbbbbbbbbbbF..",
  "......................",
];

/** The same, cheeks pink with happiness: the scene's resting frame. */
const SIT_CONTENT: Sprite = SIT.map((row, y) =>
  y === 13 ? ".....21mSSSSSSm12....." : row,
);

/** Her two hands, laid over the lap cat so she holds him. */
export const SIT_HANDS: Sprite = [
  ...Array<string>(22).fill("......................"),
  ".....S................",
  "..............S.......",
  "......................",
  "......................",
  "......................",
];

/** Where the lap cat's top-left corner goes on the sitting frames. */
export const LAP_AT = { x: 5, y: 20 } as const;

/** A clear row on top: the walk's passing frames rise into it. */
function withHeadroom(frames: readonly Sprite[]): Sprite[] {
  return frames.map((t) => [".".repeat(t[0]!.length), ...t]);
}

export const HUMAN_TEMPLATES: Readonly<Record<HumanPose, readonly Sprite[]>> = {
  idle: withHeadroom([IDLE]),
  walk: withHeadroom([WALK_1, WALK_2, WALK_3, WALK_4]),
  call: withHeadroom([CALL_1, CALL_2]),
  look: withHeadroom([LOOK_LEFT, LOOK_RIGHT]),
  surprised: withHeadroom([SURPRISED]),
  sit: withHeadroom([SIT, SIT_CONTENT]),
};
