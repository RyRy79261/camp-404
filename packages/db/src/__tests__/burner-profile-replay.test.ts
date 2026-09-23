import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser, requiredActionsFor } from "./_factories";
import { saveBurnerProfileReplay } from "../burner-profile";
import * as schema from "../schema";

// A My forms replay writes the answers, the ID, the contacts, the gate and the
// change-log row in one transaction, on real rows.

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const ADA = {
  name: "Ada Byron",
  phone: "+27 82 555 0199",
  relationship: "sister",
};

describe("saveBurnerProfileReplay", () => {
  const h = useTestDb();

  async function seed() {
    const db = h.db();
    const member = await makeUser(db);
    await db.insert(schema.burnerProfiles).values({
      userId: member.id,
      version: "v9",
      responses: { "bio.statement": "Before" },
      completedAt: new Date("2026-03-01T10:00:00Z"),
    });
    await db.insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
      version: "v10",
    });
    return member;
  }

  async function profileOf(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.burnerProfiles)
      .where(eq(schema.burnerProfiles.userId, userId));
    return row!;
  }

  async function userOf(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return row!;
  }

  async function editsOf(userId: string) {
    return h
      .db()
      .select()
      .from(schema.questionnaireEdits)
      .where(eq(schema.questionnaireEdits.userId, userId));
  }

  it("sets the Telegram handle, leaves it when not given, and clears it on null", async () => {
    const member = await seed();
    const replay = (telegramHandle?: string | null) =>
      saveBurnerProfileReplay({
        userId: member.id,
        version: "v10",
        responses: {},
        idColumns: null,
        emergencyContacts: [],
        edit: null,
        ...(telegramHandle === undefined ? {} : { telegramHandle }),
      });

    await replay("nova_reyes");
    expect((await userOf(member.id)).telegramHandle).toBe("nova_reyes");
    await replay();
    expect((await userOf(member.id)).telegramHandle).toBe("nova_reyes");
    await replay(null);
    expect((await userOf(member.id)).telegramHandle).toBeNull();
  });

  it("writes the answers, contacts, gate and change log together", async () => {
    const member = await seed();

    await saveBurnerProfileReplay({
      userId: member.id,
      version: "v10",
      responses: { "bio.statement": "After" },
      idColumns: { passportEncrypted: "CIPHER", saIdEncrypted: null },
      emergencyContacts: [ADA],
      edit: {
        questionnaireKey: "burner_profile",
        editedByUserId: member.id,
        changes: [
          {
            fieldId: "bio.statement",
            label: "Tell us about yourself",
            from: "Before",
            to: "After",
          },
        ],
      },
    });

    const profile = await profileOf(member.id);
    expect(profile.responses).toEqual({ "bio.statement": "After" });
    // The original completion time is kept.
    expect(profile.completedAt).toEqual(new Date("2026-03-01T10:00:00Z"));
    const user = await userOf(member.id);
    expect(user.passportEncrypted).toBe("CIPHER");
    expect(user.emergencyContacts).toEqual([ADA]);
    const [gate] = await requiredActionsFor(h.db(), member.id);
    expect(gate?.status).toBe("completed");
    expect(await editsOf(member.id)).toHaveLength(1);
  });

  it("writes nothing when a later write fails", async () => {
    const member = await seed();

    await expect(
      saveBurnerProfileReplay({
        userId: member.id,
        version: "v10",
        responses: { "bio.statement": "After" },
        idColumns: null,
        emergencyContacts: [ADA],
        // No such user: the change-log insert, the LAST write, fails.
        edit: {
          questionnaireKey: "burner_profile",
          editedByUserId: NIL_UUID,
          changes: [
          {
            fieldId: "bio.statement",
            label: "Tell us about yourself",
            from: "Before",
            to: "After",
          },
        ],
        },
      }),
    ).rejects.toThrow();

    expect((await profileOf(member.id)).responses).toEqual({
      "bio.statement": "Before",
    });
    expect((await userOf(member.id)).emergencyContacts).toBeNull();
    const [gate] = await requiredActionsFor(h.db(), member.id);
    expect(gate?.status).toBe("pending");
    expect(await editsOf(member.id)).toEqual([]);
  });

  it("writes no change-log row when nothing changed", async () => {
    const member = await seed();

    await saveBurnerProfileReplay({
      userId: member.id,
      version: "v10",
      responses: { "bio.statement": "Before" },
      idColumns: null,
      emergencyContacts: [],
      edit: null,
    });

    expect(await editsOf(member.id)).toEqual([]);
  });
});
