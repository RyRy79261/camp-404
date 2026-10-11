import { describe, expect, it } from "vitest";
import {
  PET_MODULE_KEYS,
  PET_PORTRAITS,
  isPetModuleKey,
  petPortraitRects,
  trimSprite,
} from "./portraits";

describe("the pet portrait registry", () => {
  it("starts with the four cats that are in, under their stored keys", () => {
    expect(PET_MODULE_KEYS).toEqual(["jinn", "moda", "nipster", "prince"]);
  });

  it("uses keys the database accepts (lower-case words and dashes)", () => {
    for (const key of PET_MODULE_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9-]{0,39}$/);
    }
  });

  it("knows its own keys and nothing else", () => {
    expect(isPetModuleKey("jinn")).toBe(true);
    expect(isPetModuleKey("toString")).toBe(false);
    expect(isPetModuleKey("biscuit")).toBe(false);
    expect(isPetModuleKey(undefined)).toBe(false);
  });

  it("gives every letter in every picture a colour", () => {
    for (const key of PET_MODULE_KEYS) {
      const { sprite, palette } = PET_PORTRAITS[key];
      const letters = new Set(sprite.join("").replaceAll(".", ""));
      for (const ch of letters)
        expect(palette[ch], `${key}: ${ch}`).toBeTruthy();
    }
  });
});

describe("trimSprite", () => {
  it("cuts empty rows and columns from every side", () => {
    expect(trimSprite(["....", ".AB.", "..C.", "...."])).toEqual(["AB", ".C"]);
    expect(trimSprite(["...", "..."])).toEqual([]);
  });
});

describe("petPortraitRects", () => {
  it("draws each pet's picture, trimmed, as coloured rows of pixels", () => {
    for (const key of PET_MODULE_KEYS) {
      const art = petPortraitRects(key)!;
      expect(art.rects.length).toBeGreaterThan(10);
      for (const r of art.rects) {
        expect(r.x + r.w).toBeLessThanOrEqual(art.width);
        expect(r.y).toBeLessThan(art.height);
        expect(r.fill).toBeTruthy();
      }
      // Trimmed: something is drawn on the first and last row and column.
      expect(art.rects.some((r) => r.y === 0)).toBe(true);
      expect(art.rects.some((r) => r.y === art.height - 1)).toBe(true);
      expect(art.rects.some((r) => r.x === 0)).toBe(true);
      expect(art.rects.some((r) => r.x + r.w === art.width)).toBe(true);
    }
  });

  it("draws nothing for a key the code has no picture for", () => {
    expect(petPortraitRects("biscuit")).toBeNull();
  });
});
