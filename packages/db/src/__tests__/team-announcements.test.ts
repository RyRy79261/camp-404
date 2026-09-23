import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import {
  countUnreadByTeam,
  countAnnouncementAudience,
  createAnnouncementDraft,
  DRAFT_TEAM_NOT_LED,
  isAllowedAudience,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncementDraft,
} from "../broadcasts";
import * as schema from "../schema";

// Announcements to one team (W4.10). The audience is stored on the draft and
// resolved at publish; a team lead may only send to a team they lead, and that
// is re-checked in the publish claim, not only when the draft was saved.

const DRAFT = {
  title: "Kitchen prep",
  body: "Knives out at 4.",
  presentation: "feed" as const,
};

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function recipients(db: DB, broadcastId: string) {
  const rows = await db
    .select({ userId: schema.notificationDeliveries.userId })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.broadcastId, broadcastId));
  return rows.map((r) => r.userId).sort();
}

describe("team announcements", () => {
  const h = useTestDb();

  it("reach only the approved members of that team, not the sender", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    const pendingCook = await makeUser(db, { approvalStatus: "pending" });
    const builder = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    await makeMembership(db, { userId: pendingCook.id, team: "kitchen" });
    await makeMembership(db, { userId: captain.id, team: "kitchen" });
    await makeMembership(db, { userId: builder.id, team: "structures" });

    const audience = { scope: "team", team: "kitchen" } as const;
    expect(await countAnnouncementAudience(captain.id, audience)).toBe(1);

    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience,
    });
    expect(await publishAnnouncement({ id, senderId: captain.id })).toEqual({
      ok: true,
      recipientCount: 1,
    });
    expect(await recipients(db, id)).toEqual([cook.id]);

    const [listed] = await listAnnouncements();
    expect(listed?.audience).toEqual(audience);
    expect(listed?.readCount).toBe(0);

    // Seen once the member's inbox row is marked read.
    await db
      .update(schema.notificationDeliveries)
      .set({ readAt: new Date() })
      .where(eq(schema.notificationDeliveries.userId, cook.id));
    const [seen] = await listAnnouncements();
    expect(seen).toMatchObject({ recipientCount: 1, readCount: 1 });
  });

  it("reach every team's leads this year, and nobody else, when sent to the team leads", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const kitchenLead = await makeUser(db, { approvalStatus: "approved" });
    const structuresLead = await makeUser(db, { approvalStatus: "approved" });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    const lastYearsLead = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: kitchenLead.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, {
      userId: structuresLead.id,
      team: "structures",
      isLead: true,
    });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    await makeMembership(db, {
      userId: lastYearsLead.id,
      team: "kitchen",
      isLead: true,
      cycle: 2020,
    });
    // The captain leads a team too, and is still not sent their own message.
    await makeMembership(db, {
      userId: captain.id,
      team: "structures",
      isLead: true,
    });

    const audience = { scope: "team_leads" } as const;
    expect(await countAnnouncementAudience(captain.id, audience)).toBe(2);
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience,
    });
    expect(await publishAnnouncement({ id, senderId: captain.id })).toEqual({
      ok: true,
      recipientCount: 2,
    });
    expect((await recipients(db, id)).sort()).toEqual(
      [kitchenLead.id, structuresLead.id].sort(),
    );
    // Stored and read back as the team leads, not as "everyone".
    const [listed] = await listAnnouncements();
    expect(listed?.audience).toEqual(audience);
  });

  it("let a lead send to a team they lead, and nowhere else", async () => {
    const db = h.db();
    const lead = await makeUser(db, { approvalStatus: "approved" });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    // The write reads the lead flag from this row itself; nothing is passed in.
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });

    const toKitchen = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
      audience: { scope: "team", team: "kitchen" },
    });
    const toStructures = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
      audience: { scope: "team", team: "structures" },
    });
    const toEveryone = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
    });

    const toLeads = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
      audience: { scope: "team_leads" },
    });
    for (const id of [toStructures.id, toEveryone.id, toLeads.id]) {
      expect(await publishAnnouncement({ id, senderId: lead.id })).toEqual({
        ok: false,
        error: DRAFT_TEAM_NOT_LED,
      });
    }
    expect(
      await publishAnnouncement({ id: toKitchen.id, senderId: lead.id }),
    ).toEqual({ ok: true, recipientCount: 1 });

    // Stripped of the lead role after the draft was written: the publish reads
    // the flag as it is NOW, so the kitchen draft no longer goes out.
    const another = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
      audience: { scope: "team", team: "kitchen" },
    });
    await db
      .update(schema.teamMemberships)
      .set({ isLead: false })
      .where(eq(schema.teamMemberships.userId, lead.id));
    expect(
      await publishAnnouncement({ id: another.id, senderId: lead.id }),
    ).toEqual({ ok: false, error: DRAFT_TEAM_NOT_LED });
  });

  it("change audience when the draft is edited, and list only a sender's own", async () => {
    const db = h.db();
    const a = await makeUser(db, { rank: "captain" });
    const b = await makeUser(db, { rank: "captain" });
    const { id } = await createAnnouncementDraft({ senderId: a.id, ...DRAFT });
    await createAnnouncementDraft({ senderId: b.id, ...DRAFT });

    expect(
      await updateAnnouncementDraft({
        id,
        senderId: a.id,
        ...DRAFT,
        audience: { scope: "team", team: "structures" },
      }),
    ).toBe(true);

    const mine = await listAnnouncements({ senderId: a.id });
    expect(mine.map((m) => [m.id, m.audience])).toEqual([
      [id, { scope: "team", team: "structures" }],
    ]);
    expect(await listAnnouncements()).toHaveLength(2);
  });
});

describe("countUnreadByTeam", () => {
  const h = useTestDb();

  it("counts a member's unread announcements per team, for each team they are on", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    await makeMembership(db, {
      userId: cook.id,
      team: "structures",
      isLead: true,
    });

    const send = async (audience?: {
      scope: "team";
      team: "kitchen" | "structures";
    }) => {
      const { id } = await createAnnouncementDraft({
        senderId: captain.id,
        ...DRAFT,
        ...(audience ? { audience } : {}),
      });
      await publishAnnouncement({ id, senderId: captain.id });
      return id;
    };
    await send({ scope: "team", team: "kitchen" });
    await send({ scope: "team", team: "kitchen" });
    const read = await send({ scope: "team", team: "structures" });
    // The whole camp's announcements are not any one team's.
    await send();

    expect(await countUnreadByTeam(cook.id)).toEqual({
      kitchen: 2,
      structures: 1,
    });

    await db
      .update(schema.notificationDeliveries)
      .set({ readAt: new Date() })
      .where(eq(schema.notificationDeliveries.broadcastId, read));
    expect(await countUnreadByTeam(cook.id)).toEqual({ kitchen: 2 });
    // Someone else's inbox is not counted.
    expect(await countUnreadByTeam(captain.id)).toEqual({});
  });
});

describe("isAllowedAudience", () => {
  it("lets a captain send anywhere and a lead only to teams they lead", () => {
    expect(isAllowedAudience({ scope: "everyone" })).toBe(true);
    expect(isAllowedAudience({ scope: "everyone" }, ["kitchen"])).toBe(false);
    expect(
      isAllowedAudience({ scope: "team", team: "kitchen" }, ["kitchen"]),
    ).toBe(true);
    expect(
      isAllowedAudience({ scope: "team", team: "structures" }, ["kitchen"]),
    ).toBe(false);
  });
});
