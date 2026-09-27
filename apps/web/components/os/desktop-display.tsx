"use client";

import {
  type CSSProperties,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DesktopPreferences,
  DesktopPreferencesPatch,
} from "@camp404/types/desktop-preferences";
import { GlitchWordmark } from "@camp404/os";
import { toast } from "@camp404/ui/components/toast";
import {
  markWelcomeSeenAction,
  saveDesktopPreferencesAction,
} from "@/app/(console)/desktop-preferences-actions";
import { osEffects, type OsThemeEffects } from "@/lib/os-themes";

// The member's display preferences on the desktop (issues #289 and #290): the
// theme and the switches the desktop root wears, "Open with one click", and
// the welcome wizard's open state. The server read them for the first paint
// (the console layout); a change applies here at once and is saved behind it.
// The Display page in My account and the wizard's "How it looks" step change
// them through this context, so the whole desktop is their live preview.

export interface DesktopDisplay {
  prefs: DesktopPreferences;
  /** What the desktop draws of its decoration now (lib/os-themes.ts). */
  effects: OsThemeEffects;
  /** Change some choices: shown at once, saved behind. */
  change: (patch: DesktopPreferencesPatch) => void;
  /**
   * Open the welcome wizard (Start > Welcome, or the Display page). Only a
   * full desktop has it; undefined on the restricted one.
   */
  openWelcome?: () => void;
  /** The wizard is open (the desktop draws it). */
  welcomeOpen: boolean;
  /** Close it: counts as seen, saved once. */
  closeWelcome: () => void;
}

export const DesktopDisplayContext = createContext<DesktopDisplay | null>(null);

/** The desktop's display, or null outside a desktop (a bare page). */
export function useDesktopDisplay(): DesktopDisplay | null {
  return useContext(DesktopDisplayContext);
}

/** The desktop root's attributes for a set of preferences. */
export function displayAttributes(prefs: DesktopPreferences) {
  return {
    "data-os-theme": prefs.theme,
    "data-os-text": prefs.biggerText ? "bigger" : undefined,
    "data-os-effects": prefs.effectsOff ? "off" : undefined,
  } as const;
}

/**
 * The desktop's display state. `welcome`: the desktop has the wizard (a full
 * desktop). It opens by itself when the member has never closed it, once per
 * page life; closing it in any way counts as seen.
 */
export function useDisplayState(initial: DesktopPreferences, welcome: boolean) {
  const welcomeOnArrival = welcome && initial.welcomeSeenAt === null;
  const [prefs, setPrefs] = useState(initial);
  const [welcomeOpen, setWelcomeOpen] = useState(welcomeOnArrival);
  // Marked once per page life, however many times it is closed.
  const marked = useRef(initial.welcomeSeenAt !== null);

  // Saves go one after another, in the order the member made them, so a
  // slow earlier save can never land after (and undo) a later one.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const change = useCallback((patch: DesktopPreferencesPatch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    saving.current = saving.current.then(() =>
      saveDesktopPreferencesAction(patch).then(
        (result) => {
          if (!result.ok) toast.error(result.error);
        },
        () => toast.error("Your display settings couldn't be saved."),
      ),
    );
  }, []);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);
  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    if (marked.current) return;
    marked.current = true;
    setPrefs((p) => ({ ...p, welcomeSeenAt: new Date().toISOString() }));
    // Not worth a toast when it fails: at worst it opens once more.
    void markWelcomeSeenAction().catch(() => {});
  }, []);

  const effects = osEffects(prefs.theme, prefs.effectsOff);
  return useMemo<DesktopDisplay>(
    () => ({
      prefs,
      effects,
      change,
      openWelcome: welcome ? openWelcome : undefined,
      welcomeOpen: welcome && welcomeOpen,
      closeWelcome,
    }),
    [prefs, effects, change, welcome, openWelcome, welcomeOpen, closeWelcome],
  );
}

/** The sub line under the wallpaper's wordmark, desktop and phone alike. */
export const OS_SUBLINE = "The lost clutter of imagination";

/**
 * The wallpaper's wordmark as the theme wants it: glitched under 404 Night and
 * Colour-blind safe; held still otherwise (Calm, High contrast, Effects off),
 * the glitched one's base letters alone, no colour copies, no tears, nothing
 * moving. Drawn by CSS from `data-text` either way, so never page text.
 */
export function OsWordmark({ text, size }: { text: string; size: string }) {
  const display = useDesktopDisplay();
  if (!display || display.effects === "full") {
    return <GlitchWordmark text={text} size={size} />;
  }
  return (
    <div
      aria-hidden
      data-os-wordmark-still
      className="relative select-none leading-none"
      style={{ "--glitch-size": size } as CSSProperties}
    >
      <span className="os-glitch-base" data-text={text} />
    </div>
  );
}
