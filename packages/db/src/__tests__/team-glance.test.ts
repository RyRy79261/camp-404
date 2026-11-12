import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  countAnnouncementsSince,
  countTelegramReach,
  getSafetyCountsFor,
} from "../team-glance";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The team pages' counts (apps/web/lib/team-glance.ts) on a real Postgres:
// the Safety figures over the people coming this year, answered only to a
// captain or a Safety lead, and the Comms figures. Counts only: what comes
// back holds no id, name or value.

const YEAR = 2027;
type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB) {
  const cycles: CampConfig["cycles"] = [
    { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

async function coming(
  db: DB,
  userId: string,
  status: "applied" | "accepted" | "maybe" | "not_attending" = "accepted",
) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: YEAR,
    status,
    intent:
      status === "maybe" ? "maybe" : status === "not_attending" ? "no" : "yes",
  });
}

describe("team page counts", () => {
  const h = useTestDb();

  it("counts the Safety figures over the people coming, for a captain or a Safety lead only", async () => {
    const db = h.db();
    await campYear(db);
    const captain = await makeUser(db, { rank: "captain" });
    const safetyLead = await makeUser(db);
    const kitchenLead = await makeUser(db);
    const member = await makeUser(db);
    await assignTeam({ userId: safetyLead.id, team: "health_and_safety" });
    await setLead({
      userId: safetyLead.id,
      team: "health_and_safety",
      isLead: true,
    });
    await assignTeam({ userId: kitchenLead.id, team: "kitchen" });
    await setLead({ userId: kitchenLead.id, team: "kitchen", isLead: true });

    // Coming, everything done: a contact, a profile, an old anaphylactic flag.
    const a = await makeUser(db, {
      emergencyContacts: [
        { name: "Jo", phone: "0820000000", relationship: "sister" },
      ],
    });
    await coming(db, a.id);
    await db.insert(schema.burnerProfiles).values({
      userId: a.id,
      version: "v1",
      completedAt: new Date(),
    });
    await db.insert(schema.dietaryRequirements).values({
      userId: a.id,
      isAnaphylactic: true,
      version: "dietary-form@1",
    });
    // Coming, nothing done, an anaphylaxis on the pick-list.
    const b = await makeUser(db);
    await coming(db, b.id, "applied");
    await db.insert(schema.dietaryRequirements).values({
      userId: b.id,
      foodReactions: [{ food: "peanuts", reaction: "anaphylaxis" }],
      version: "dietary-pick-list@1",
    });
    // Coming, an empty contact list, old words only, a profile not finished.
    const c = await makeUser(db, { emergencyContacts: [] });
    await coming(db, c.id);
    await db
      .insert(schema.burnerProfiles)
      .values({ userId: c.id, version: "v1" });
    await db.insert(schema.dietaryRequirements).values({
      userId: c.id,
      allergies: " shellfish ",
      version: "dietary-form@1",
    });
    // Blank words do not count as an allergy.
    const d = await makeUser(db);
    await coming(db, d.id);
    await db.insert(schema.dietaryRequirements).values({
      userId: d.id,
      allergies: "   ",
      version: "dietary-form@1",
    });
    // Not counted: a Maybe, a Not coming, a pending sign-up, an erased stub.
    const maybe = await makeUser(db);
    await coming(db, maybe.id, "maybe");
    const no = await makeUser(db);
    await coming(db, no.id, "not_attending");
    const pending = await makeUser(db, { approvalStatus: "pending" });
    await coming(db, pending.id);
    const erased = await makeUser(db, { sanitised: true });
    await coming(db, erased.id);

    const expected = {
      coming: 4,
      noEmergencyContact: 3,
      burnerProfileDone: 1,
      anaphylactic: 2,
      allergiesNoted: 3,
    };
    expect(await getSafetyCountsFor(captain.id)).toEqual(expected);
    expect(await getSafetyCountsFor(safetyLead.id)).toEqual(expected);
    expect(await getSafetyCountsFor(kitchenLead.id)).toBeNull();
    expect(await getSafetyCountsFor(member.id)).toBeNull();
    expect(await getSafetyCountsFor("not-an-id")).toBeNull();
  });

  it("counts Ol' Jeb's reach over approved members and the announcements sent since a day", async () => {
    const db = h.db();
    await makeUser(db, { telegramDmAt: new Date() });
    await makeUser(db);
    await makeUser(db, { telegramDmAt: new Date(), approvalStatus: "pending" });
    await makeUser(db, { telegramDmAt: new Date(), sanitised: true });
    expect(await countTelegramReach()).toEqual({ connected: 1, members: 2 });

    const sender = await makeUser(db, { rank: "captain" });
    const since = new Date("2027-03-01T00:00:00+02:00");
    const base = {
      senderId: sender.id,
      scope: "everyone" as const,
      title: "Hi",
      body: "Hello",
    };
    await db.insert(schema.broadcasts).values([
      {
        ...base,
        kind: "announcement",
        publishedAt: new Date("2027-03-02T10:00:00Z"),
      },
      {
        ...base,
        kind: "announcement",
        publishedAt: new Date("2027-02-27T10:00:00Z"),
      },
      // A draft, and another kind of broadcast, do not count.
      { ...base, kind: "announcement", publishedAt: null },
      {
        ...base,
        kind: "reminder",
        publishedAt: new Date("2027-03-02T10:00:00Z"),
      },
    ]);
    expect(await countAnnouncementsSince(since)).toBe(1);
  });
});
