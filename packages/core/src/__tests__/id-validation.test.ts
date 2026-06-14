import { describe, expect, it } from "vitest";

import { validateIdNumber } from "../id-validation";

// Valid SA IDs (date prefix passes + SA Home Affairs Luhn check digit matches).
// Derived from the implementation, not assumed:
//   9001015009086 → YYMMDD 900101 (1 Jan), check digit 6
//   8506150123006 → YYMMDD 850615 (15 Jun), check digit 6
const VALID_SA_ID = "9001015009086";
const VALID_SA_ID_2 = "8506150123006";

describe("validateIdNumber — type handling", () => {
  it("rejects empty / whitespace-only input before looking at type", () => {
    expect(validateIdNumber("sa_id", "")).toEqual({
      ok: false,
      error: "Document number is required",
    });
    expect(validateIdNumber("passport", "   ")).toEqual({
      ok: false,
      error: "Document number is required",
    });
  });

  it("rejects null type (document type not picked yet)", () => {
    expect(validateIdNumber(null, "ABC123")).toEqual({
      ok: false,
      error: "Pick the ID document type first",
    });
  });

  it("rejects an unknown / unsupported type", () => {
    expect(validateIdNumber("drivers_license", "ABC123")).toEqual({
      ok: false,
      error: "Pick the ID document type first",
    });
  });
});

describe("validateIdNumber — passport branch", () => {
  it("accepts an alphanumeric run at the lower (6) and upper (12) bounds", () => {
    expect(validateIdNumber("passport", "ABC123")).toEqual({ ok: true });
    expect(validateIdNumber("passport", "A1B2C3D4E5F6")).toEqual({ ok: true });
  });

  it("is case-insensitive (lowercase letters accepted)", () => {
    expect(validateIdNumber("passport", "abc123")).toEqual({ ok: true });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateIdNumber("passport", "  ABC123  ")).toEqual({ ok: true });
  });

  it("rejects too-short (<6) and too-long (>12) runs", () => {
    expect(validateIdNumber("passport", "AB123")).toEqual({
      ok: false,
      error: "Letters and digits only — typically 6–12 characters.",
    });
    expect(validateIdNumber("passport", "A1B2C3D4E5F6G")).toEqual({
      ok: false,
      error: "Letters and digits only — typically 6–12 characters.",
    });
  });

  it("rejects non-alphanumeric characters", () => {
    expect(validateIdNumber("passport", "ABC-12")).toEqual({
      ok: false,
      error: "Letters and digits only — typically 6–12 characters.",
    });
    expect(validateIdNumber("passport", "ABC 12")).toEqual({
      ok: false,
      error: "Letters and digits only — typically 6–12 characters.",
    });
  });
});

describe("validateIdNumber — SA ID branch", () => {
  it("accepts a 13-digit ID with valid date prefix and Luhn check", () => {
    expect(validateIdNumber("sa_id", VALID_SA_ID)).toEqual({ ok: true });
    expect(validateIdNumber("sa_id", VALID_SA_ID_2)).toEqual({ ok: true });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateIdNumber("sa_id", `  ${VALID_SA_ID}  `)).toEqual({
      ok: true,
    });
  });

  it("rejects the wrong length (not exactly 13 digits)", () => {
    expect(validateIdNumber("sa_id", "900101500908")).toEqual({
      ok: false,
      error: "Must be exactly 13 digits.",
    });
    expect(validateIdNumber("sa_id", "90010150090866")).toEqual({
      ok: false,
      error: "Must be exactly 13 digits.",
    });
  });

  it("rejects non-digit input of length 13", () => {
    expect(validateIdNumber("sa_id", "90010150090X6")).toEqual({
      ok: false,
      error: "Must be exactly 13 digits.",
    });
  });

  it("rejects an invalid YYMMDD date prefix (month out of range)", () => {
    // Month 13 — 13 digits, fails the date check before Luhn is reached.
    expect(validateIdNumber("sa_id", "9913015009086")).toEqual({
      ok: false,
      error: "First six digits aren't a valid YYMMDD date.",
    });
  });

  it("rejects an invalid YYMMDD date prefix (day out of range)", () => {
    // Day 00 — month 01 is fine, day fails.
    expect(validateIdNumber("sa_id", "9001005009086")).toEqual({
      ok: false,
      error: "First six digits aren't a valid YYMMDD date.",
    });
  });

  it("rejects a 13-digit ID with a valid date but a failing Luhn check digit", () => {
    // VALID_SA_ID with the check digit bumped 6 → 7.
    expect(validateIdNumber("sa_id", "9001015009087")).toEqual({
      ok: false,
      error: "Check digit doesn't match — double-check the number.",
    });
  });
});

describe("validateIdNumber — SA ID branch, impossible dates", () => {
  const DATE_ERROR = "First six digits aren't a valid YYMMDD date.";

  it("rejects a day that doesn't exist in its month", () => {
    // 30 Feb, 31 Apr, 31 Jun — the date check fires before Luhn, so any check
    // digit reaches it. (Each is 13 digits with an in-range month.)
    for (const id of ["9002305009086", "9004315009086", "8506310123006"]) {
      expect(validateIdNumber("sa_id", id)).toEqual({
        ok: false,
        error: DATE_ERROR,
      });
    }
  });

  it("rejects 29 Feb when neither century interpretation is a leap year", () => {
    // YY=01 → neither 1901 nor 2001 is a leap year, so 29 Feb is impossible.
    expect(validateIdNumber("sa_id", "0102295009086")).toEqual({
      ok: false,
      error: DATE_ERROR,
    });
  });

  it("accepts 29 Feb when a plausible century is a leap year", () => {
    // YY=00 → 2000 is a leap year, so 29 Feb is a real date (and the check
    // digit here is valid), so it must NOT be rejected.
    expect(validateIdNumber("sa_id", "0002295009084")).toEqual({ ok: true });
  });
});
