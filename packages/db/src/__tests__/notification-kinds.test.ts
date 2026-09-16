import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import { setUserApproval } from "../burner-profile";
import {
  createAnnouncementDraft,
  dispatchDueBroadcasts,
  listInbox,
  publishAnnouncement,
} from "../broadcasts";
import {
  notifyQuestionnaireReleased,
  sendReminder,
} from "../questionnaire-lifecycle";
import * as schema from "../schema";

// Every delivery is written through deliveryValues from a @camp404/core
// builder, so each one carries the kind of thing it is. The column has a
// default ('announcement'), which would hide a writer that forgot: these pin
// the kind each real writer stores, and what the inbox makes of it.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function kindsFor(db: DB, userId: string) {
  const rows = await db
    .select({
      kind: schema.notificationDeliveries.kind,
      presentation: schema.notificationDeliveries.presentation,
      title: schema.notificationDeliveries.title,
    })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.userId, userId));
  return rows;
}

async function gate(db: DB, userId: string, activationId: string) {
  await db.insert(schema.requiredActions).values({
    userId,
    type: "questionnaire",
    actionKey: "feedback",
    version: "1",
    activationId,
    title: "Camp feedback",
    status: "pending",
  });
}

describe("notification kinds", () => {
  const h = useTestDb();

  it("marks an announcement, and the inbox links it to its read page", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      title: "Burn-night briefing",
      body: "Meet at the effigy.",
      presentation: "feed",
    });
    await publishAnnouncement({ id, senderId: captain.id });

    const [item] = (await listInbox(member.id)).items;
    expect(item).toMatchObject({
      kind: "announcement",
      link: `/announcements/${id}`,
    });
  });

  it("marks a questionnaire release and a reminder, both linked to the form", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, member.id, act.id);

    expect(
      await notifyQuestionnaireReleased({
        activationId: act.id,
        senderId: captain.id,
        now: new Date("2026-03-01T08:00:00Z"),
      }),
    ).toBe(1);
    await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: new Date("2026-03-01T09:00:00Z"),
    });

    const inbox = (await listInbox(member.id)).items;
    expect(inbox.map((i) => i.kind)).toEqual([
      "questionnaire_reminder",
      "questionnaire_release",
    ]);
    for (const item of inbox) {
      expect(item.link).toBe(`/questionnaires/${act.id}`);
    }
  });

  it("marks a scheduled team message with its own kind", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    await db.insert(schema.broadcasts).values({
      senderId: captain.id,
      kind: "team_message",
      scope: "everyone",
      title: "Kitchen crew",
      body: "Prep at 4.",
      channel: "in_app",
      presentation: "feed",
      publishedAt: new Date("2026-03-01T08:00:00Z"),
    });
    await dispatchDueBroadcasts(new Date("2026-03-01T09:00:00Z"));

    expect(await kindsFor(db, member.id)).toEqual([
      { kind: "team_message", presentation: "feed", title: "Kitchen crew" },
    ]);
  });

  it("tells an approved member once, and a rejected one nothing", async () => {
    const db = h.db();
    const captainA = await makeUser(db, { rank: "captain" });
    const captainB = await makeUser(db, { rank: "captain" });
    const approved = await makeUser(db, { approvalStatus: "pending" });
    const rejected = await makeUser(db, { approvalStatus: "pending" });

    await setUserApproval({
      userId: approved.id,
      from: "pending",
      to: "approved",
      decidedByUserId: captainA.id,
    });
    // A second captain's late click loses the compare-and-set and says nothing.
    await setUserApproval({
      userId: approved.id,
      from: "pending",
      to: "approved",
      decidedByUserId: captainB.id,
    });
    await setUserApproval({
      userId: rejected.id,
      from: "pending",
      to: "rejected",
      decidedByUserId: captainA.id,
    });

    expect(await kindsFor(db, approved.id)).toEqual([
      { kind: "approval_decision", presentation: "popup", title: "You're in" },
    ]);
    expect(await kindsFor(db, rejected.id)).toEqual([]);
  });
});
