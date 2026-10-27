import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getProfileFacts } from "../burner-profile";
import * as schema from "../schema";

// What "Your profile isn't finished" reads (owner's mock-up, step 6), from the
// member's own row in one query.

describe("getProfileFacts", () => {
  const h = useTestDb();

  it("reads the gaps from the member's own row", async () => {
    const db = h.db();
    const bare = await makeUser(db, { displayName: "nova@example.com" });
    expect(await getProfileFacts(bare.id)).toEqual({
      approved: true,
      held: false,
      displayName: "nova@example.com",
      telegramHandle: null,
      telegramConnected: false,
      hasEmergencyContact: false,
    });

    const done = await makeUser(db, {
      displayName: "Nova",
      telegramHandle: "nova",
      telegramDmAt: new Date(),
      emergencyContacts: [
        { name: "Ma", phone: "+27 82 000 0000", relationship: "Mother" },
      ],
    });
    expect(await getProfileFacts(done.id)).toMatchObject({
      telegramHandle: "nova",
      telegramConnected: true,
      hasEmergencyContact: true,
    });
  });

  it("says when the member is held or not approved yet", async () => {
    const db = h.db();
    const held = await makeUser(db);
    await db.insert(schema.requiredActions).values({
      userId: held.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Burner profile",
      blocking: true,
    });
    const pending = await makeUser(db, { approvalStatus: "pending" });
    // A non-blocking pending row does not hold anyone.
    const nudged = await makeUser(db);
    await db.insert(schema.requiredActions).values({
      userId: nudged.id,
      type: "questionnaire",
      actionKey: "gear_order",
      title: "Gear",
      blocking: false,
    });

    expect(await getProfileFacts(held.id)).toMatchObject({ held: true });
    expect(await getProfileFacts(pending.id)).toMatchObject({
      approved: false,
    });
    expect(await getProfileFacts(nudged.id)).toMatchObject({ held: false });
  });
});
