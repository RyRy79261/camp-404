import { describe, expect, it } from "vitest";
import type { ParticipationStatus } from "@camp404/types";
import { listSheetAllergies } from "../daily-sheet";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The daily site sheet's allergy line (#249) on a real Postgres (PGlite):
// the allergies of members who are coming this year only, with words or the
// severe flag; never a member who is not coming, not approved or erased.

const YEAR = 2027;

describe("listSheetAllergies", () => {
  const h = useTestDb();

  async function member(
    displayName: string,
    status: ParticipationStatus | null,
    dietary: { allergies?: string | null; isAnaphylactic?: boolean } | null,
    overrides: Partial<typeof schema.users.$inferInsert> = {},
  ) {
    const db = h.db();
    const user = await makeUser(db, { displayName, ...overrides });
    if (status) {
      await db.insert(schema.campParticipations).values({
        userId: user.id,
        cycle: YEAR,
        status,
        intent: "yes",
      });
    }
    if (dietary) {
      await db.insert(schema.dietaryRequirements).values({
        userId: user.id,
        version: "test",
        allergies: dietary.allergies ?? null,
        isAnaphylactic: dietary.isAnaphylactic ?? false,
      });
    }
    return user;
  }

  it("lists the coming members' allergies, and nobody else's", async () => {
    const thandi = await member("Thandi Nkosi", "applied", {
      allergies: "No egg",
    });
    const megan = await member("Megan Smit", "accepted", {
      allergies: null,
      isAnaphylactic: true,
    });
    // Coming, but nothing to say.
    await member("Kyle Jacobs", "accepted", { allergies: "  " });
    // Not coming, or only maybe.
    await member("Aisha Patel", "not_attending", { allergies: "Gluten" });
    await member("Ben Maybe", "maybe", { allergies: "Nuts" });
    // Coming another year only.
    const other = await member("Pat Other", null, { allergies: "Shellfish" });
    await h
      .db()
      .insert(schema.campParticipations)
      .values({
        userId: other.id,
        cycle: YEAR - 1,
        status: "accepted",
        intent: "yes",
      });
    // Not approved.
    await member(
      "Pending Person",
      "applied",
      { allergies: "Soy" },
      { approvalStatus: "pending" },
    );

    const rows = await listSheetAllergies(YEAR);
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [thandi.id, megan.id].sort(),
    );
    expect(rows.find((r) => r.userId === megan.id)).toMatchObject({
      allergies: null,
      isAnaphylactic: true,
    });
  });
});
