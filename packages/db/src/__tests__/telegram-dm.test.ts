import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  announcementNotification,
  questionnaireReminderNotification,
} from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { deliveryValues } from "../deliveries";
import {
  connectTelegram,
  createTelegramLinkCode,
  disconnectTelegram,
  drainQueuedTelegram,
  getTelegramConnection,
  recordTelegramUpdate,
  forgetTelegramUpdate,
  setTelegramNotices,
  stopTelegramByTelegramId,
  TELEGRAM_MAX_QUEUED_HOURS,
  type TelegramSend,
} from "../telegram-dm";
import * as schema from "../schema";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const ID = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";
const SITE = "https://camp-404.com";

describe("deliveryValues Telegram policy", () => {
  const h = useTestDb();

  it("queues Telegram for notices that go by push, never in-app only ones", async () => {
    const member = await makeUser(h.db());
    const payload = announcementNotification({
      broadcastId: ID,
      title: "t",
      body: "b",
    });
    const base = {
      userId: member.id,
      broadcastId: null,
      presentation: "feed" as const,
    };
    expect(
      deliveryValues(payload, { ...base, channel: "push" }).telegramStatus,
    ).toBe("queued");
    expect(
      deliveryValues(payload, { ...base, channel: "both" }).telegramStatus,
    ).toBe("queued");
    expect(
      deliveryValues(payload, { ...base, channel: "in_app" }).telegramStatus,
    ).toBe("skipped");
  });
});

describe("connectTelegram", () => {
  const h = useTestDb();

  it("connects a member once, keeping a handle they typed", async () => {
    const db = h.db();
    const member = await makeUser(db, { telegramHandle: "@typed" });
    const code = await createTelegramLinkCode(member.id);

    const stored = await db.select().from(schema.telegramLinkCodes);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.codeHash).not.toContain(code);

    expect(
      await connectTelegram({
        code,
        telegramUserId: "111",
        username: "fromtg",
      }),
    ).toEqual({ ok: true, userId: member.id });
    expect(await getTelegramConnection(member.id)).toEqual({
      connected: true,
      handle: "typed",
      notices: "mine",
    });

    // Used once.
    expect(
      await connectTelegram({ code, telegramUserId: "111", username: null }),
    ).toEqual({ ok: false, reason: "link_run_out" });
  });

  it("fills an empty handle from Telegram", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const code = await createTelegramLinkCode(member.id);
    await connectTelegram({
      code,
      telegramUserId: "112",
      username: "cloud_404",
    });
    expect((await getTelegramConnection(member.id)).handle).toBe("cloud_404");
  });

  it("refuses a code past its 10 minutes and an unknown code", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const code = await createTelegramLinkCode(member.id);
    await db
      .update(schema.telegramLinkCodes)
      .set({ expiresAt: sql`now() - interval '1 second'` });
    expect(
      await connectTelegram({ code, telegramUserId: "113", username: null }),
    ).toEqual({ ok: false, reason: "link_run_out" });
    expect(
      await connectTelegram({
        code: "nope",
        telegramUserId: "113",
        username: null,
      }),
    ).toEqual({ ok: false, reason: "link_run_out" });
    expect((await getTelegramConnection(member.id)).connected).toBe(false);
  });

  it("lets only one of two racing uses of a code win", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const code = await createTelegramLinkCode(member.id);
    const results = await Promise.all([
      connectTelegram({ code, telegramUserId: "114", username: null }),
      connectTelegram({ code, telegramUserId: "115", username: null }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("moves a Telegram account off the member who held it before", async () => {
    const db = h.db();
    const before = await makeUser(db, {
      telegramUserId: "116",
      telegramDmAt: new Date(),
    });
    const now = await makeUser(db);
    const code = await createTelegramLinkCode(now.id);
    expect(
      (await connectTelegram({ code, telegramUserId: "116", username: null }))
        .ok,
    ).toBe(true);
    const [old] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, before.id));
    expect(old!.telegramUserId).toBeNull();
    expect(old!.telegramDmAt).toBeNull();
    expect((await getTelegramConnection(now.id)).connected).toBe(true);
  });

  it("refuses an erased account", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const code = await createTelegramLinkCode(member.id);
    await db
      .update(schema.users)
      .set({ sanitised: true })
      .where(eq(schema.users.id, member.id));
    expect(
      (await connectTelegram({ code, telegramUserId: "117", username: null }))
        .ok,
    ).toBe(false);
  });

  it("stops by Telegram id, disconnects and keeps the setting", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "118",
      telegramDmAt: new Date(),
    });
    await setTelegramNotices(member.id, "all");
    expect(await stopTelegramByTelegramId("118")).toBe(true);
    expect(await stopTelegramByTelegramId("999")).toBe(false);
    expect(await getTelegramConnection(member.id)).toEqual({
      connected: false,
      handle: null,
      notices: "all",
    });
    await db
      .update(schema.users)
      .set({ telegramDmAt: new Date() })
      .where(eq(schema.users.id, member.id));
    await disconnectTelegram(member.id);
    expect((await getTelegramConnection(member.id)).connected).toBe(false);
  });
});

describe("recordTelegramUpdate", () => {
  useTestDb();

  it("records an update once, and again after it is forgotten", async () => {
    expect(await recordTelegramUpdate(5001)).toBe(true);
    expect(await recordTelegramUpdate(5001)).toBe(false);
    await forgetTelegramUpdate(5001);
    expect(await recordTelegramUpdate(5001)).toBe(true);
  });
});

describe("drainQueuedTelegram", () => {
  const h = useTestDb();
  const payload = questionnaireReminderNotification({
    activationId: ID,
    title: "Camp feedback",
    dueAt: null,
  });
  const quiet = announcementNotification({
    broadcastId: ID,
    title: "Quiet",
    body: "b",
  });

  async function queue(db: DB, userId: string, p = payload, createdAt?: Date) {
    const [row] = await db
      .insert(schema.notificationDeliveries)
      .values(
        deliveryValues(p, {
          userId,
          broadcastId: null,
          channel: "both",
          presentation: "feed",
          createdAt,
        }),
      )
      .returning({ id: schema.notificationDeliveries.id });
    return row!.id;
  }

  async function statusOf(db: DB, id: string) {
    const [row] = await db
      .select({ s: schema.notificationDeliveries.telegramStatus })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.id, id));
    return row!.s;
  }

  const past = new Date(Date.now() - 60 * 60 * 1000);

  it("sends to connected members and skips everyone else", async () => {
    const db = h.db();
    const connected = await makeUser(db, {
      telegramUserId: "201",
      telegramDmAt: past,
    });
    const notConnected = await makeUser(db, { telegramUserId: "202" });
    const noId = await makeUser(db, { telegramDmAt: past });
    const erased = await makeUser(db, {
      telegramUserId: "203",
      telegramDmAt: past,
      sanitised: true,
    });
    const system = await makeUser(db, {
      telegramUserId: "204",
      telegramDmAt: past,
      isSystem: true,
    });
    const ids = {
      connected: await queue(db, connected.id),
      notConnected: await queue(db, notConnected.id),
      noId: await queue(db, noId.id),
      erased: await queue(db, erased.id),
      system: await queue(db, system.id),
    };

    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    expect(await drainQueuedTelegram(send, { siteUrl: SITE })).toEqual({
      sent: 1,
      failed: 0,
      skipped: 4,
      deferred: 0,
      expired: 0,
    });
    expect(send).toHaveBeenCalledOnce();
    const [chatId, notice] = send.mock.calls[0]!;
    expect(chatId).toBe("201");
    expect(notice.text.startsWith("Camp feedback")).toBe(true);
    expect(notice.url).toBe(`${SITE}/questionnaires/${ID}`);
    expect(await statusOf(db, ids.connected)).toBe("sent");
    for (const id of [ids.notConnected, ids.noId, ids.erased, ids.system]) {
      expect(await statusOf(db, id)).toBe("skipped");
    }
    // Nothing left: a second run sends nothing.
    expect((await drainQueuedTelegram(send, { siteUrl: SITE })).sent).toBe(0);
  });

  it("never sends a notice written before the member connected", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "205",
      telegramDmAt: new Date(),
    });
    const old = await queue(db, member.id, payload, past);
    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, old)).toBe("skipped");
  });

  it("sends only the notices about a member by default", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "206",
      telegramDmAt: past,
    });
    const mine = await queue(db, member.id, payload);
    const campNews = await queue(db, member.id, quiet);
    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledOnce();
    expect(await statusOf(db, mine)).toBe("sent");
    expect(await statusOf(db, campNews)).toBe("skipped");
  });

  it("sends camp announcements too to a member who chose all", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "210",
      telegramDmAt: past,
      telegramNotices: "all",
    });
    const mine = await queue(db, member.id, payload);
    const campNews = await queue(db, member.id, quiet);
    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledTimes(2);
    expect(await statusOf(db, mine)).toBe("sent");
    expect(await statusOf(db, campNews)).toBe("sent");
  });

  it("marks a notice sending before it sends, so a cut-off run never resends it", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "211",
      telegramDmAt: past,
    });
    const id = await queue(db, member.id);
    const during: string[] = [];
    const send = vi.fn<TelegramSend>(async () => {
      // The claim is committed: another run reads it as taken.
      during.push(await statusOf(db, id));
      return { ok: true } as const;
    });
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(during).toEqual(["sending"]);
    expect(await statusOf(db, id)).toBe("sent");
  });

  it("never sends a notice left sending, and fails it once it is old", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "212",
      telegramDmAt: new Date(Date.now() - 48 * 3600_000),
    });
    const recent = await queue(db, member.id);
    const old = await queue(
      db,
      member.id,
      payload,
      new Date(Date.now() - (TELEGRAM_MAX_QUEUED_HOURS + 1) * 3600_000),
    );
    await db
      .update(schema.notificationDeliveries)
      .set({ telegramStatus: "sending" })
      .where(sql`${schema.notificationDeliveries.id} in (${recent}, ${old})`);
    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, recent)).toBe("sending");
    expect(await statusOf(db, old)).toBe("failed");
  });

  it("marks a notice queued too long as failed, unsent", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "207",
      telegramDmAt: new Date(Date.now() - 48 * 3600_000),
    });
    const stale = await queue(
      db,
      member.id,
      payload,
      new Date(Date.now() - (TELEGRAM_MAX_QUEUED_HOURS + 1) * 3600_000),
    );
    const send = vi.fn<TelegramSend>(async () => ({ ok: true }) as const);
    expect((await drainQueuedTelegram(send, { siteUrl: SITE })).expired).toBe(
      1,
    );
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, stale)).toBe("failed");
  });

  it("stops at a rate limit and leaves the rest queued", async () => {
    const db = h.db();
    const a = await makeUser(db, { telegramUserId: "208", telegramDmAt: past });
    const b = await makeUser(db, { telegramUserId: "209", telegramDmAt: past });
    const first = await queue(db, a.id);
    const second = await queue(db, b.id);
    const send = vi.fn<TelegramSend>(
      async () => ({ ok: false, error: "429", rateLimited: true }) as const,
    );
    expect(await drainQueuedTelegram(send, { siteUrl: SITE })).toMatchObject({
      sent: 0,
      deferred: 1,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(await statusOf(db, first)).toBe("queued");
    expect(await statusOf(db, second)).toBe("queued");
  });

  it("disconnects a member who blocked Ol' Jeb and skips the rest of theirs", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "210",
      telegramDmAt: past,
    });
    const one = await queue(db, member.id);
    const two = await queue(db, member.id);
    const send = vi.fn<TelegramSend>(
      async () => ({ ok: false, error: "403", blocked: true }) as const,
    );
    await drainQueuedTelegram(send, { siteUrl: SITE });
    expect(send).toHaveBeenCalledOnce();
    expect(await statusOf(db, one)).toBe("skipped");
    expect(await statusOf(db, two)).toBe("skipped");
    expect((await getTelegramConnection(member.id)).connected).toBe(false);
  });

  it("marks a refused send failed", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      telegramUserId: "211",
      telegramDmAt: past,
    });
    const id = await queue(db, member.id);
    const send = vi.fn<TelegramSend>(
      async () => ({ ok: false, error: "400 bad request" }) as const,
    );
    expect((await drainQueuedTelegram(send, { siteUrl: SITE })).failed).toBe(1);
    expect(await statusOf(db, id)).toBe("failed");
  });
});
