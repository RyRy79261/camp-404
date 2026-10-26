import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeMembership, makeUser } from "./_factories";
import { createAnnouncementDraft, publishAnnouncement } from "../broadcasts";
import { createCampEvent } from "../camp-events";
import { sendReminder } from "../questionnaire-lifecycle";
import {
  addTelegramPlace,
  drainTelegramPosts,
  getTelegramPostSettings,
  listTelegramPlaces,
  queueTelegramPosts,
  reminderTags,
  removeTelegramPlace,
  setTelegramPostSettings,
  TELEGRAM_CAPTAINS_ONLY,
  TELEGRAM_POST_MAX_QUEUED_HOURS,
  type TelegramPostSend,
} from "../telegram-posts";
import { withTransaction } from "../index";
import * as schema from "../schema";

// Ol' Jeb's posts in the camp's chats (step 2): who may add a chat, what is
// queued and when, who a reminder tags, and the drain's at-most-once send.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const SITE = "https://camp-404.com";
const past = () => new Date(Date.now() - 60 * 60 * 1000);

/** A captain who connected Ol' Jeb, with their Telegram id. */
async function connectedCaptain(db: DB, telegramUserId = "900") {
  return makeUser(db, {
    rank: "captain",
    telegramUserId,
    telegramDmAt: past(),
  });
}

async function addPlace(
  telegramUserId: string,
  chatId = "-100500",
  threadId: string | null = null,
  title = "Camp 404 Announcements",
) {
  return addTelegramPlace({
    telegramUserId,
    chatId,
    threadId,
    title,
    username: null,
  });
}

async function audits(db: DB, action: string) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

async function queuedPosts(db: DB) {
  return db
    .select()
    .from(schema.telegramAnnouncements)
    .orderBy(schema.telegramAnnouncements.createdAt);
}

describe("/notifyhere: who may add a chat", () => {
  const h = useTestDb();

  it("adds the chat for a connected captain, audited", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "901");
    expect(await addPlace("901")).toEqual({ ok: true });
    const places = await listTelegramPlaces();
    expect(places).toMatchObject([
      { chatId: "-100500", threadId: null, title: "Camp 404 Announcements" },
    ]);
    const rows = await audits(db, "telegram.chat_added");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(captain.id);
    expect(rows[0]!.target).toBe("telegram_chat:-100500");
  });

  it("refuses a connected member who is not a captain", async () => {
    const db = h.db();
    await makeUser(db, { telegramUserId: "902", telegramDmAt: past() });
    expect(await addPlace("902")).toEqual({
      ok: false,
      reason: "not_a_captain",
    });
    expect(await listTelegramPlaces()).toEqual([]);
    expect(await audits(db, "telegram.chat_added")).toHaveLength(0);
  });

  it("refuses a captain who has not connected (or disconnected)", async () => {
    const db = h.db();
    await makeUser(db, {
      rank: "captain",
      telegramUserId: "903",
      telegramDmAt: null,
    });
    expect(await addPlace("903")).toEqual({
      ok: false,
      reason: "not_a_captain",
    });
    expect(await addPlace("unknown")).toEqual({
      ok: false,
      reason: "not_a_captain",
    });
    expect(await listTelegramPlaces()).toEqual([]);
  });

  it("refuses an erased captain", async () => {
    const db = h.db();
    await makeUser(db, {
      rank: "captain",
      telegramUserId: "904",
      telegramDmAt: past(),
      sanitised: true,
    });
    expect((await addPlace("904")).ok).toBe(false);
  });

  it("keeps one place per chat: another topic moves it, a removed one comes back", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "905");
    await addPlace("905", "-100600", "7", "Camp 404 › Announcements");
    await addPlace("905", "-100600", "9", "Camp 404 › News");
    let places = await listTelegramPlaces();
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      threadId: "9",
      title: "Camp 404 › News",
    });

    expect(
      await removeTelegramPlace({ actorId: captain.id, id: places[0]!.id }),
    ).toEqual({ ok: true });
    expect(await listTelegramPlaces()).toEqual([]);
    expect(await audits(db, "telegram.chat_removed")).toHaveLength(1);

    await addPlace("905", "-100600", null, "Camp 404");
    places = await listTelegramPlaces();
    expect(places).toMatchObject([{ chatId: "-100600", threadId: null }]);
  });

  it("lets only a captain remove a chat or change the ticks", async () => {
    const db = h.db();
    await connectedCaptain(db, "906");
    await addPlace("906");
    const member = await makeUser(db);
    const [place] = await listTelegramPlaces();
    expect(
      await removeTelegramPlace({ actorId: member.id, id: place!.id }),
    ).toEqual({ ok: false, error: TELEGRAM_CAPTAINS_ONLY });
    expect(
      await setTelegramPostSettings({
        actorId: member.id,
        settings: { announcements: false, reminders: false, meetings: false },
      }),
    ).toEqual({ ok: false, error: TELEGRAM_CAPTAINS_ONLY });
    expect(await listTelegramPlaces()).toHaveLength(1);
  });

  it("saves a captain's ticks, audited", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    expect(await getTelegramPostSettings()).toEqual({
      announcements: true,
      reminders: true,
      meetings: true,
    });
    const settings = { announcements: true, reminders: false, meetings: true };
    expect(
      await setTelegramPostSettings({ actorId: captain.id, settings }),
    ).toEqual({ ok: true });
    expect(await getTelegramPostSettings()).toEqual(settings);
    const rows = await audits(db, "telegram.posts_set");
    expect(rows[0]!.metadata).toEqual(settings);
  });
});

describe("queueing posts", () => {
  const h = useTestDb();

  const post = {
    kind: "meeting" as const,
    title: "New meeting: Build planning",
    body: "Sat 2 Nov, 18:00 · Structures team",
    refId: null,
    buttonText: "Open in Camp 404",
    buttonPath: "/calendar",
    dedupe: "meeting:abc",
  };

  it("queues one post per chat, once, and nothing when the tick is off", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "910");
    const queue = () => withTransaction((tx) => queueTelegramPosts(tx, post));
    expect(await queue()).toBe(0);

    await addPlace("910", "-1001");
    await addPlace("910", "-1002", "4");
    expect(await queue()).toBe(2);
    expect(await queue()).toBe(0);
    const rows = await queuedPosts(db);
    expect(rows.map((r) => [r.chatId, r.threadId, r.kind])).toEqual([
      ["-1001", null, "meeting"],
      ["-1002", "4", "meeting"],
    ]);

    await setTelegramPostSettings({
      actorId: captain.id,
      settings: { announcements: true, reminders: true, meetings: false },
    });
    expect(
      await withTransaction((tx) =>
        queueTelegramPosts(tx, { ...post, dedupe: "meeting:def" }),
      ),
    ).toBe(0);
  });

  it("queues a captain's announcement to everyone when it was ticked", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "911");
    await addPlace("911");
    await makeUser(db);

    const ticked = await createAnnouncementDraft({
      senderId: captain.id,
      title: "Build weekend moved",
      body: "Bring **gloves**.",
      presentation: "feed",
      telegram: true,
    });
    const quiet = await createAnnouncementDraft({
      senderId: captain.id,
      title: "Not for Telegram",
      body: "b",
      presentation: "feed",
    });
    expect(
      (await publishAnnouncement({ ...ticked, senderId: captain.id })).ok,
    ).toBe(true);
    expect(
      (await publishAnnouncement({ ...quiet, senderId: captain.id })).ok,
    ).toBe(true);
    const rows = await queuedPosts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "announcement",
      title: "Build weekend moved",
      refId: ticked.id,
      buttonText: "Open in Camp 404",
    });
  });

  it("never queues a team announcement, or a lead's, for the camp's chats", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "912");
    await addPlace("912");
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });

    const team = await createAnnouncementDraft({
      senderId: captain.id,
      title: "Kitchen only",
      body: "b",
      presentation: "feed",
      audience: { scope: "team", team: "kitchen" },
      telegram: true,
    });
    const leads = await createAnnouncementDraft({
      senderId: lead.id,
      title: "From a lead",
      body: "b",
      presentation: "feed",
      audience: { scope: "team", team: "kitchen" },
      telegram: true,
    });
    await publishAnnouncement({ ...team, senderId: captain.id });
    await publishAnnouncement({ ...leads, senderId: lead.id });
    expect(await queuedPosts(db)).toHaveLength(0);
  });

  it("queues a new meeting, not a plain event", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "913");
    await addPlace("913");
    const when = {
      team: "structures" as const,
      allDay: false,
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      startTime: "18:00",
      endTime: "19:00",
      place: null,
      description: null,
    };
    await createCampEvent({
      actorId: captain.id,
      kind: "event",
      agenda: "",
      newEventId: "evtplain0000000000000000",
      title: "Shade run",
      ...when,
    });
    await createCampEvent({
      actorId: captain.id,
      kind: "meeting",
      agenda: "1. Dome",
      newEventId: "evtmeet00000000000000000",
      title: "Build planning",
      ...when,
    });
    const rows = await queuedPosts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "meeting",
      title: "New meeting: Build planning",
      body: "Mon 2 Nov, 18:00 · Structures team",
    });
    expect(rows[0]!.buttonPath).toContain("event=evtmeet00000000000000000");
  });
});

describe("questionnaire reminders in the chats", () => {
  const h = useTestDb();

  async function owe(
    db: DB,
    activationId: string,
    input: {
      handle?: string | null;
      intent?: "yes" | "maybe" | "no" | null;
      connected?: boolean;
      answered?: boolean;
    },
  ) {
    const user = await makeUser(db, {
      telegramHandle: input.handle ?? null,
      telegramUserId: input.connected ? `tg-${Math.random()}` : null,
      telegramDmAt: input.connected ? past() : null,
    });
    await db.insert(schema.requiredActions).values({
      userId: user.id,
      type: "questionnaire",
      actionKey: "feedback",
      version: "1",
      activationId,
      title: "Camp feedback",
      status: input.answered ? "completed" : "pending",
    });
    if (input.intent) {
      await db.insert(schema.campParticipations).values({
        userId: user.id,
        cycle: 1,
        intent: input.intent,
        status:
          input.intent === "yes"
            ? "applied"
            : input.intent === "maybe"
              ? "maybe"
              : "not_attending",
      });
    }
    return user;
  }

  it("tags who said Coming, still owes it and is not connected", async () => {
    const db = h.db();
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await owe(db, act.id, { handle: "@cloud_404", intent: "yes" });
    await owe(db, act.id, { handle: "mike_404", intent: "yes" });
    await owe(db, act.id, { handle: null, intent: "yes" });
    await owe(db, act.id, { handle: "not a name!", intent: "yes" });
    await owe(db, act.id, { handle: "maybe_person", intent: "maybe" });
    await owe(db, act.id, { handle: "said_no", intent: "no" });
    await owe(db, act.id, { handle: "no_answer_yet" });
    await owe(db, act.id, {
      handle: "gets_a_dm",
      intent: "yes",
      connected: true,
    });
    await owe(db, act.id, {
      handle: "answered",
      intent: "yes",
      answered: true,
    });

    expect(await reminderTags(act.id)).toEqual({
      open: true,
      tags: ["@cloud_404", "@mike_404"],
      untagged: 2,
    });
  });

  it("tags nobody for a closed send", async () => {
    const db = h.db();
    const act = await makeActivation(db, { status: "closed", cycle: 1 });
    await owe(db, act.id, { handle: "cloud_404", intent: "yes" });
    expect(await reminderTags(act.id)).toEqual({
      open: false,
      tags: [],
      untagged: 0,
    });
  });

  it("posts a reminder once a camp day, whoever reminds", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "920");
    await addPlace("920");
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    const a = await owe(db, act.id, { handle: "cloud_404", intent: "yes" });
    const b = await owe(db, act.id, { handle: "mike_404", intent: "yes" });
    void a;
    void b;

    const morning = new Date("2026-10-26T07:00:00Z");
    expect(
      (
        await sendReminder({
          activationId: act.id,
          senderId: captain.id,
          now: morning,
        })
      ).ok,
    ).toBe(true);
    // A new member owes it later the same day: the DM goes, the post does not.
    await owe(db, act.id, { handle: "late_one", intent: "yes" });
    await sendReminder({
      activationId: act.id,
      senderId: null,
      now: new Date("2026-10-26T15:00:00Z"),
    });
    let rows = await queuedPosts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "reminder",
      refId: act.id,
      buttonText: "Answer in Camp 404",
    });
    // No handle is stored in the post.
    expect(JSON.stringify(rows[0])).not.toContain("cloud_404");

    // The next camp day, a new nudge posts again.
    await owe(db, act.id, { handle: "next_day", intent: "yes" });
    await sendReminder({
      activationId: act.id,
      senderId: null,
      now: new Date("2026-10-27T08:00:00Z"),
    });
    rows = await queuedPosts(db);
    expect(rows).toHaveLength(2);
  });
});

describe("drainTelegramPosts", () => {
  const h = useTestDb();

  async function queue(
    db: DB,
    values: Partial<typeof schema.telegramAnnouncements.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(schema.telegramAnnouncements)
      .values({
        chatId: "-100500",
        kind: "announcement",
        title: "Build weekend moved",
        body: "Bring **gloves**.",
        buttonText: "Open in Camp 404",
        buttonPath: "/announcements/x",
        ...values,
      })
      .returning({ id: schema.telegramAnnouncements.id });
    return row!.id;
  }

  async function statusOf(db: DB, id: string) {
    const [row] = await db
      .select({ s: schema.telegramAnnouncements.status })
      .from(schema.telegramAnnouncements)
      .where(eq(schema.telegramAnnouncements.id, id));
    return row!.s;
  }

  it("sends plain text with its button, in the topic, claimed before it goes", async () => {
    const db = h.db();
    await connectedCaptain(db, "930");
    await addPlace("930", "-100500", "7");
    const id = await queue(db, { threadId: "7" });
    const during: string[] = [];
    const send = vi.fn<TelegramPostSend>(async () => {
      during.push(await statusOf(db, id));
      return { ok: true };
    });
    const result = await drainTelegramPosts(send, { siteUrl: SITE });
    expect(result.sent).toBe(1);
    expect(during).toEqual(["sending"]);
    expect(send).toHaveBeenCalledWith("-100500", "7", {
      text: "Build weekend moved\n\nBring gloves.",
      button: { text: "Open in Camp 404", url: `${SITE}/announcements/x` },
    });
    expect(await statusOf(db, id)).toBe("sent");
  });

  it("skips a post for a removed chat and fails one queued too long", async () => {
    const db = h.db();
    const captain = await connectedCaptain(db, "931");
    await addPlace("931", "-100500");
    await addPlace("931", "-100777");
    const second = (await listTelegramPlaces()).find(
      (p) => p.chatId === "-100777",
    );
    await removeTelegramPlace({ actorId: captain.id, id: second!.id });
    const removed = await queue(db, { chatId: "-100777" });
    const stale = await queue(db, {
      createdAt: new Date(
        Date.now() - (TELEGRAM_POST_MAX_QUEUED_HOURS + 1) * 3600_000,
      ),
    });
    const send = vi.fn<TelegramPostSend>(async () => ({ ok: true }) as const);
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, removed)).toBe("skipped");
    expect(await statusOf(db, stale)).toBe("failed");
  });

  it("never sends one left sending again", async () => {
    const db = h.db();
    await connectedCaptain(db, "932");
    await addPlace("932");
    const id = await queue(db);
    await db
      .update(schema.telegramAnnouncements)
      .set({ status: "sending" })
      .where(sql`${schema.telegramAnnouncements.id} = ${id}`);
    const send = vi.fn<TelegramPostSend>(async () => ({ ok: true }) as const);
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, id)).toBe("sending");
  });

  it("works out a reminder's tags when it sends, and skips one with nobody left", async () => {
    const db = h.db();
    await connectedCaptain(db, "933");
    await addPlace("933");
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    const slow = await makeUser(db, { telegramHandle: "cloud_404" });
    await db.insert(schema.requiredActions).values({
      userId: slow.id,
      type: "questionnaire",
      actionKey: "feedback",
      version: "1",
      activationId: act.id,
      title: "Camp feedback",
      status: "pending",
    });
    await db.insert(schema.campParticipations).values({
      userId: slow.id,
      cycle: 1,
      intent: "yes",
      status: "accepted",
    });
    const reminder = {
      kind: "reminder" as const,
      title: "Camp feedback",
      body: "Please answer.",
      refId: act.id,
      buttonText: "Answer in Camp 404",
      buttonPath: "/questionnaires/x",
    };
    const first = await queue(db, reminder);
    const send = vi.fn<TelegramPostSend>(async () => ({ ok: true }) as const);
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send.mock.calls[0]![2].text).toBe(
      "Camp feedback\n\nPlease answer.\n\nStill to answer: @cloud_404.",
    );
    expect(await statusOf(db, first)).toBe("sent");

    // They answered: the next reminder has nobody to tag.
    await db
      .update(schema.requiredActions)
      .set({ status: "completed" })
      .where(eq(schema.requiredActions.userId, slow.id));
    const second = await queue(db, reminder);
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledOnce();
    expect(await statusOf(db, second)).toBe("skipped");
  });

  it("stops at a rate limit and leaves the rest queued", async () => {
    const db = h.db();
    await connectedCaptain(db, "934");
    await addPlace("934");
    const first = await queue(db);
    const second = await queue(db);
    const send = vi.fn<TelegramPostSend>(
      async () =>
        ({ ok: false, error: "Telegram 429", rateLimited: true }) as const,
    );
    expect((await drainTelegramPosts(send, { siteUrl: SITE })).deferred).toBe(
      1,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(await statusOf(db, first)).toBe("queued");
    expect(await statusOf(db, second)).toBe("queued");
  });
});
