import {
  PET_PORTRAITS,
  trimSprite,
  type PetModuleKey,
} from "@camp404/games/pets";

// The four cats round the guide's campfire (share-image.tsx), as pixel data.

/** A sprite: one letter a pixel, "." see-through. */
export type Sprite = readonly string[];

/**
 * Moda, Nipster and Prince in Jinn's art style (owner, 2026-11-16: their desktop
 * sprites are "a different artstyle"): Jinn's own sitting portrait, every
 * outline and see-through pixel where it is, only the fills recoloured.
 * Moda's coat (K), the sheen on her back and tail (D) and her eye (E) are
 * swapped for her orange, darker orange and green.
 */
const MODA_COAT: Record<string, string> = { K: "A", D: "a", E: "L" };

/**
 * Nipster, painted pixel by pixel on Jinn's sitting portrait from the owner's
 * photo of her (2026-11-16): mostly black, with fine orange brindling on her
 * back and tail and orange round her eye, white only on her muzzle, chin,
 * chest bib and front paw, and green eyes.
 */
export const NIPSTER_ON_JINN: Sprite = [
  ".....OO...OO",
  ".....OKOOOKO",
  ".....OKKAKKO",
  ".....OKLAKOO",
  ".....OKKKWWO",
  ".....OKAKWWO",
  "....OKKKWWO.",
  "....OAKKKWO.",
  "....OKKAKKO.",
  ".OOOKAKOKOWO",
  "OKAOAKKOKOWO",
  "OOOOOOOOOOOO",
];

/**
 * Prince, painted pixel by pixel on Jinn's sitting portrait from the owner's
 * reference photo of him (2026-11-16): white and fluffy, a black cap over both
 * ears and round his eyes with a white blaze down the middle, a small black
 * nose, a big black patch on his back above white haunches, his big black
 * tail, and pale green eyes.
 */
export const PRINCE_ON_JINN: Sprite = [
  ".....OO...OO",
  ".....OKOOOKO",
  ".....OKKWKKO",
  ".....OKLWWOO",
  ".....OWWWWKO",
  ".....OGWWWWO",
  "....OKKKWWO.",
  "....OKKKWWO.",
  "....OGWWWWO.",
  ".OOOKWWOWOWO",
  "OKKOKWWOWOWO",
  "OOOOOOOOOOOO",
];

/** Each cat as the campfire draws it. */
export function portrait(cat: PetModuleKey): Sprite {
  if (cat === "nipster") return NIPSTER_ON_JINN;
  if (cat === "prince") return PRINCE_ON_JINN;
  const jinn = trimSprite(PET_PORTRAITS.jinn.sprite);
  if (cat === "moda") {
    return jinn.map((r) => r.replace(/[KDE]/g, (c) => MODA_COAT[c]!));
  }
  return trimSprite(PET_PORTRAITS[cat].sprite);
}
