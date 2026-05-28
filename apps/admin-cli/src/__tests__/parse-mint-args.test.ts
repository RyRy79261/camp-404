import { describe, expect, it } from "vitest";
import { parseMintArgs } from "../parse-mint-args";

describe("parseMintArgs", () => {
  it("requires --code", () => {
    expect(() => parseMintArgs([])).toThrow(/--code is required/);
    expect(() => parseMintArgs(["--note", "no-code-here"])).toThrow(
      /--code is required/,
    );
  });

  it("parses the bare minimum (code only) with null defaults for optionals", () => {
    expect(parseMintArgs(["--code", "BERLIN24"])).toEqual({
      code: "BERLIN24",
      createdByUserId: null,
      note: null,
      maxUses: null,
      expiresAt: null,
      assignedRank: null,
    });
  });

  it("parses --assigns-rank captain to auto-promote the redeemer", () => {
    const parsed = parseMintArgs([
      "--code",
      "CAPTAIN-MEOW",
      "--assigns-rank",
      "captain",
    ]);
    expect(parsed.assignedRank).toBe("captain");
  });

  it("rejects an invalid --assigns-rank value", () => {
    expect(() =>
      parseMintArgs(["--code", "X", "--assigns-rank", "admin"]),
    ).toThrow(/--assigns-rank must be 'captain' or 'member'/);
  });

  it("parses every optional field, coercing --max-uses to a number and --expires-at to a Date", () => {
    const parsed = parseMintArgs([
      "--code",
      "BERLIN24",
      "--created-by",
      "00000000-0000-0000-0000-000000000001",
      "--note",
      "Berlin crew",
      "--max-uses",
      "5",
      "--expires-at",
      "2026-06-01",
    ]);
    expect(parsed.code).toBe("BERLIN24");
    expect(parsed.createdByUserId).toBe("00000000-0000-0000-0000-000000000001");
    expect(parsed.note).toBe("Berlin crew");
    expect(parsed.maxUses).toBe(5);
    expect(parsed.expiresAt).toBeInstanceOf(Date);
    expect(parsed.expiresAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("rejects a flag with no value (e.g. trailing --note with nothing after)", () => {
    expect(() => parseMintArgs(["--code", "X", "--note"])).toThrow(
      /Missing value for --note/,
    );
  });

  it("rejects a flag followed by another flag instead of a value", () => {
    expect(() =>
      parseMintArgs(["--code", "--note", "oops"]),
    ).toThrow(/Missing value for --code/);
  });
});
