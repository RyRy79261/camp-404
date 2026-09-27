import { z } from "zod";

// A member's 404 OS display preferences (docs/specs/2026-09-26-404-os-welcome-
// and-themes.md, issues #289 and #290): the system theme, the two switches
// beside it, "Open with one click", and when they last closed the welcome
// wizard. Stored on the server beside the desktop layout
// (`desktop_layouts.preferences`), so a choice follows the member to a new
// device.
//
// Checked with the strict schema on every write. On read each field is
// checked on its own: a field that is not what it should be (an older
// shape, a hand edit) reads as its default, and the rest still count. None of
// it is authority: a theme only changes colours and effects, never what a
// member may open.

/** The system themes, in the order the picker lists them. */
export const OS_THEMES = [
  "night",
  "calm",
  "high-contrast",
  "colour-blind",
] as const;
export type OsTheme = (typeof OS_THEMES)[number];

/** The default theme: the approved look (owner, 2026-09-26). */
export const DEFAULT_OS_THEME: OsTheme = "night";

export const OsThemeSchema = z.enum(OS_THEMES);

export const DesktopPreferences = z
  .object({
    theme: OsThemeSchema,
    /** Text one step bigger, the pixel face's smallest sizes too. */
    biggerText: z.boolean(),
    /** No CRT surface, glitch, boot, power-on or peeking cat. */
    effectsOff: z.boolean(),
    /** Icons open on a single click (the phone always opens on one tap). */
    oneClickOpen: z.boolean(),
    /** When the member last closed the welcome wizard; null for never. */
    welcomeSeenAt: z.string().datetime().nullable(),
  })
  .strict();
export type DesktopPreferences = z.infer<typeof DesktopPreferences>;

/**
 * What a member may change themselves: the look and the one-click choice.
 * `welcomeSeenAt` is stamped by the server when the wizard is closed, never
 * sent by the client. Unknown keys are refused.
 */
export const DesktopPreferencesPatch = DesktopPreferences.pick({
  theme: true,
  biggerText: true,
  effectsOff: true,
  oneClickOpen: true,
})
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nothing to change.",
  });
export type DesktopPreferencesPatch = z.infer<typeof DesktopPreferencesPatch>;

/** Nothing chosen yet. A fresh object each call. */
export function defaultDesktopPreferences(): DesktopPreferences {
  return {
    theme: DEFAULT_OS_THEME,
    biggerText: false,
    effectsOff: false,
    oneClickOpen: false,
    welcomeSeenAt: null,
  };
}

/**
 * A stored value as preferences. Nothing stored, or not an object, is the
 * defaults; otherwise each field that fails its own check is its default.
 */
export function parseStoredDesktopPreferences(
  raw: unknown,
): DesktopPreferences {
  const prefs = defaultDesktopPreferences();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return prefs;
  }
  const value = raw as Record<string, unknown>;
  const shape = DesktopPreferences.shape;
  const theme = shape.theme.safeParse(value.theme);
  if (theme.success) prefs.theme = theme.data;
  for (const key of ["biggerText", "effectsOff", "oneClickOpen"] as const) {
    const flag = shape[key].safeParse(value[key]);
    if (flag.success) prefs[key] = flag.data;
  }
  const seen = shape.welcomeSeenAt.safeParse(value.welcomeSeenAt);
  if (seen.success) prefs.welcomeSeenAt = seen.data;
  return prefs;
}
