import type { CSSProperties } from "react";

// The pre-restyle Camp 404 palette (packages/ui globals.css before #221):
// midnight-violet base, magenta primary, electric-blue accent. The public
// pages keep Camp 404's own look (owner's call, 2026-09-23; the AfrikaBurn
// restyle is for the console), so each public page sets these tokens on its
// own root: the signed-out landing (apps/web/app/landing-hero.tsx) and the
// join site (apps/join). One copy, so the two never drift apart.
export const CAMP_404_PALETTE = {
  "--color-background": "oklch(0.15 0.05 295)",
  "--color-foreground": "oklch(0.97 0.02 330)",
  "--color-primary": "oklch(0.65 0.27 340)",
  "--color-primary-foreground": "oklch(0.99 0.005 340)",
  "--color-muted-foreground": "oklch(0.7 0.05 325)",
  "--color-accent": "oklch(0.62 0.18 255)",
  "--color-ring": "oklch(0.65 0.27 340)",
  "--radius": "0.625rem",
} as CSSProperties;
