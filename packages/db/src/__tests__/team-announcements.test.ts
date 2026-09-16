import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import {
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
  });

  it("let a lead send to a team they lead, and nowhere else", async () => {
    const db = h.db();
    const lead = await makeUser(db, { approvalStatus: "approved" });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    const leadTeams = ["kitchen"] as const;

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

    for (const id of [toStructures.id, toEveryone.id]) {
      expect(
        await publishAnnouncement({
          id,
          senderId: lead.id,
          allowedTeams: leadTeams,
        }),
      ).toEqual({ ok: false, error: DRAFT_TEAM_NOT_LED });
    }
    expect(
      await publishAnnouncement({
        id: toKitchen.id,
        senderId: lead.id,
        allowedTeams: leadTeams,
      }),
    ).toEqual({ ok: true, recipientCount: 1 });

    // A lead who has since lost every team can publish nothing.
    const another = await createAnnouncementDraft({
      senderId: lead.id,
      ...DRAFT,
      audience: { scope: "team", team: "kitchen" },
    });
    expect(
      await publishAnnouncement({
        id: another.id,
        senderId: lead.id,
        allowedTeams: [],
      }),
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
