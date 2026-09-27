import { describe, expect, it } from "vitest";
import {
  DesktopPreferences,
  DesktopPreferencesPatch,
  OS_THEMES,
  defaultDesktopPreferences,
  parseStoredDesktopPreferences,
} from "../desktop-preferences";

describe("desktop preferences", () => {
  const SAVED = {
    theme: "high-contrast",
    biggerText: true,
    effectsOff: true,
    oneClickOpen: true,
    welcomeSeenAt: "2026-09-27T08:00:00.000Z",
  } as const;

  it("defaults to 404 Night, every switch off, the welcome not seen", () => {
    expect(defaultDesktopPreferences()).toEqual({
      theme: "night",
      biggerText: false,
      effectsOff: false,
      oneClickOpen: false,
      welcomeSeenAt: null,
    });
    expect(OS_THEMES[0]).toBe("night");
  });

  it("gives a fresh object each call", () => {
    const a = defaultDesktopPreferences();
    a.theme = "calm";
    expect(defaultDesktopPreferences().theme).toBe("night");
  });

  it("accepts a whole value and refuses an unknown key or theme", () => {
    expect(DesktopPreferences.safeParse(SAVED).success).toBe(true);
    expect(DesktopPreferences.safeParse({ ...SAVED, extra: 1 }).success).toBe(
      false,
    );
    expect(
      DesktopPreferences.safeParse({ ...SAVED, theme: "neon" }).success,
    ).toBe(false);
  });

  it("reads back what was stored", () => {
    expect(parseStoredDesktopPreferences(SAVED)).toEqual(SAVED);
  });

  it("reads nothing, or something that is not an object, as the defaults", () => {
    for (const raw of [null, undefined, "calm", 3, [], true]) {
      expect(parseStoredDesktopPreferences(raw)).toEqual(
        defaultDesktopPreferences(),
      );
    }
  });

  it("reads each bad field as its default and keeps the good ones", () => {
    expect(
      parseStoredDesktopPreferences({
        theme: "neon",
        biggerText: "yes",
        effectsOff: true,
        oneClickOpen: 1,
        welcomeSeenAt: "yesterday",
        extra: "ignored",
      }),
    ).toEqual({
      theme: "night",
      biggerText: false,
      effectsOff: true,
      oneClickOpen: false,
      welcomeSeenAt: null,
    });
  });

  it("a patch: one or more of the member's own choices, never the seen time", () => {
    expect(DesktopPreferencesPatch.safeParse({ theme: "calm" }).success).toBe(
      true,
    );
    expect(DesktopPreferencesPatch.safeParse({}).success).toBe(false);
    expect(
      DesktopPreferencesPatch.safeParse({ welcomeSeenAt: SAVED.welcomeSeenAt })
        .success,
    ).toBe(false);
    expect(
      DesktopPreferencesPatch.safeParse({ biggerText: "on" }).success,
    ).toBe(false);
  });
});
