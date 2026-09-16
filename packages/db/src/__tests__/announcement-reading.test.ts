import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  acknowledgeDelivery,
  createAnnouncementDraft,
  getAnnouncementForMember,
  publishAnnouncement,
  updateAnnouncementDraft,
} from "../broadcasts";
import * as schema from "../schema";

// The /announcements/[id] read page trusts one rule: the delivery row is the
// permission. These pin the rule against real rows, because every way it can
// fail is a row a mock would invent: a member added after the publish, a draft,
// a delivery that belongs to a different kind of broadcast.

const DRAFT = {
  title: "Burn-night briefing",
  body: "Meet at the effigy at 20:00.",
  presentation: "acknowledge" as const,
};

describe("getAnnouncementForMember", () => {
  const h = useTestDb();

  it("gives a recipient the copy delivered to them, with the sender", async () => {
    const captain = await makeUser(h.db(), {
      rank: "captain",
      displayName: "Captain Jo",
    });
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    await publishAnnouncement({ id, senderId: captain.id });

    const read = await getAnnouncementForMember(member.id, id);
    expect(read).toMatchObject({
      title: DRAFT.title,
      body: DRAFT.body,
      presentation: "acknowledge",
      senderName: "Captain Jo",
      acknowledgedAt: null,
    });
    expect(read!.publishedAt).toBeInstanceOf(Date);

    expect(
      await acknowledgeDelivery({
        deliveryId: read!.deliveryId,
        userId: member.id,
      }),
    ).toBe(true);
    expect(
      (await getAnnouncementForMember(member.id, id))!.acknowledgedAt,
    ).toBeInstanceOf(Date);
  });

  it("refuses a member it was not delivered to, even one who joined after", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    await makeUser(h.db(), { approvalStatus: "approved" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    await publishAnnouncement({ id, senderId: captain.id });
    const late = await makeUser(h.db(), { approvalStatus: "approved" });

    expect(await getAnnouncementForMember(late.id, id)).toBeNull();
    // The author is not in the fan-out either.
    expect(await getAnnouncementForMember(captain.id, id)).toBeNull();
  });

  it("refuses a draft, a malformed id, and a delivery of another kind", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    const { id: draftId } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    expect(await getAnnouncementForMember(member.id, draftId)).toBeNull();
    expect(await getAnnouncementForMember(member.id, "../admin")).toBeNull();

    const [reminder] = await h
      .db()
      .insert(schema.broadcasts)
      .values({
        senderId: captain.id,
        kind: "reminder",
        scope: "individual",
        title: "Reminder",
        body: "Finish the form.",
        presentation: "feed",
        publishedAt: new Date(),
      })
      .returning({ id: schema.broadcasts.id });
    await h.db().insert(schema.notificationDeliveries).values({
      broadcastId: reminder!.id,
      userId: member.id,
      title: "Reminder",
      body: "Finish the form.",
      channel: "in_app",
      presentation: "feed",
    });
    expect(await getAnnouncementForMember(member.id, reminder!.id)).toBeNull();
  });

  it("shows the text as delivered, not a later change to the broadcast row", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    await publishAnnouncement({ id, senderId: captain.id });
    // Published rows refuse edits; a direct write stands in for any drift.
    expect(
      await updateAnnouncementDraft({
        id,
        senderId: captain.id,
        ...DRAFT,
        title: "Changed",
      }),
    ).toBe(false);
    await h
      .db()
      .update(schema.broadcasts)
      .set({ title: "Changed" })
      .where(eq(schema.broadcasts.id, id));

    expect((await getAnnouncementForMember(member.id, id))!.title).toBe(
      DRAFT.title,
    );
  });
});
