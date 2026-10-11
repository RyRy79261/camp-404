import {
  CAMP_CATS_COLOURS,
  MODA_FRAMES,
  NIPSTER_FRAMES,
} from "../camp-cats/art";
import {
  DESK_COLOURS,
  JINN_SITTING,
  PRINCE_SLEEPING,
  pixelRuns,
  spriteWidth,
  type Sprite,
} from "../cats/sprites";

// The camp's pets that are in, as pictures (owner, 2026-10-09). Each pet that
// is in is a module of its own in this package, drawn by hand from the photos
// its member sent; this registry is the one picture of each, for Camp pets'
// cards, keyed by the stable key the app stores on the pet (`pets.module_key`).
// A new pet is a new entry here. Plain data, no React, no app content: the
// app never says what a pet does or where it goes.

export type { Sprite };

export interface PetPortrait {
  /** The picture, one letter per pixel ("." is see-through). */
  sprite: Sprite;
  /** The colour of each letter. */
  palette: Readonly<Record<string, string>>;
}

/** Every pet the code has a picture for, in the order they came in. */
export const PET_PORTRAITS = {
  jinn: { sprite: JINN_SITTING, palette: DESK_COLOURS },
  moda: { sprite: MODA_FRAMES.sit[0]!, palette: CAMP_CATS_COLOURS },
  nipster: { sprite: NIPSTER_FRAMES.sassy[0]!, palette: CAMP_CATS_COLOURS },
  prince: { sprite: PRINCE_SLEEPING, palette: DESK_COLOURS },
} as const satisfies Record<string, PetPortrait>;

export type PetModuleKey = keyof typeof PET_PORTRAITS;

/** The registry's keys, in its order. */
export const PET_MODULE_KEYS = Object.keys(PET_PORTRAITS) as PetModuleKey[];

/** Whether a stored key names a picture the code has. */
export function isPetModuleKey(key: unknown): key is PetModuleKey {
  return typeof key === "string" && Object.hasOwn(PET_PORTRAITS, key);
}

/** A sprite with its empty rows and columns cut away, so it fills its box. */
export function trimSprite(sprite: Sprite): Sprite {
  const rows = sprite.filter((r) => /[^.]/.test(r));
  if (rows.length === 0) return [];
  const w = spriteWidth(rows);
  const padded = rows.map((r) => r.padEnd(w, "."));
  let left = 0;
  while (padded.every((r) => r[left] === ".")) left++;
  let right = w - 1;
  while (padded.every((r) => r[right] === ".")) right--;
  return padded.map((r) => r.slice(left, right + 1));
}

/** One rectangle of the picture, with its colour. */
export interface PortraitRect {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** A pet's picture as rectangles to draw, or null for a key with none. */
export function petPortraitRects(
  key: string,
): { width: number; height: number; rects: PortraitRect[] } | null {
  if (!isPetModuleKey(key)) return null;
  const portrait: PetPortrait = PET_PORTRAITS[key];
  const sprite = trimSprite(portrait.sprite);
  return {
    width: spriteWidth(sprite),
    height: sprite.length,
    rects: pixelRuns(sprite, portrait.palette).map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      fill: portrait.palette[r.ch]!,
    })),
  };
}
