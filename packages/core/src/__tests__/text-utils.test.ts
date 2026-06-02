import { describe, expect, it } from "vitest";

import { initialsFrom } from "../text-utils";

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
