import { MODA_FRAMES, NIPSTER_FRAMES } from "../camp-cats/art";
import { trimSprite } from "../pets/portraits";
import { PRINCE_SITTING, type Sprite } from "./sprites";

// The camp's four cats sitting up, for the Survival Guide's link preview
// (owner, 2026-11-16: "the cats sitting around a fire"). All four sit up
// facing you: Moda cross-eyed and Nipster giving a side-eye, as on the
// desktop; Prince's own (sprites.ts); and Jinn in Nipster's pose painted all
// black with his pink eyes, because INKBLOT's profile of him reads as a block
// beside the others. Trimmed to the cat, so each stands on its own bottom row.
// Plain data, no React, so a server-drawn picture can read it. Easter eggs:
// never name them in the UI or an image's alt text.

export type { Sprite };

export type SittingCat = "jinn" | "moda" | "nipster" | "prince";

/** Jinn facing you: Nipster's sit, her orange and white made black, a sheen on the nose. */
const JINN_FACING: Sprite = NIPSTER_FRAMES.sit[0]!.map((r) =>
  r.replace(/[AWLP]/g, (c) => ({ A: "K", W: "K", L: "E", P: "D" })[c]!),
);

export const SITTING: Readonly<Record<SittingCat, Sprite>> = {
  jinn: trimSprite(JINN_FACING),
  moda: trimSprite(MODA_FRAMES.sit[0]!),
  nipster: trimSprite(NIPSTER_FRAMES.sit[0]!),
  prince: trimSprite(PRINCE_SITTING),
};

/**
 * Every letter a sitting cat is drawn in, besides "." (see-through): INKBLOT's
 * K, D, E and O, the camp cats' A, a, L and P, and W and G for white and its
 * shade.
 */
export const SITTING_LETTERS = [
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

/** A sprite turned to face the other way. */
export function mirrorSprite(sprite: Sprite): Sprite {
  return sprite.map((r) => [...r].reverse().join(""));
}

export { pixelRuns, type PixelRun } from "./sprites";
