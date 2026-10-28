import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeMembership, makeUser } from "./_factories";
import {
  countAnnouncementAudience,
  previewAnnouncementAudience,
} from "../broadcasts";
import {
  openActivation,
  reconcileOpenActivations,
  getPendingRequiredActions,
} from "../activations";
import {
  notifyOptInOpened,
  remindRequiredActionsDueSoon,
  sendReminder,
} from "../questionnaire-lifecycle";
import { questionnairePostCandidates } from "../telegram-posts";
import { listCampEventGuests } from "../camp-events";
import { applyParticipationIntent } from "../participations";
import { withTransaction } from "../index";
import * as schema from "../schema";

// "Not coming = no group sends" (owner, 2026-10-27). A member whose place
// this year is `not_attending` is left out of every group send, captains
// included; a person picked by name is still reached. Saying Not coming also
// takes their open sends' gates off blocking (they may still answer), and
// taking it back puts them back.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** The camp has named no year, so the current year is the sentinel 1. */
const YEAR = 1;

async function said(
  db: DB,
  userId: string,
  status: (typeof schema.participationStatusEnum.enumValues)[number],
): Promise<void> {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: YEAR,
    status,
    intent:
      status === "not_attending" ? "no" : status === "maybe" ? "maybe" : "yes",
  });
}

describe("group announcements leave out who said Not coming", () => {
  const h = useTestDb();

  it("counts and names them apart, captains included; picked people still count", async () => {
    const db = h.db();
    const sender = await makeUser(db, { rank: "captain" });
    const coming = await makeUser(db, { displayName: "Ayanda" });
    const maybe = await makeUser(db, { displayName: "Bea" });
    await said(db, maybe.id, "maybe");
    await makeUser(db, { displayName: "Cara" }); // not answered: still reached
    const away = await makeUser(db, { displayName: "Tash" });
    await said(db, away.id, "not_attending");
    const awayCaptain = await makeUser(db, {
      displayName: "Kyle",
      rank: "captain",
    });
    await said(db, awayCaptain.id, "not_attending");
    await said(db, coming.id, "applied");

    expect(await countAnnouncementAudience(sender.id)).toBe(3);
    const preview = await previewAnnouncementAudience(sender.id);
    expect(preview.reaches).toBe(3);
    expect(preview.notComing.map((m) => m.name)).toEqual(["Kyle", "Tash"]);

    await makeMembership(db, { userId: away.id, team: "kitchen" });
    await makeMembership(db, { userId: coming.id, team: "kitchen" });
    expect(
      await countAnnouncementAudience(sender.id, {
        scope: "team",
        team: "kitchen",
      }),
    ).toBe(1);

    const picked = await previewAnnouncementAudience(sender.id, {
      scope: "individual",
      userIds: [away.id],
    });
    expect(picked).toEqual({ reaches: 1, notComing: [] });
  });
});

describe("questionnaire sends leave out who said Not coming", () => {
  const h = useTestDb();

  it("openActivation gates nobody who said Not coming in the send's year", async () => {
    const db = h.db();
    const coming = await makeUser(db);
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const act = await makeActivation(db, { blocking: true, cycle: YEAR });

    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    const gated = await db
      .select({ userId: schema.requiredActions.userId })
      .from(schema.requiredActions);
    expect(gated.map((g) => g.userId)).toEqual([coming.id]);

    // A page load does not gate them later either.
    expect(await reconcileOpenActivations(away.id)).toBe(0);
  });

  it("a picked person is still asked, whatever they said", async () => {
    const db = h.db();
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const act = await makeActivation(db, {
      scope: "individual",
      cycle: YEAR,
    });
    await db
      .insert(schema.questionnaireActivationTargets)
      .values({ activationId: act.id, userId: away.id });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
  });

  it("the optional questionnaire's note skips them", async () => {
    const db = h.db();
    const coming = await makeUser(db);
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const act = await makeActivation(db, {
      scope: "opt_in",
      status: "open",
      cycle: YEAR,
    });
    expect(
      await notifyOptInOpened({ activationId: act.id, senderId: null }),
    ).toBe(1);
    const told = await db
      .select({ userId: schema.notificationDeliveries.userId })
      .from(schema.notificationDeliveries);
    expect(told.map((t) => t.userId)).toEqual([coming.id]);
  });
});

describe("reminders and tags leave out who said Not coming", () => {
  const h = useTestDb();

  async function gate(
    db: DB,
    userId: string,
    activationId: string | null,
    dueAt: Date | null = null,
  ) {
    const [row] = await db
      .insert(schema.requiredActions)
      .values({
        userId,
        type: "questionnaire",
        actionKey: activationId ? "feedback" : `hand-${userId}`,
        version: "1",
        activationId,
        title: "Camp feedback",
        dueAt,
      })
      .returning();
    return row!;
  }

  it("sendReminder nudges only the members still coming or undecided", async () => {
    const db = h.db();
    const owes = await makeUser(db);
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const act = await makeActivation(db, { status: "open", cycle: YEAR });
    await gate(db, owes.id, act.id);
    await gate(db, away.id, act.id);

    const result = await sendReminder({ activationId: act.id, senderId: null });
    expect(result).toMatchObject({ ok: true, outcome: "sent", sent: 1 });
    const nudged = await db
      .select({ userId: schema.notificationDeliveries.userId })
      .from(schema.notificationDeliveries);
    expect(nudged.map((n) => n.userId)).toEqual([owes.id]);
  });

  it("the deadline nudge for a hand gate skips them", async () => {
    const db = h.db();
    const owes = await makeUser(db);
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const now = new Date("2026-11-02T08:00:00Z");
    const due = new Date("2026-11-03T08:00:00Z");
    await gate(db, owes.id, null, due);
    await gate(db, away.id, null, due);

    const result = await remindRequiredActionsDueSoon({ now });
    expect(result).toEqual({ actions: 1, reminded: 1 });
  });

  it("the Post in Telegram dialog never offers them", async () => {
    const db = h.db();
    const owes = await makeUser(db);
    const away = await makeUser(db);
    await said(db, away.id, "not_attending");
    const act = await makeActivation(db, { status: "open", cycle: YEAR });
    await gate(db, owes.id, act.id);
    await gate(db, away.id, act.id);

    const candidates = await questionnairePostCandidates(act.id);
    expect(candidates.map((c) => c.userId)).toEqual([owes.id]);
  });
});

describe("calendar invites", () => {
  const h = useTestDb();

  it("a team-leads event leaves out a lead who said Not coming; picked people stay", async () => {
    const db = h.db();
    const lead = await makeUser(db, { displayName: "Here" });
    const away = await makeUser(db, { displayName: "Away" });
    await said(db, away.id, "not_attending");
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, {
      userId: away.id,
      team: "finance",
      isLead: true,
    });

    const leads = await listCampEventGuests({
      audience: "team_leads",
      peopleUserIds: [],
    });
    expect(leads.map((g) => g.id)).toEqual([lead.id]);
    const people = await listCampEventGuests({
      audience: "people",
      peopleUserIds: [away.id],
    });
    expect(people.map((g) => g.id)).toEqual([away.id]);
  });
});

describe("saying Not coming takes an open send's gate off blocking", () => {
  const h = useTestDb();

  it("stops blocking (still pending, still answerable), and taking it back restores it", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const blockingSend = await makeActivation(db, {
      questionnaireKey: "build-week",
      status: "open",
      blocking: true,
      cycle: YEAR,
    });
    const quietSend = await makeActivation(db, {
      questionnaireKey: "quiet",
      status: "open",
      blocking: false,
      cycle: YEAR,
    });
    for (const act of [blockingSend, quietSend]) {
      await db.insert(schema.requiredActions).values({
        userId: member.id,
        type: "questionnaire",
        actionKey: act.questionnaireKey,
        version: "1",
        activationId: act.id,
        title: act.title,
        blocking: act.blocking,
      });
    }
    // A gate with no send behind it keeps its own setting.
    await db.insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Burner profile",
      blocking: true,
    });

    const answer = (intent: "yes" | "no" | "maybe") =>
      withTransaction((tx) =>
        applyParticipationIntent(tx, {
          userId: member.id,
          cycle: YEAR,
          intent,
        }),
      );
    const rows = async () =>
      Object.fromEntries(
        (
          await db
            .select({
              key: schema.requiredActions.actionKey,
              blocking: schema.requiredActions.blocking,
              status: schema.requiredActions.status,
            })
            .from(schema.requiredActions)
            .where(eq(schema.requiredActions.userId, member.id))
        ).map((r) => [r.key, `${r.status}/${r.blocking}`]),
      );

    await answer("no");
    expect(await rows()).toEqual({
      "build-week": "pending/false",
      quiet: "pending/false",
      burner_profile: "pending/true",
    });
    expect(
      (await getPendingRequiredActions(member.id)).map((g) => g.actionKey),
    ).toEqual(["burner_profile"]);

    await answer("maybe");
    expect(await rows()).toEqual({
      "build-week": "pending/true",
      quiet: "pending/false",
      burner_profile: "pending/true",
    });
  });

  it("leaves a closed send's gate alone", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const closed = await makeActivation(db, {
      status: "closed",
      blocking: true,
      cycle: YEAR,
    });
    await db.insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: closed.questionnaireKey,
      activationId: closed.id,
      title: closed.title,
      blocking: true,
    });
    await withTransaction((tx) =>
      applyParticipationIntent(tx, {
        userId: member.id,
        cycle: YEAR,
        intent: "no",
      }),
    );
    const [row] = await db
      .select({ blocking: schema.requiredActions.blocking })
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, member.id),
          eq(schema.requiredActions.activationId, closed.id),
        ),
      );
    expect(row?.blocking).toBe(true);
  });
});
