import { describe, expect, it } from "vitest";
import {
  MEMBER_EXPORT_COLUMNS,
  memberExportColumnsFor,
} from "../member-export";
import { MEMBER_FIELD_READERS } from "../privacy";

// The owner's ruling, as columns: members get what the member roster shows,
// team leads add safety data, captains get everything.

const keys = (rank: "camp_member" | "team_lead" | "captain") =>
  memberExportColumnsFor(rank).map((c) => c.key);

describe("memberExportColumnsFor", () => {
  it("gives a member the member roster's fields and never an email", () => {
    expect(keys("camp_member")).toEqual([
      "name",
      "handle",
      "rank",
      "teams",
      "country",
    ]);
  });

  it("adds safety data for a team lead, and nothing captain-only", () => {
    expect(keys("team_lead")).toEqual([
      "name",
      "handle",
      "rank",
      "teams",
      "country",
      "emergency_contact_1",
      "emergency_contact_2",
      "allergies",
      "anaphylactic",
      "food_dislikes",
      "dietary_notes",
    ]);
  });

  it("gives a captain every column, including email and ID numbers", () => {
    expect(keys("captain")).toEqual(MEMBER_EXPORT_COLUMNS.map((c) => c.key));
    expect(keys("captain")).toEqual(
      expect.arrayContaining(["email", "id_number", "arrival", "dues_paid"]),
    );
  });

  it("builds every column from a field the field list knows", () => {
    // A misspelt source would be unlisted, so it would silently read as
    // captain-only instead of failing loudly.
    const unknown = MEMBER_EXPORT_COLUMNS.flatMap((c) => c.sources).filter(
      (s) => !s.startsWith("answer:") && !(s in MEMBER_FIELD_READERS),
    );
    expect(unknown).toEqual([]);
  });

  it("has one header per key", () => {
    const k = MEMBER_EXPORT_COLUMNS.map((c) => c.key);
    expect(new Set(k).size).toBe(k.length);
  });
});
