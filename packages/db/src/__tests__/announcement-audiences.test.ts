import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeDriverProfile, makeMembership, makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  DRAFT_TEAM_NOT_LED,
  getAnnouncementPickerData,
  listAnnouncements,
  listInbox,
  publishAnnouncement,
  updateAnnouncementDraft,
} from "../broadcasts";
import * as schema from "../schema";

// #313 (owner approved 2026-10-02): a captain announces to "Drivers this year"
// or to specific people. These run the real draft writes, the publish claim
// and the fan-out against Postgres, because "exactly those members" is a
// property of the SQL, not of a mock.

const DRAFT = {
  title: "Fill up in Ceres",
  body: "Last fuel before the Tankwa.",
  presentation: "popup" as const,
};

async function recipientsOf(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  broadcastId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.notificationDeliveries.userId })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.broadcastId, broadcastId));
  return rows.map((r) => r.userId).sort();
}

describe("announcements to the drivers", () => {
  const h = useTestDb();

  it("reaches exactly this year's approved drivers, never the sender", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const dana = await makeUser(h.db());
    const sipho = await makeUser(h.db());
    const walker = await makeUser(h.db());
    const notDriving = await makeUser(h.db());
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    await makeDriverProfile(h.db(), { userId: dana.id });
    await makeDriverProfile(h.db(), { userId: sipho.id });
    await makeDriverProfile(h.db(), { userId: captain.id });
    await makeDriverProfile(h.db(), {
      userId: notDriving.id,
      intendsToDrive: false,
    });
    await makeDriverProfile(h.db(), { userId: pending.id });
    // Driving LAST year is not driving this year.
    await makeDriverProfile(h.db(), { userId: walker.id, cycle: 0 });

    const audience = { scope: "drivers" } as const;
    expect(await countAnnouncementAudience(captain.id, audience)).toBe(2);
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience,
    });
    expect(
      await publishAnnouncement({ id, senderId: captain.id }),
    ).toMatchObject({ ok: true, recipientCount: 2 });
    expect(await recipientsOf(h.db(), id)).toEqual([dana.id, sipho.id].sort());

    // The inbox row says who it went to.
    const inbox = await listInbox(dana.id);
    expect(inbox.items[0]?.sentTo).toEqual({ scope: "drivers" });
  });
});

describe("announcements to chosen people", () => {
  const h = useTestDb();

  it("reaches exactly the people picked, and their inbox says so", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const jess = await makeUser(h.db());
    const sipho = await makeUser(h.db());
    const bystander = await makeUser(h.db());
    const audience = {
      scope: "individual",
      userIds: [jess.id, sipho.id],
    } as const;
    expect(
      await countAnnouncementAudience(captain.id, {
        ...audience,
        userIds: [...audience.userIds],
      }),
    ).toBe(2);
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { ...audience, userIds: [...audience.userIds] },
    });

    // The draft reads back with its people.
    const [listed] = await listAnnouncements();
    expect(listed?.audience).toEqual({
      scope: "individual",
      userIds: [jess.id, sipho.id].sort(),
    });

    expect(
      await publishAnnouncement({ id, senderId: captain.id }),
    ).toMatchObject({ ok: true, recipientCount: 2 });
    const got = await recipientsOf(h.db(), id);
    expect(got).toEqual([jess.id, sipho.id].sort());
    expect(got).not.toContain(bystander.id);

    expect((await listInbox(jess.id)).items[0]?.sentTo).toEqual({
      scope: "individual",
      others: 1,
    });
    expect((await listInbox(bystander.id)).items).toHaveLength(0);
  });

  it("says 'you only' to a single person picked", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const jess = await makeUser(h.db());
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "individual", userIds: [jess.id] },
    });
    await publishAnnouncement({ id, senderId: captain.id });
    expect((await listInbox(jess.id)).items[0]?.sentTo).toEqual({
      scope: "individual",
      others: 0,
    });
  });

  it("skips a chosen member who was erased before it went out", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const jess = await makeUser(h.db());
    const gone = await makeUser(h.db());
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "individual", userIds: [jess.id, gone.id] },
    });
    expect(await sanitiseAccount(gone.id)).toMatchObject({ ok: true });
    expect(
      await publishAnnouncement({ id, senderId: captain.id }),
    ).toMatchObject({ ok: true, recipientCount: 1 });
    expect(await recipientsOf(h.db(), id)).toEqual([jess.id]);
  });

  it("replaces the people when the draft is edited, and drops them for another audience", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const a = await makeUser(h.db());
    const b = await makeUser(h.db());
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "individual", userIds: [a.id] },
    });
    expect(
      await updateAnnouncementDraft({
        id,
        senderId: captain.id,
        ...DRAFT,
        audience: { scope: "individual", userIds: [b.id] },
      }),
    ).toBe(true);
    const targets = () =>
      h
        .db()
        .select({ userId: schema.broadcastTargets.userId })
        .from(schema.broadcastTargets)
        .where(eq(schema.broadcastTargets.broadcastId, id));
    expect((await targets()).map((t) => t.userId)).toEqual([b.id]);

    await updateAnnouncementDraft({
      id,
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "drivers" },
    });
    expect(await targets()).toEqual([]);
  });
});

describe("the publish claim refuses a lead the captain-only audiences", () => {
  const h = useTestDb();

  // A lead cannot save such a draft (the action asks canSendToAudience first),
  // so the row is written straight in: this is the write's own check, the one
  // that holds even when the screen was wrong or the rank changed.
  for (const scope of ["drivers", "individual"] as const) {
    it(`refuses a lead's ${scope} draft at publish`, async () => {
      const lead = await makeUser(h.db());
      await makeMembership(h.db(), {
        userId: lead.id,
        team: "kitchen",
        isLead: true,
      });
      const target = await makeUser(h.db());
      await makeDriverProfile(h.db(), { userId: target.id });
      const [row] = await h
        .db()
        .insert(schema.broadcasts)
        .values({
          senderId: lead.id,
          kind: "announcement",
          scope,
          ...DRAFT,
        })
        .returning({ id: schema.broadcasts.id });
      await h
        .db()
        .insert(schema.broadcastTargets)
        .values({ broadcastId: row!.id, userId: target.id });

      expect(
        await publishAnnouncement({ id: row!.id, senderId: lead.id }),
      ).toEqual({ ok: false, error: DRAFT_TEAM_NOT_LED });
      expect(await recipientsOf(h.db(), row!.id)).toEqual([]);
    });
  }

  it("refuses a captain demoted after saving a drivers draft", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const driver = await makeUser(h.db());
    await makeDriverProfile(h.db(), { userId: driver.id });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "drivers" },
    });
    await h
      .db()
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, captain.id));
    expect(await publishAnnouncement({ id, senderId: captain.id })).toEqual({
      ok: false,
      error: DRAFT_TEAM_NOT_LED,
    });
    expect(await recipientsOf(h.db(), id)).toEqual([]);
  });
});

describe("getAnnouncementPickerData", () => {
  const h = useTestDb();

  it("lists approved members but the sender, with this year's teams and who drives", async () => {
    const captain = await makeUser(h.db(), {
      rank: "captain",
      displayName: "Ryan",
    });
    const jess = await makeUser(h.db(), { displayName: "Jess Naidoo" });
    const dana = await makeUser(h.db(), { displayName: "Dana" });
    const gone = await makeUser(h.db(), { displayName: "Erased" });
    await makeUser(h.db(), {
      displayName: "Waiting",
      approvalStatus: "pending",
    });
    await makeMembership(h.db(), { userId: jess.id, team: "kitchen" });
    await makeDriverProfile(h.db(), { userId: dana.id });
    await makeDriverProfile(h.db(), { userId: captain.id });
    await sanitiseAccount(gone.id);

    const data = await getAnnouncementPickerData(captain.id);
    expect(data.people.map((p) => p.name)).toEqual(["Dana", "Jess Naidoo"]);
    expect(data.people.find((p) => p.id === jess.id)?.teams).toEqual([
      "kitchen",
    ]);
    expect(data.drivers.map((d) => d.id)).toEqual([dana.id]);
  });
});
