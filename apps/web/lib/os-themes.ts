import type { OsTheme } from "@camp404/types/desktop-preferences";

// The 404 OS system themes (docs/specs/2026-09-26-404-os-welcome-and-themes.md,
// Part 2; issue #290). A theme is data: a value for every colour variable the
// desktop's chrome reads (`--os-*`) and every one a program window's content
// reads (`--os-win-*`, which app/globals.css maps onto the kit's tokens inside
// `[data-window-body]`). Themes never change layout.
//
// The server writes the chosen theme on the desktop root (`data-os-theme`),
// and the head script (lib/os-skin.ts) copies it to <html> so the menus and
// dialogs a window opens into <body> wear it too. The rules below go into the
// root layout's <head> as one small <style>, so the first paint is already in
// the member's theme. The signed-out landing page, Join and the sign-in pages
// carry no `data-os-theme` and keep their own look.
//
// Plain module: the root layout (a server component), the picker (client) and
// the tests read it. Every colour here is `#rrggbb` or `oklch(L C H)`, the two
// notations lib/contrast.ts reads, so the contrast test checks each one.

/** Every variable a theme sets. The drift test holds each theme to all of them. */
export const OS_THEME_TOKENS = [
  // The desktop's chrome (@camp404/os reads these).
  "--os-bg",
  "--os-fg",
  "--os-primary",
  "--os-primary-fg",
  "--os-muted",
  "--os-accent",
  "--os-panel",
  "--os-chrome",
  "--os-line",
  "--os-danger",
  // Inside a program window (app/globals.css, [data-window-body]).
  "--os-win-bg",
  "--os-win-fg",
  "--os-win-card",
  "--os-win-muted",
  "--os-win-muted-fg",
  "--os-win-secondary",
  "--os-win-secondary-fg",
  "--os-win-primary",
  "--os-win-primary-fg",
  "--os-win-border",
  "--os-win-input",
] as const;
export type OsThemeToken = (typeof OS_THEME_TOKENS)[number];

/**
 * How much of the desktop's decoration a theme keeps (Effects off turns all
 * of it off, whatever the theme):
 * - `full`: the CRT surface with its beam, the glitched wordmark, the glow;
 * - `calm`: the surface without its beam, the wordmark held still, no glow;
 * - `none`: none of it in the page at all (High contrast: scanlines, noise,
 *   glow and glitch all lower contrast).
 */
export type OsThemeEffects = "full" | "calm" | "none";

export interface OsThemeDef {
  id: OsTheme;
  /** Its name in the picker. */
  label: string;
  /** One plain sentence under the name. */
  description: string;
  effects: OsThemeEffects;
  /**
   * The WCAG level its text meets: "AA" (4.5:1) everywhere, "AAA" (7:1) where
   * the theme promises it (High contrast).
   */
  textLevel: "AA" | "AAA";
  colours: Record<OsThemeToken, string>;
}

// The programs' softer colours (owner, 2026-09-26: they "felt a bit less
// overwhelming than the original prototype"): charcoal, warm white, the camp's
// magenta. 404 Night keeps them inside windows; Calm wears them everywhere.
const SOFT_WINDOW = {
  "--os-win-bg": "#17191b",
  "--os-win-fg": "#f4f0e8",
  "--os-win-card": "#1f2326",
  "--os-win-muted": "#262b2f",
  "--os-win-muted-fg": "#adb6b3",
  "--os-win-secondary": "#26333b",
  "--os-win-secondary-fg": "#dce8ed",
  // --color-camp-magenta (packages/ui globals.css).
  "--os-win-primary": "oklch(0.72 0.2 345)",
  "--os-win-primary-fg": "#17191b",
  "--os-win-border": "#323a3f",
  "--os-win-input": "#323a3f",
} as const;

export const OS_THEMES_DEF: readonly OsThemeDef[] = [
  {
    id: "night",
    label: "404 Night",
    description:
      "The standard look: bright chrome, softer colours inside programs.",
    effects: "full",
    textLevel: "AA",
    colours: {
      // Join's palette (the approved prototype). Panel, chrome and line are
      // the background mixed 88%, 72% and 60% with the text colour, written
      // out so the contrast test can read them.
      "--os-bg": "oklch(0.15 0.05 295)",
      "--os-fg": "oklch(0.97 0.02 330)",
      "--os-primary": "oklch(0.65 0.27 340)",
      // Near-white on the magenta title bar: the one recorded exception to
      // AA (about 3.6:1), which the owner approved with the prototype
      // (2026-09-26; visual-language doc 2.3). Every other theme meets AA
      // there too.
      "--os-primary-fg": "oklch(0.99 0.005 340)",
      "--os-muted": "oklch(0.7 0.05 325)",
      "--os-accent": "oklch(0.62 0.18 255)",
      "--os-panel": "oklch(0.2484 0.0464 299.2)",
      "--os-chrome": "oklch(0.3796 0.0416 304.8)",
      "--os-line": "oklch(0.478 0.038 309)",
      "--os-danger": "#e0675b",
      ...SOFT_WINDOW,
    },
  },
  {
    id: "calm",
    label: "Calm",
    description: "The softer colours everywhere. No glow, no moving line.",
    effects: "calm",
    textLevel: "AA",
    colours: {
      "--os-bg": "#17191b",
      "--os-fg": "#f4f0e8",
      "--os-primary": "oklch(0.72 0.2 345)",
      "--os-primary-fg": "#17191b",
      "--os-muted": "#b7bfbc",
      "--os-accent": "#8fb4c4",
      "--os-panel": "#1f2326",
      "--os-chrome": "#2a3034",
      "--os-line": "#3d464c",
      "--os-danger": "#e0675b",
      ...SOFT_WINDOW,
    },
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description: "Black and white with strong edges. No screen effects.",
    effects: "none",
    textLevel: "AAA",
    colours: {
      "--os-bg": "#000000",
      "--os-fg": "#ffffff",
      // Yellow, the usual high-contrast highlight: 16:1 with black text.
      "--os-primary": "#ffe14a",
      "--os-primary-fg": "#000000",
      "--os-muted": "#e2e2e2",
      "--os-accent": "#7fdfff",
      "--os-panel": "#000000",
      "--os-chrome": "#141414",
      "--os-line": "#ffffff",
      "--os-danger": "#ff9d94",
      "--os-win-bg": "#000000",
      "--os-win-fg": "#ffffff",
      "--os-win-card": "#0b0b0b",
      "--os-win-muted": "#1c1c1c",
      "--os-win-muted-fg": "#e2e2e2",
      "--os-win-secondary": "#1c1c1c",
      "--os-win-secondary-fg": "#ffffff",
      "--os-win-primary": "#ffe14a",
      "--os-win-primary-fg": "#000000",
      "--os-win-border": "#bdbdbd",
      "--os-win-input": "#ffffff",
    },
  },
  {
    id: "colour-blind",
    label: "Colour-blind safe",
    description:
      "Orange and blue in place of magenta, so the two colours stay apart.",
    effects: "full",
    textLevel: "AA",
    colours: {
      // 404 Night's surfaces, with the magenta and blue pair (which reads as
      // one blue under protanopia) swapped for Okabe and Ito's orange and sky
      // blue, which stay apart under all three kinds.
      "--os-bg": "oklch(0.15 0.05 295)",
      "--os-fg": "oklch(0.97 0.02 330)",
      "--os-primary": "#e69f00",
      "--os-primary-fg": "oklch(0.15 0.05 295)",
      "--os-muted": "oklch(0.7 0.05 325)",
      "--os-accent": "#56b4e9",
      "--os-panel": "oklch(0.2484 0.0464 299.2)",
      "--os-chrome": "oklch(0.3796 0.0416 304.8)",
      "--os-line": "oklch(0.478 0.038 309)",
      "--os-danger": "#ff8a70",
      ...SOFT_WINDOW,
      "--os-win-primary": "#e69f00",
      "--os-win-primary-fg": "#17191b",
    },
  },
];

/** A theme by id; an unknown id is 404 Night. */
export function osTheme(id: string | null | undefined): OsThemeDef {
  return OS_THEMES_DEF.find((t) => t.id === id) ?? OS_THEMES_DEF[0]!;
}

/**
 * The desktop's decoration under a theme and the Effects off switch: what the
 * shell draws (the CRT surface, the wordmark, the boot screen, the peeking
 * cat) and what it leaves out of the page.
 */
export function osEffects(theme: OsTheme, effectsOff: boolean): OsThemeEffects {
  return effectsOff ? "none" : osTheme(theme).effects;
}

/**
 * The themes as CSS: 404 Night on `:root` (every page has the OS variables,
 * as before themes), and each theme on `[data-os-theme="…"]`, which the
 * desktop root and, through the head script, <html> carry.
 */
export function osThemeCss(): string {
  return OS_THEMES_DEF.map((theme) => {
    const selector =
      theme.id === "night"
        ? `:root,[data-os-theme="night"]`
        : `[data-os-theme="${theme.id}"]`;
    const body = OS_THEME_TOKENS.map(
      (token) => `${token}:${theme.colours[token]}`,
    ).join(";");
    return `${selector}{${body}}`;
  }).join("\n");
}
