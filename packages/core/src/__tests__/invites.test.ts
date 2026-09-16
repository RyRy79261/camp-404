import { describe, expect, it } from "vitest";

import {
  CODE_RULES_HINT,
  generateInviteCode,
  isSyntacticallyValidCode,
  normalizeInviteCode,
} from "../invites";

describe("generateInviteCode", () => {
  it("produces a 3-segment lowercase hyphenated slug that passes validation", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
      expect(isSyntacticallyValidCode(code)).toBe(true);
    }
  });
});

describe("isSyntacticallyValidCode", () => {
  it("accepts lowercase letters / digits / single hyphens, length 3-48", () => {
    expect(isSyntacticallyValidCode("neon-toaster-mongoose")).toBe(true);
    expect(isSyntacticallyValidCode("abc")).toBe(true);
    expect(isSyntacticallyValidCode("a1-b2-c3")).toBe(true);
  });

  it("rejects bad length / chars / hyphen placement", () => {
    expect(isSyntacticallyValidCode("ab")).toBe(false); // too short
    expect(isSyntacticallyValidCode("a".repeat(49))).toBe(false); // too long
    expect(isSyntacticallyValidCode("Neon-Toaster")).toBe(false); // uppercase
    expect(isSyntacticallyValidCode("neon toaster")).toBe(false); // space
    expect(isSyntacticallyValidCode("-neon")).toBe(false); // leading hyphen
    expect(isSyntacticallyValidCode("neon-")).toBe(false); // trailing hyphen
    expect(isSyntacticallyValidCode("neon--toaster")).toBe(false); // double hyphen
  });
});

describe("normalizeInviteCode", () => {
  it("trims and lowercases, so a phone's capital first letter still redeems", () => {
    expect(normalizeInviteCode("  Meowzit ")).toBe("meowzit");
    expect(normalizeInviteCode("TEST-INVITE")).toBe("test-invite");
    expect(isSyntacticallyValidCode(normalizeInviteCode("Amber-Fox-7"))).toBe(
      true,
    );
    expect(normalizeInviteCode("   ")).toBe("");
  });
});

describe("CODE_RULES_HINT", () => {
  it("documents the 3-48 char rule", () => {
    expect(CODE_RULES_HINT).toContain("3–48");
  });
});
