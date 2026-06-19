import { describe, expect, it } from "vitest";

import { initialsFrom, slugify } from "../text-utils";

describe("initialsFrom", () => {
  it("returns '?' for null input", () => {
    expect(initialsFrom(null)).toBe("?");
  });

  it("returns '?' for an empty string", () => {
    expect(initialsFrom("")).toBe("?");
  });

  it("returns '?' for whitespace-only input", () => {
    expect(initialsFrom("   ")).toBe("?");
  });

  it("takes the single initial from one word", () => {
    expect(initialsFrom("jane")).toBe("J");
  });

  it("takes the first and last-ish initials from a multi-word name", () => {
    expect(initialsFrom("Jane Doe")).toBe("JD");
  });

  it("caps at two initials even with three or more words", () => {
    expect(initialsFrom("Jane Mary Doe")).toBe("JM");
  });

  it("trims and collapses surrounding/internal whitespace", () => {
    expect(initialsFrom("  jane   doe  ")).toBe("JD");
  });

  it("splits an email-like source on '@' and '.'", () => {
    expect(initialsFrom("jane.doe@example.com")).toBe("JD");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Burner Profile")).toBe("burner-profile");
  });

  it("collapses runs of punctuation/space into single hyphens, trimmed", () => {
    expect(slugify("  2026 — Dietary  Survey!! ")).toBe("2026-dietary-survey");
  });

  it("strips diacritics", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  it("returns '' when there is nothing usable (caller supplies a fallback)", () => {
    expect(slugify("—  !! ")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("caps length", () => {
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});
