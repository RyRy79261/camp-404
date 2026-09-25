import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOIN_CONTENT,
  JoinSections,
  JoinSiteContent,
  resolveJoinContent,
} from "../join-site";

describe("join site content", () => {
  it("the owner's approved copy is valid content", () => {
    expect(JoinSiteContent.safeParse(DEFAULT_JOIN_CONTENT).success).toBe(true);
  });

  it("reads a stored document, keeping good sections and defaulting bad ones", () => {
    const stored = {
      map: { where: "Block 7", lines: ["Near the big dune."] },
      fee: { currency: "USD", tiers: [] },
    };
    const read = resolveJoinContent(stored);
    expect(read.map.where).toBe("Block 7");
    // A dollar-currency fee is refused, so the fee falls back whole.
    expect(read.fee).toEqual(DEFAULT_JOIN_CONTENT.fee);
    expect(read.readme).toEqual(DEFAULT_JOIN_CONTENT.readme);
  });

  it("reads nothing as the defaults", () => {
    expect(resolveJoinContent(null)).toEqual(DEFAULT_JOIN_CONTENT);
  });

  it("refuses a minimum above the full camp", () => {
    const bad = { capacity: { min: 60, max: 50 }, counting: "x" };
    expect(JoinSections.crew.safeParse(bad).success).toBe(false);
  });
});
