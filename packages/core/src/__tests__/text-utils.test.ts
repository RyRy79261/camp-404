import { describe, expect, it } from "vitest";

import {
  defaultTeamLabel,
  humanizeKey,
  initialsFrom,
  slugify,
} from "../text-utils";

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

describe("humanizeKey", () => {
  it("capitalises each word and keeps connectives lower case", () => {
    expect(humanizeKey("art_and_activities")).toBe("Art and Activities");
    expect(humanizeKey("ministry_of_memes")).toBe("Ministry of Memes");
  });

  it("capitalises an initialism whole, so a team reads as its label does", () => {
    expect(humanizeKey("communications_and_hr")).toBe("Communications and HR");
  });

  it("leaves a word that only contains the initialism alone", () => {
    expect(humanizeKey("shrubs")).toBe("Shrubs");
  });
});

describe("defaultTeamLabel", () => {
  it("names a team whose key outlived its name by its new name", () => {
    // Water became its own team; the old key is Sanitation and MOOP.
    expect(defaultTeamLabel("sanitation_and_water")).toBe(
      "Sanitation and MOOP",
    );
    expect(defaultTeamLabel("health_and_safety")).toBe("Safety");
    expect(defaultTeamLabel("communications_and_hr")).toBe(
      "Communications & HR",
    );
    expect(defaultTeamLabel("water")).toBe("Water");
  });

  it("humanises a key it has no label for", () => {
    expect(defaultTeamLabel("fire_and_flow")).toBe("Fire and Flow");
  });
});
