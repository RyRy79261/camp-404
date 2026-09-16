import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getMemberExportExtras } from "../member-export";
import * as schema from "../schema";

// The export's extra columns on real rows: what each rank's options select,
// and that a column a viewer may not read comes back empty rather than filled.

describe("getMemberExportExtras", () => {
  const h = useTestDb();

  async function seed() {
    const db = h.db();
    const member = await makeUser(db, {
      emergencyContacts: [
        { name: "Sam", phone: "+27 82 000 0000", relationship: "Sister" },
      ],
      passportEncrypted: "cipher-passport",
    });
    await db.insert(schema.burnerProfiles).values({
      userId: member.id,
      version: "1",
      responses: {
        country: "ZA",
        "dietary.allergies": ["peanuts"],
        "dietary.notes": "Carries an EpiPen.",
      },
    });
    await db.insert(schema.dietaryRequirements).values({
      userId: member.id,
      version: "1",
      allergies: "shellfish",
      isAnaphylactic: true,
    });
    const system = await makeUser(db, { isSystem: true });
    const erased = await makeUser(db, { sanitised: true });
    return { member, system, erased };
  }

  it("selects nothing for a plain member", async () => {
    await seed();
    expect(
      await getMemberExportExtras({ safety: false, captain: false }),
    ).toEqual([]);
  });

  it("gives a team lead safety data and no ID or arrival", async () => {
    const { member, system, erased } = await seed();

    const rows = await getMemberExportExtras({ safety: true, captain: false });

    expect(rows.map((r) => r.userId)).toEqual([member.id]);
    expect(rows).not.toContainEqual(
      expect.objectContaining({ userId: system.id }),
    );
    expect(rows).not.toContainEqual(
      expect.objectContaining({ userId: erased.id }),
    );
    expect(rows[0]).toMatchObject({
      emergencyContacts: [
        { name: "Sam", phone: "+27 82 000 0000", relationship: "Sister" },
      ],
      dietaryAllergies: ["peanuts"],
      dietaryNotes: "Carries an EpiPen.",
      allergies: "shellfish",
      isAnaphylactic: true,
      passportEncrypted: null,
      saIdEncrypted: null,
      arrivalAt: null,
    });
  });

  it("adds the ID ciphertext for a captain", async () => {
    const { member } = await seed();

    const [row] = await getMemberExportExtras({ safety: true, captain: true });

    expect(row).toMatchObject({
      userId: member.id,
      passportEncrypted: "cipher-passport",
      isAnaphylactic: true,
    });
  });
});
