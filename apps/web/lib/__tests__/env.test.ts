import { describe, expect, it } from "vitest";
import { assertServerEnv } from "@/lib/env";

// Guards the boot-time check that turns a missing PGCRYPTO_KEY from a silent
// mid-onboarding failure into a loud startup error. The motivating bug:
// without the key, the questionnaire save that encrypts the ID number threw
// and the member was stuck between pages with no feedback.

const KEY = "PGCRYPTO_KEY";
const VALID = "a".repeat(32);

describe("assertServerEnv", () => {
  it("passes when all required vars are present and valid", () => {
    expect(() => assertServerEnv({ [KEY]: VALID })).not.toThrow();
  });

  it("throws when PGCRYPTO_KEY is missing", () => {
    expect(() => assertServerEnv({})).toThrow(/PGCRYPTO_KEY/);
  });

  it("throws when PGCRYPTO_KEY is too short", () => {
    expect(() => assertServerEnv({ [KEY]: "tooshort" })).toThrow(
      /too short/,
    );
  });

  it("treats an empty string as not set", () => {
    expect(() => assertServerEnv({ [KEY]: "" })).toThrow(/is not set/);
  });

  // Pin the 16-char floor (env.ts mirrors crypto.ts getKey's `< 16`): exactly
  // 16 passes, 15 fails. Guards against an off-by-one drift between the two.
  it("accepts a key at exactly the 16-char minimum", () => {
    expect(() => assertServerEnv({ [KEY]: "a".repeat(16) })).not.toThrow();
  });

  it("throws for a 15-char key (one below the minimum)", () => {
    expect(() => assertServerEnv({ [KEY]: "a".repeat(15) })).toThrow(
      /too short/,
    );
  });

  it("is a no-op under E2E test mode (the in-memory backend never encrypts)", () => {
    expect(() =>
      assertServerEnv({ E2E_TEST_MODE: "1" }),
    ).not.toThrow();
  });

  describe("E2E test mode", () => {
    // The flag enables /api/test/login, which signs anyone in as anyone.
    it("skips the secrets for a local or CI test run", () => {
      expect(() =>
        assertServerEnv({ E2E_TEST_MODE: "1", NODE_ENV: "development" }),
      ).not.toThrow();
      expect(() =>
        assertServerEnv({ E2E_TEST_MODE: "1", NODE_ENV: "production", CI: "true" }),
      ).not.toThrow();
    });

    it("refuses to boot on a Vercel deploy", () => {
      for (const VERCEL_ENV of ["production", "preview"]) {
        expect(() =>
          assertServerEnv({ E2E_TEST_MODE: "1", VERCEL_ENV, [KEY]: VALID }),
        ).toThrow(/E2E_TEST_MODE=1 is set on a deployed server/);
      }
    });

    it("refuses a production server outside CI", () => {
      expect(() =>
        assertServerEnv({ E2E_TEST_MODE: "1", NODE_ENV: "production" }),
      ).toThrow(/E2E_TEST_MODE/);
    });
  });
});
