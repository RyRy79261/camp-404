import { describe, expect, it, vi } from "vitest";
import { announcementNotification } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { deliveryValues } from "../deliveries";
import { drainQueuedPush } from "../push";
import type { PushSend } from "../push-status";
import * as schema from "../schema";

// The push drain against real rows. It now runs right after a send and again
// on a page load, so it must send each queued push once and leave the rest.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const BROADCAST = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";

async function queue(
  db: DB,
  userId: string,
  channel: "push" | "both" | "in_app",
  createdAt: Date,
) {
  const [row] = await db
    .insert(schema.notificationDeliveries)
    .values({
      ...deliveryValues(
        announcementNotification({
          broadcastId: BROADCAST,
          title: `t-${createdAt.toISOString()}`,
          body: "b",
        }),
        { userId, broadcastId: null, channel, presentation: "feed" },
      ),
      createdAt,
    })
    .returning({ id: schema.notificationDeliveries.id });
  return row!.id;
}

async function pushStatuses(db: DB) {
  const rows = await db
    .select({
      id: schema.notificationDeliveries.id,
      pushStatus: schema.notificationDeliveries.pushStatus,
    })
    .from(schema.notificationDeliveries);
  return new Map(rows.map((r) => [r.id, r.pushStatus]));
}

const okSend = () =>
  vi.fn<PushSend>(async (tokens) =>
    tokens.map((token) => ({ token, success: true })),
  );

describe("drainQueuedPush", () => {
  const h = useTestDb();

  it("sends each queued push once; a second drain sends nothing", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: member.id, token: "tok-1", platform: "web" });
    const push = await queue(db, member.id, "push", new Date("2026-09-01"));
    const inApp = await queue(db, member.id, "in_app", new Date("2026-09-02"));

    const send = okSend();
    expect(await drainQueuedPush(send)).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      pruned: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const after = await pushStatuses(db);
    expect(after.get(push)).toBe("sent");
    expect(after.get(inApp)).toBe("queued");

    const again = okSend();
    expect((await drainQueuedPush(again)).sent).toBe(0);
    expect(again).not.toHaveBeenCalled();
  });

  it("sends at most `limit` per run, oldest first, and leaves the rest queued", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: member.id, token: "tok-2", platform: "web" });
    const newest = await queue(db, member.id, "both", new Date("2026-09-03"));
    const oldest = await queue(db, member.id, "both", new Date("2026-09-01"));

    const result = await drainQueuedPush(okSend(), { limit: 1 });
    expect(result.sent).toBe(1);
    const after = await pushStatuses(db);
    expect(after.get(oldest)).toBe("sent");
    expect(after.get(newest)).toBe("queued");
  });

  it("skips a member with no device and prunes a dead token", async () => {
    const db = h.db();
    const noDevice = await makeUser(db);
    const deadDevice = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: deadDevice.id, token: "tok-dead", platform: "web" });
    await queue(db, noDevice.id, "push", new Date("2026-09-01"));
    await queue(db, deadDevice.id, "push", new Date("2026-09-02"));

    const send = vi.fn<PushSend>(async (tokens) =>
      tokens.map((token) => ({
        token,
        success: false,
        errorCode: "messaging/registration-token-not-registered",
      })),
    );
    expect(await drainQueuedPush(send)).toEqual({
      sent: 0,
      failed: 1,
      skipped: 1,
      pruned: 1,
    });
    expect(await db.select().from(schema.pushTokens)).toEqual([]);
  });

  it("keeps a push it sent marked sent when a later send in the run throws", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: member.id, token: "tok-3", platform: "web" });
    const first = await queue(db, member.id, "push", new Date("2026-09-01"));
    const second = await queue(db, member.id, "push", new Date("2026-09-02"));
    const third = await queue(db, member.id, "push", new Date("2026-09-03"));

    // FCM refuses the whole request for the second push only.
    const send = vi.fn<PushSend>(async (tokens, _note, data) => {
      if (data.deliveryId === second) throw new Error("FCM 503");
      return tokens.map((token) => ({ token, success: true }));
    });
    expect(await drainQueuedPush(send)).toEqual({
      sent: 2,
      failed: 0,
      skipped: 0,
      pruned: 0,
    });
    const after = await pushStatuses(db);
    expect(after.get(first)).toBe("sent");
    expect(after.get(second)).toBe("queued");
    expect(after.get(third)).toBe("sent");

    // The next run sends only the one that was left: nobody gets a push twice.
    const again = okSend();
    expect((await drainQueuedPush(again)).sent).toBe(1);
    expect(again).toHaveBeenCalledOnce();
    expect(again.mock.calls[0]![2].deliveryId).toBe(second);
  });

  it("stops after three sends in a row throw, leaving the rest queued", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: member.id, token: "tok-4", platform: "web" });
    for (let day = 1; day <= 5; day++) {
      await queue(db, member.id, "push", new Date(`2026-09-0${day}`));
    }
    const send = vi.fn<PushSend>(async () => {
      throw new Error("FCM down");
    });
    expect(await drainQueuedPush(send)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      pruned: 0,
    });
    expect(send).toHaveBeenCalledTimes(3);
    const after = await pushStatuses(db);
    expect([...after.values()].every((s) => s === "queued")).toBe(true);
  });

  it("marks a send that never answers failed (it may have gone out), and stops after three", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db
      .insert(schema.pushTokens)
      .values({ userId: member.id, token: "tok-5", platform: "web" });
    for (let day = 1; day <= 4; day++) {
      await queue(db, member.id, "push", new Date(`2026-09-0${day}`));
    }
    const send = vi.fn<PushSend>(() => new Promise(() => {}));
    expect(await drainQueuedPush(send, { sendTimeoutMs: 20 })).toEqual({
      sent: 0,
      failed: 3,
      skipped: 0,
      pruned: 0,
    });
    expect(send).toHaveBeenCalledTimes(3);
    // Not retried by the next run: a late answer may already be on the phone.
    const statuses = [...(await pushStatuses(db)).values()].sort();
    expect(statuses).toEqual(["failed", "failed", "failed", "queued"]);
  });
});
