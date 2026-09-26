import type { CharacterLook } from "./human";

// Cloud, one of the camp's captains, from the owner's photos (2026-09-26):
// long, wavy copper-red hair to mid-back (darker brown at the roots, bright
// ginger lengths), fair skin, a cropped tank top (white in the photos; light blue
// here, the owner's choice, so white Prince shows up on her lap), a long navy
// boho maxi skirt printed red, teal and cream, a colourful tattoo on her upper
// arm, a small septum ring, bracelets and a thin dark choker. Barefoot.
// The two things that make her Cloud at 2x are the copper hair down her back
// and the printed navy skirt: keep those loud.

export const CLOUD_LOOK: CharacterLook = {
  id: "cloud",
  skin: { base: "oklch(0.88 0.045 55)", shade: "oklch(0.76 0.06 45)" },
  hair: {
    root: "oklch(0.42 0.1 40)",
    mid: "oklch(0.56 0.16 42)",
    tips: "oklch(0.68 0.16 50)",
    length: "long",
    style: "wavy",
  },
  eyes: "oklch(0.3 0.05 50)",
  mouth: "oklch(0.62 0.12 20)",
  top: {
    kind: "tank",
    // Light blue, the owner's pick (2026-09-27), not the photos' white, so
    // white Prince stands out on her lap.
    colour: "oklch(0.76 0.09 235)",
    shade: "oklch(0.64 0.1 235)",
    // Cropped, her middle bare: her style (owner, 2026-09-27).
    crop: true,
  },
  bottoms: {
    kind: "maxi-skirt",
    colour: "oklch(0.34 0.1 270)",
    shade: "oklch(0.26 0.08 270)",
    pattern: [
      "oklch(0.58 0.18 28)",
      "oklch(0.65 0.1 195)",
      "oklch(0.88 0.04 85)",
    ],
  },
  feet: "oklch(0.88 0.045 55)",
  accessories: {
    choker: "oklch(0.22 0.02 300)",
    noseRing: "oklch(0.85 0.01 250)",
    bracelets: "oklch(0.55 0.14 200)",
    tattoo: ["oklch(0.62 0.16 250)", "oklch(0.72 0.15 60)"],
  },
};
