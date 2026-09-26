import type { Sprite } from "../cats/sprites";
import { inlaid, outlined } from "./pixels";
import {
  HUMAN_TEMPLATES,
  LAP_AT,
  SIT_HANDS,
  type HumanPose,
} from "./human-frames";

// The camp's people as 16-bit characters, drawn the way the cats are (a grid
// of palette letters, outlined in the desktop's outline colour) so a person
// and a cat stand side by side at the same pixel scale.
//
// One body is drawn once, in template letters that say what each pixel IS
// (skin, top, skirt, hair that reaches the shoulders, a bracelet ...), and a
// person is a `CharacterLook`: colours plus a few choices (hair length and
// style, tank or tee, skirt, trousers or shorts, which accessories). The
// generator turns the template into that person's sprites and palette, so a
// new camp member is a new look, not new art.

export type { HumanPose };

export type HairLength = "short" | "shoulder" | "long";
export type HairStyle = "straight" | "wavy";
export type TopKind = "tank" | "tee";
export type BottomsKind = "maxi-skirt" | "trousers" | "shorts";

export type CharacterLook = {
  /** For tests and contact sheets only; never shown in the app. */
  id: string;
  skin: { base: string; shade: string };
  /** Roots to tips: `root` at the crown, `mid` at the shoulders, `tips` below. */
  hair: {
    root: string;
    mid: string;
    tips: string;
    length: HairLength;
    style: HairStyle;
  };
  eyes: string;
  mouth: string;
  /** `crop`: the top stops above the waist, and her middle shows. */
  top: { kind: TopKind; colour: string; shade: string; crop?: boolean };
  bottoms: {
    kind: BottomsKind;
    colour: string;
    shade: string;
    /** Up to three pattern colours printed over the cloth (a paisley print). */
    pattern?: readonly string[];
  };
  /** Bare feet wear the skin colour; sandals or boots their own. */
  feet: string;
  accessories?: {
    choker?: string;
    noseRing?: string;
    bracelets?: string;
    /** Two colours for a tattoo on the upper arm (the one nearest a side view). */
    tattoo?: readonly [string, string];
  };
  /** The darker line inside the figure (between arm and body, under the chin). */
  line?: string;
};

/**
 * The letters a person's sprites use, and so the keys of their palette.
 * None of them is a cat's letter (O K D W G E), so a person and a cat can be
 * laid into one sprite (the dust storm) with both palettes merged. The
 * outline, `O`, is the desktop's own (DESK_COLOURS), shared with the cats.
 */
export const HUMAN_LETTERS = [
  "S", // skin
  "s", // skin shade
  "e", // eye
  "m", // mouth
  "r", // hair at the roots
  "H", // hair
  "h", // hair tips
  "T", // top
  "t", // top shade
  "B", // bottoms
  "b", // bottoms shade
  "P", // pattern 1
  "Q", // pattern 2
  "U", // pattern 3
  "F", // feet
  "C", // choker
  "N", // nose ring
  "J", // bracelets
  "X", // tattoo 1
  "x", // tattoo 2
  "l", // the line inside the figure
] as const;

/**
 * The template alphabet (what `human-frames.ts` is drawn in). Each letter is
 * a part; the look decides its colour, or whether it is there at all.
 *
 *   .  clear                       o  line inside the figure
 *   S s  skin, skin shade          e m  eye, mouth
 *   T t  top, top shade            A a  upper arm: sleeve on a tee, else skin
 *   w y  the waist row: top (w) or top shade (y), skin on a crop top
 *   z  the waist's middle: top, or the navel (skin shade) on a crop top
 *   X  upper-arm tattoo (skin without one, sleeve on a tee)
 *   B b  bottoms, shade (printed)  g v  skirt only (and its shade): clear
 *        under trousers or shorts, so the legs show
 *   k  lower leg: skin on shorts, else bottoms
 *   F  foot                        C N J  choker, nose ring, bracelet (else skin)
 *   1  hair, any length (crown)    2  hair to the shoulders, else clear
 *   3  hair to mid-back, else clear
 *   4  hair to the shoulders, else top   5  hair to mid-back, else top
 *   6  hair to the shoulders, else skin  7  hair to mid-back, else skin
 */
export const TEMPLATE_LETTERS = ".oSsemTtwyzAaXBbgvkFCNJ1234567";

const TIER: Record<HairLength, number> = { short: 1, shoulder: 2, long: 3 };

/** One hair pixel: darker at the roots, brighter at the tips, with strands. */
function hairPixel(tier: number, x: number, y: number, style: HairStyle) {
  const strand =
    style === "wavy" ? (x + Math.floor(y / 2)) % 3 === 0 : x % 3 === 0;
  // The crown is the mid colour with dark strands (the roots show through);
  // the lengths are the tips' colour with mid strands.
  if (tier === 1) return strand ? "r" : "H";
  return strand ? "H" : "h";
}

/** The print on the cloth: a small repeating paisley-ish tile. */
const PRINT = ["01....", "0.....", "...21.", "....2."];

function clothPixel(x: number, y: number, pattern: number) {
  if (pattern === 0) return "B";
  const cell = PRINT[y % PRINT.length]![x % PRINT[0]!.length]!;
  if (cell === ".") return "B";
  const i = Number(cell);
  return i < pattern ? "PQU"[i]! : "B";
}

/** One template sprite made into this person's (not yet outlined). */
export function resolveTemplate(template: Sprite, look: CharacterLook): Sprite {
  const tier = TIER[look.hair.length];
  const acc = look.accessories ?? {};
  const tee = look.top.kind === "tee";
  const crop = look.top.crop === true;
  const skirt = look.bottoms.kind === "maxi-skirt";
  const shorts = look.bottoms.kind === "shorts";
  const pattern = Math.min(3, look.bottoms.pattern?.length ?? 0);
  const hair = (need: number, x: number, y: number, otherwise: string) =>
    tier >= need ? hairPixel(need, x, y, look.hair.style) : otherwise;

  return template.map((row, y) =>
    row
      .split("")
      .map((ch, x) => {
        switch (ch) {
          case ".":
            return ".";
          case "o":
            return "l";
          case "w":
            return crop ? "S" : "T";
          case "y":
            return crop ? "S" : "t";
          case "z":
            return crop ? "s" : "T";
          case "A":
            return tee ? "T" : "S";
          case "a":
            return tee ? "t" : "s";
          case "X":
            if (tee) return "T";
            if (!acc.tattoo) return "S";
            return (x + y) % 2 === 0 ? "X" : "x";
          case "B":
            return clothPixel(x, y, pattern);
          case "g":
            return skirt ? clothPixel(x, y, pattern) : ".";
          case "v":
            return skirt ? "b" : ".";
          case "k":
            return shorts ? "S" : clothPixel(x, y, pattern);
          case "C":
            return acc.choker ? "C" : "S";
          case "N":
            return acc.noseRing ? "N" : "S";
          case "J":
            return acc.bracelets ? "J" : "S";
          case "1":
            return hair(1, x, y, ".");
          case "2":
            return hair(2, x, y, ".");
          case "3":
            return hair(3, x, y, ".");
          case "4":
            return hair(2, x, y, "T");
          case "5":
            return hair(3, x, y, "T");
          case "6":
            return hair(2, x, y, "S");
          case "7":
            return hair(3, x, y, "S");
          default:
            return ch; // S s e m T t b F
        }
      })
      .join(""),
  );
}

/** A person's palette: their colours under the letters their sprites use. */
export function characterPalette(
  look: CharacterLook,
): Readonly<Record<string, string>> {
  const acc = look.accessories ?? {};
  const [p1, p2, p3] = look.bottoms.pattern ?? [];
  const palette: Record<string, string> = {
    S: look.skin.base,
    s: look.skin.shade,
    e: look.eyes,
    m: look.mouth,
    r: look.hair.root,
    H: look.hair.mid,
    h: look.hair.tips,
    T: look.top.colour,
    t: look.top.shade,
    B: look.bottoms.colour,
    b: look.bottoms.shade,
    F: look.feet,
    l: look.line ?? "oklch(0.3 0.05 300)",
  };
  if (p1) palette.P = p1;
  if (p2) palette.Q = p2;
  if (p3) palette.U = p3;
  if (acc.choker) palette.C = acc.choker;
  if (acc.noseRing) palette.N = acc.noseRing;
  if (acc.bracelets) palette.J = acc.bracelets;
  if (acc.tattoo) {
    palette.X = acc.tattoo[0];
    palette.x = acc.tattoo[1];
  }
  return palette;
}

export type Character = {
  id: string;
  /** Every pose's frames, facing right; `mirrored()` turns one to face left. */
  frames: Readonly<Record<HumanPose, readonly Sprite[]>>;
  palette: Readonly<Record<string, string>>;
};

/** A person: every frame of the one body, in their look, outlined. */
export function buildCharacter(look: CharacterLook): Character {
  const frames = {} as Record<HumanPose, readonly Sprite[]>;
  for (const pose of Object.keys(HUMAN_TEMPLATES) as HumanPose[]) {
    frames[pose] = HUMAN_TEMPLATES[pose].map((t) =>
      outlined(resolveTemplate(t, look)),
    );
  }
  return { id: look.id, frames, palette: characterPalette(look) };
}

/**
 * The sitting frames with a cat in the person's lap and their hands on him:
 * the cat's fill (cat letters, which the person's never use) inlaid at
 * LAP_AT, the hands over him, then one outline round the lot. Its palette is
 * the person's over the desktop's (DESK_COLOURS has the cat's letters).
 */
export function withLapCat(look: CharacterLook, cat: Sprite): Sprite[] {
  const hands = resolveTemplate(SIT_HANDS, look);
  return HUMAN_TEMPLATES.sit.map((t) => {
    // The cat's edge is the desktop's light outline, as on every cat, so his
    // black cap and tail read against a dark skirt.
    const lap = inlaid(resolveTemplate(t, look), cat, LAP_AT.x, LAP_AT.y, "O");
    return outlined(inlaid(lap, hands, 0, 0, "O"));
  });
}
