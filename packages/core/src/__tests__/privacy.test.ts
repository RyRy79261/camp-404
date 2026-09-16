import { describe, expect, it } from "vitest";

import {
  ALWAYS_PRIVATE,
  SAFETY_VISIBLE,
  isFieldLocked,
  isSafetyVisible,
} from "../privacy";

describe("ALWAYS_PRIVATE", () => {
  it("names the government ID answer key and both encrypted ID columns", () => {
    // `id.number` is ID_NUMBER_KEY in @camp404/db/id-documents; the columns are
    // users.passport_encrypted / users.sa_id_encrypted.
    expect(ALWAYS_PRIVATE.has("id.number")).toBe(true);
    expect(ALWAYS_PRIVATE.has("passportEncrypted")).toBe(true);
    expect(ALWAYS_PRIVATE.has("saIdEncrypted")).toBe(true);
  });

  it("names the EFT details column", () => {
    expect(ALWAYS_PRIVATE.has("eftDetailsEncrypted")).toBe(true);
  });

  it("does not swallow ordinary self-expression answers", () => {
    expect(ALWAYS_PRIVATE.has("bio.statement")).toBe(false);
    expect(ALWAYS_PRIVATE.has("ideas.this_year")).toBe(false);
    // id.type is not sensitive and deliberately stays in `responses`.
    expect(ALWAYS_PRIVATE.has("id.type")).toBe(false);
  });
});

describe("SAFETY_VISIBLE", () => {
  it("names all three emergency fields", () => {
    expect(isSafetyVisible("emergencyContacts")).toBe(true);
    expect(isSafetyVisible("allergies")).toBe(true);
    expect(isSafetyVisible("isAnaphylactic")).toBe(true);
    expect(SAFETY_VISIBLE.size).toBe(3);
  });

  it("does not classify a private field as safety-visible", () => {
    expect(isSafetyVisible("id.number")).toBe(false);
  });
});

describe("isFieldLocked", () => {
  it("locks an always-private key regardless of the descriptor", () => {
    expect(isFieldLocked("id.number")).toBe(true);
    expect(isFieldLocked("id.number", { locked: false })).toBe(true);
    expect(isFieldLocked("eftDetailsEncrypted", {})).toBe(true);
  });

  it("honours the author's lock on any other field", () => {
    expect(isFieldLocked("bio.statement", { locked: true })).toBe(true);
    expect(isFieldLocked("bio.statement", { locked: false })).toBe(false);
    expect(isFieldLocked("bio.statement")).toBe(false);
  });

  it("leaves safety-visible fields unlocked by default", () => {
    expect(isFieldLocked("allergies")).toBe(false);
    expect(isFieldLocked("emergencyContacts")).toBe(false);
  });
});
