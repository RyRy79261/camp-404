import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeMembership, makeUser } from "./_factories";
import {
  POST_IN_TELEGRAM_CLOSED,
  POST_IN_TELEGRAM_NO_PLACE,
  POST_IN_TELEGRAM_REFUSED,
  POST_IN_TELEGRAM_TOO_SOON,
  postQuestionnaireInTelegram,
} from "../questionnaire-lifecycle";
import {
  addTelegramPlace,
  drainTelegramPosts,
  listTelegramPlaces,
  questionnairePostCandidates,
  type TelegramPostSend,
} from "../telegram-posts";
import * as schema from "../schema";

// "Post in Telegram" on a sent questionnaire (owner's mock-up, 2026-10-27):
// who may post it, what the server keeps of the dialog's picks, and what the
// drain sends.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const SITE = "https://camp-404.com";
const past = () => new Date(Date.now() - 60 * 60 * 1000);

describe("Post in Telegram", () => {
  const h = useTestDb();

  /** An open send of a questionnaire `author` wrote, and one place to post in. */
  async function setUp(db: DB, status: "open" | "closed" = "open") {
    const captain = await makeUser(db, {
      rank: "captain",
      telegramUserId: "950",
      telegramDmAt: past(),
    });
    await addTelegramPlace({
      telegramUserId: "950",
      chatId: "-100700",
      threadId: "9",
      title: "Camp 404 Announcements",
      username: null,
    });
    const author = await makeUser(db);
    await makeMembership(db, {
      userId: author.id,
      team: "kitchen",
      isLead: true,
      cycle: 1,
    });
    await db.insert(schema.questionnaireDefinitions).values({
      key: "feedback",
      title: "Camp feedback",
      definition: {} as never,
      status: "published",
      version: "v1",
      createdBy: author.id,
    });
    const act = await makeActivation(db, { status, cycle: 1 });
    const places = await listTelegramPlaces();
    return { captain, author, act, placeIds: places.map((p) => p.id) };
  }

  async function owe(
    db: DB,
    activationId: string,
    input: {
      name?: string;
      handle?: string | null;
      intent?: "yes" | "maybe" | null;
      connected?: boolean;
      answered?: boolean;
    } = {},
  ) {
    const user = await makeUser(db, {
      displayName: input.name ?? "Member",
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
        status: input.intent === "yes" ? "applied" : "maybe",
      });
    }
    return user;
  }

  async function posts(db: DB) {
    return db.select().from(schema.telegramAnnouncements);
  }

  it("lists who still owes it, with what they said and how to reach them", async () => {
    const db = h.db();
    const { act } = await setUp(db);
    await owe(db, act.id, { name: "Cloud", handle: "cloud_404" });
    await owe(db, act.id, {
      name: "Mike",
      handle: "mike_404",
      intent: "maybe",
    });
    await owe(db, act.id, { name: "Alex", handle: null, intent: "yes" });
    await owe(db, act.id, {
      name: "Sam",
      handle: "sam_404",
      connected: true,
    });
    await owe(db, act.id, { name: "Done", handle: "done_404", answered: true });
    const list = await questionnairePostCandidates(act.id);
    expect(list.map((c) => [c.name, c.intent, c.mention, c.connected])).toEqual(
      [
        ["Alex", "yes", null, false],
        ["Cloud", null, "@cloud_404", false],
        ["Mike", "maybe", "@mike_404", false],
        ["Sam", null, "@sam_404", true],
      ],
    );
  });

  it("lets its author and a captain post it, and refuses a lead who did not write it", async () => {
    const db = h.db();
    const { captain, author, act, placeIds } = await setUp(db);
    const otherLead = await makeUser(db);
    await makeMembership(db, {
      userId: otherLead.id,
      team: "structures",
      isLead: true,
      cycle: 1,
    });
    const base = {
      activationId: act.id,
      tagUserIds: [],
      placeIds,
      messageConnected: false,
    };
    expect(
      await postQuestionnaireInTelegram({ ...base, actorId: otherLead.id }),
    ).toEqual({ ok: false, error: POST_IN_TELEGRAM_REFUSED });
    const member = await makeUser(db);
    expect(
      await postQuestionnaireInTelegram({ ...base, actorId: member.id }),
    ).toEqual({ ok: false, error: POST_IN_TELEGRAM_REFUSED });
    expect(await posts(db)).toHaveLength(0);

    const now = new Date("2026-10-27T09:00:00Z");
    expect(
      await postQuestionnaireInTelegram({ ...base, actorId: author.id, now }),
    ).toMatchObject({ ok: true, places: 1 });
    expect(
      await postQuestionnaireInTelegram({
        ...base,
        actorId: captain.id,
        now: new Date("2026-10-27T09:05:00Z"),
      }),
    ).toMatchObject({ ok: true, places: 1 });
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "telegram.questionnaire_posted"));
    expect(audit).toHaveLength(2);
  });

  it("keeps only tags of members it still waits on", async () => {
    const db = h.db();
    const { captain, act, placeIds } = await setUp(db);
    const owes = await owe(db, act.id, { handle: "cloud_404" });
    const answered = await owe(db, act.id, {
      handle: "done_404",
      answered: true,
    });
    const noHandle = await owe(db, act.id, { handle: null });
    const stranger = await makeUser(db, { telegramHandle: "stranger_1" });
    const result = await postQuestionnaireInTelegram({
      actorId: captain.id,
      activationId: act.id,
      tagUserIds: [owes.id, answered.id, noHandle.id, stranger.id],
      placeIds: [...placeIds, "00000000-0000-4000-8000-000000000000"],
      messageConnected: false,
    });
    expect(result).toEqual({ ok: true, places: 1, tagged: 1, messaged: 0 });
    const [post] = await posts(db);
    expect(post!.kind).toBe("questionnaire");
    expect(post!.tagUserIds).toEqual([owes.id]);
    expect(post!.threadId).toBe("9");
  });

  it("refuses a closed send, no chat, and a double press", async () => {
    const db = h.db();
    const closed = await setUp(db, "closed");
    expect(
      await postQuestionnaireInTelegram({
        actorId: closed.captain.id,
        activationId: closed.act.id,
        tagUserIds: [],
        placeIds: closed.placeIds,
        messageConnected: false,
      }),
    ).toEqual({ ok: false, error: POST_IN_TELEGRAM_CLOSED });

    const open = await makeActivation(db, { status: "open", cycle: 1 });
    const input = {
      actorId: closed.captain.id,
      activationId: open.id,
      tagUserIds: [],
      messageConnected: false,
      now: new Date("2026-10-27T09:00:10Z"),
    };
    expect(
      await postQuestionnaireInTelegram({ ...input, placeIds: [] }),
    ).toEqual({ ok: false, error: POST_IN_TELEGRAM_NO_PLACE });
    expect(
      await postQuestionnaireInTelegram({
        ...input,
        placeIds: closed.placeIds,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await postQuestionnaireInTelegram({
        ...input,
        placeIds: closed.placeIds,
        now: new Date("2026-10-27T09:00:40Z"),
      }),
    ).toEqual({ ok: false, error: POST_IN_TELEGRAM_TOO_SOON });
  });

  it("sends the connected members it waits on a private reminder", async () => {
    const db = h.db();
    const { captain, act, placeIds } = await setUp(db);
    const sam = await owe(db, act.id, { handle: "sam_404", connected: true });
    await owe(db, act.id, { handle: "cloud_404" });
    await owe(db, act.id, { connected: true, answered: true });
    const result = await postQuestionnaireInTelegram({
      actorId: captain.id,
      activationId: act.id,
      tagUserIds: [],
      placeIds,
      messageConnected: true,
    });
    expect(result).toMatchObject({ ok: true, messaged: 1 });
    const deliveries = await db
      .select({
        userId: schema.notificationDeliveries.userId,
        kind: schema.notificationDeliveries.kind,
        telegram: schema.notificationDeliveries.telegramStatus,
      })
      .from(schema.notificationDeliveries);
    expect(deliveries).toEqual([
      { userId: sam.id, kind: "questionnaire_reminder", telegram: "queued" },
    ]);
  });

  it("sends every pick still owing it, and skips the post once the send closes", async () => {
    const db = h.db();
    const { captain, act, placeIds } = await setUp(db);
    const cloud = await owe(db, act.id, { handle: "cloud_404" });
    const mike = await owe(db, act.id, { handle: "mike_404" });
    await postQuestionnaireInTelegram({
      actorId: captain.id,
      activationId: act.id,
      tagUserIds: [cloud.id, mike.id],
      placeIds,
      messageConnected: false,
      now: new Date("2026-10-27T09:00:00Z"),
    });
    // Mike answers before Ol' Jeb sends it.
    await db
      .update(schema.requiredActions)
      .set({ status: "completed" })
      .where(eq(schema.requiredActions.userId, mike.id));
    const send = vi.fn<TelegramPostSend>(async () => ({ ok: true }) as const);
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledOnce();
    const [chatId, threadId, post] = send.mock.calls[0]!;
    expect([chatId, threadId]).toEqual(["-100700", "9"]);
    expect(post.text.endsWith("@cloud_404, this one's for you.")).toBe(true);
    expect(post.text).not.toContain("@mike_404");
    expect(post.button?.text).toBe("Answer in Camp 404");

    await postQuestionnaireInTelegram({
      actorId: captain.id,
      activationId: act.id,
      tagUserIds: [cloud.id],
      placeIds,
      messageConnected: false,
      now: new Date("2026-10-27T10:00:00Z"),
    });
    await db
      .update(schema.questionnaireActivations)
      .set({ status: "closed" })
      .where(eq(schema.questionnaireActivations.id, act.id));
    await drainTelegramPosts(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledOnce();
  });
});
