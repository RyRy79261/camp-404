import type { Sprite } from "../inkblot/sprites";

// Shadow Work, the camp's art piece (owner, 2026-09-25): a lit wooden
// dodecahedron that throws its lattice of light across the playa, as a 16-bit
// sprite from the owner's photos. Face on: a pentagon in the middle and five
// faces round it, meeting at thin dark joints (J). Each face is a wooden
// frame (F) round a lit panel (L, M) cut with a mandala (C); the middle face
// shows the bulb (H). Thin legs (S) stand on a plank (B). Generated from the
// real geometry (a regular pentagon inside a regular decagon), not drawn by
// hand. Plain data, no React.

export const SHADOW_WORK: Sprite = [
  ".................JJJJJJ.................",
  "..............JJFFFJJFFFJJ..............",
  "...........JJFFFFLFJJFCFFFFJJ...........",
  "........JJFFFFCLMLFJJFCMCLFFFFJJ........",
  "........FFFLCMMCCLFJJFCCCMMLCFFF........",
  ".......JFCMCCMMLCLFJJFCCLMMCCMLFJ.......",
  "......JFFMCMCLLMCCFJJFLCMLLCMCMFFJ......",
  "......FFLCMLLLMCCCFJJFLCCMLLLMCCFF......",
  ".....JFLMMLLLCMCFFJJJJFFLMCLLLMMCFJ.....",
  "....JFLMCLLMCMLFFJJFFJJFFCMCMLLCMLFJ....",
  "...JFFMCLLMMCFFFJJFFFFJJFFFLMMLLCMFFJ...",
  "...FFCCCCCCLFFJJFFFCLFFFJJFFCCCCCCLFF...",
  "..JFFFCCMMLFFJJFFCCLLLLFFJJFFCMMLLFFFJ..",
  "..JJJFFFFFFFJJFFCCCLLCLLFFJJFFFFFFFJJJ..",
  "..FFJJJJFFJJFFFLLLCCCCLLCFFFJJFFJJJJFF..",
  "..FFFFFJJJJFFLLCLLCLLCLLCCCFFJJJJFFFFF..",
  "..FLLLFFFJJFLLLLCCLCCLCCLLCLFJJFFFCCCF..",
  "..FLCCMCFFJFCCLCLLLLLLLLCLLLFJFFLMCCCF..",
  "..FLMMMMCFJFFCCLLCHHHHCLLCLFFJFLMMMMCF..",
  "..FCMMLCCFJJFCCLCLLHHLLCLCLFJJFLCLMMLF..",
  "..FCMMLCMFFJFCCLCLCCCCLCLLLFJFFMCLMMLF..",
  "..FCCMLMMLFJFFLLCLLLLLLCLCFFJFCMMLMCLF..",
  "..FLMMLCCLFJFFLCLCCCCCCLCCFFJFLCCLMMLF..",
  "..FLCMLCCCFFJFLLLLCLLCLLCCFJFFCCCLMCCF..",
  "..FFMCCLMMFFJFFLLLCLLCLLCFFJFFMMLCCMFF..",
  "..JFCMMLLCLFJFFLCCCCLLLLLFFJFCCLLMMLFJ..",
  "...FFLMMLCCFFJFFFFFFFFFFFFJFFCCLMMCFF...",
  "...JFFMCLCMFFJJJJJJJJJJJJJJFFMCLCMFFJ...",
  "....JFLMCMLFJJFFFFFFFFFFFFJJFLMCMCFJ....",
  ".....JFCCCFFJFFFFFFFFFFFFFFJFFLCLFJ.....",
  "......FFCFFJFFCMCMMMMMMCMLFFJFFLFF......",
  "......JFFFJJFLMMMMMMMMMMMMCFJJFFFJ......",
  ".......JFJJFFCCLLLLLLLLLLCCFFJJFJ.......",
  "........FJFFLCCCCMCLLCMCCCCCFFJF........",
  "........JJFFFFLLMCCCCCCMLCFFFFJJ........",
  "...........JJFFFFCLMMCLFFFFJJ...........",
  "..............JJFFFFFFFFJJ..............",
  ".................JJFFJJ.................",
  "........................................",
  "...........S........S........S..........",
  "...........S........S........S..........",
  "...........S........S........S..........",
  "...........S........S........S..........",
  "......BBBBBBBBBBBBBBBBBBBBBBBBBBBBB.....",
];

/** The ball rolls; its legs and plank stay put, in the light on the floor. */
const LEGS_AT = SHADOW_WORK.findIndex((r) => r.includes("S"));
export const SHADOW_WORK_BALL: Sprite = SHADOW_WORK.slice(0, LEGS_AT).filter(
  (r) => /[^.]/.test(r),
);
export const SHADOW_WORK_STAND: Sprite = SHADOW_WORK.slice(LEGS_AT);

export const SHADOW_WORK_COLOURS: Readonly<Record<string, string>> = {
  F: "oklch(0.5 0.08 65)",
  L: "oklch(0.93 0.07 88)",
  M: "oklch(0.8 0.11 75)",
  H: "oklch(0.99 0.03 95)",
  C: "oklch(0.42 0.07 60)",
  // The dark joints where the faces meet.
  J: "oklch(0.22 0.03 60)",
  S: "oklch(0.3 0.02 60)",
  B: "oklch(0.58 0.07 70)",
};
