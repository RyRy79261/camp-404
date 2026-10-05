import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  announcementNotification,
  questionnaireReleaseNotification,
} from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { deliveryValues } from "../deliveries";
import {
  drainQueuedEmail,
  EMAIL_MAX_DEFERRALS_IN_A_ROW,
  EMAIL_MAX_QUEUED_HOURS,
  emailIdempotencyKey,
  type EmailSend,
} from "../email";
import * as schema from "../schema";

// The email drain against real rows: each member's address is read from the
// sign-in identity table (`user`), joined on users.auth_user_id.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const ID = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";
const SITE = "https://camp-404.com";

async function authIdentity(
  db: DB,
  id: string,
  email: string,
  verified: boolean,
) {
  await db
    .insert(schema.user)
    .values({ id, name: email, email, emailVerified: verified });
}

async function statuses(db: DB) {
  const rows = await db
    .select({
      userId: schema.notificationDeliveries.userId,
      emailStatus: schema.notificationDeliveries.emailStatus,
    })
    .from(schema.notificationDeliveries);
  return new Map(rows.map((r) => [r.userId, r.emailStatus]));
}

describe("deliveryValues email policy", () => {
  const h = useTestDb();

  it("queues email only for notices a member must not miss", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const must = deliveryValues(
      announcementNotification({ broadcastId: ID, title: "t", body: "b" }),
      {
        userId: member.id,
        broadcastId: null,
        channel: "both",
        presentation: "acknowledge",
      },
    );
    const quiet = deliveryValues(
      announcementNotification({ broadcastId: ID, title: "t", body: "b" }),
      {
        userId: member.id,
        broadcastId: null,
        channel: "both",
        presentation: "feed",
      },
    );
    expect(must.emailStatus).toBe("queued");
    expect(quiet.emailStatus).toBe("skipped");
  });
});

describe("drainQueuedEmail", () => {
  const h = useTestDb();

  it("emails verified members one at a time and skips the rest", async () => {
    const db = h.db();
    const verified = await makeUser(db, { authUserId: "auth-verified" });
    const unverified = await makeUser(db, { authUserId: "auth-unverified" });
    const noAuthRow = await makeUser(db, { authUserId: "auth-missing" });
    const erased = await makeUser(db, {
      authUserId: "auth-erased",
      sanitised: true,
    });
    await authIdentity(db, "auth-verified", "ada@example.com", true);
    await authIdentity(db, "auth-unverified", "bo@example.com", false);
    await authIdentity(db, "auth-erased", "gone@example.com", true);

    const payload = questionnaireReleaseNotification({
      activationId: ID,
      title: "Camp feedback",
      dueAt: null,
      blocking: false,
    });
    for (const user of [verified, unverified, noAuthRow, erased]) {
      await db.insert(schema.notificationDeliveries).values(
        deliveryValues(payload, {
          userId: user.id,
          broadcastId: null,
          channel: "both",
          presentation: "feed",
        }),
      );
    }

    const send = vi.fn<EmailSend>(async () => ({ ok: true }) as const);
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 1,
      failed: 0,
      skipped: 3,
      deferred: 0,
      expired: 0,
    });
    expect(send).toHaveBeenCalledOnce();
    const [to, email, sendOptions] = send.mock.calls[0]!;
    const [delivery] = await db
      .select({ id: schema.notificationDeliveries.id })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, verified.id));
    expect(sendOptions.idempotencyKey).toBe(emailIdempotencyKey(delivery!.id));
    expect(to).toBe("ada@example.com");
    expect(email.subject).toBe("Camp 404: Camp feedback");
    expect(email.text).toContain(`${SITE}/questionnaires/${ID}`);

    const after = await statuses(db);
    expect(after.get(verified.id)).toBe("sent");
    expect(after.get(unverified.id)).toBe("skipped");
    expect(after.get(noAuthRow.id)).toBe("skipped");
    expect(after.get(erased.id)).toBe("skipped");

    // Nothing is queued any more, so a second run sends nothing.
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      deferred: 0,
      expired: 0,
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("records a send refused for good as failed and leaves quiet notices alone", async () => {
    const db = h.db();
    const a = await makeUser(db, { authUserId: "auth-a" });
    const b = await makeUser(db, { authUserId: "auth-b" });
    await authIdentity(db, "auth-a", "a@example.com", true);
    await authIdentity(db, "auth-b", "b@example.com", true);
    const loud = announcementNotification({
      broadcastId: ID,
      title: "Burn night",
      body: "Meet at 8.",
    });
    await db.insert(schema.notificationDeliveries).values([
      deliveryValues(loud, {
        userId: a.id,
        broadcastId: null,
        channel: "both",
        presentation: "acknowledge",
      }),
      deliveryValues(loud, {
        userId: b.id,
        broadcastId: null,
        channel: "both",
        presentation: "acknowledge",
      }),
      deliveryValues(loud, {
        userId: b.id,
        broadcastId: null,
        channel: "both",
        presentation: "feed",
      }),
    ]);

    const send: EmailSend = async () => ({ ok: false, error: "bounced" });
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 0,
      failed: 2,
      skipped: 0,
      deferred: 0,
      expired: 0,
    });
    const rows = await db
      .select({ emailStatus: schema.notificationDeliveries.emailStatus })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.presentation, "feed"));
    expect(rows).toEqual([{ emailStatus: "skipped" }]);
  });

  /** Three verified members, each with one loud email queued, oldest first. */
  async function queueThree(db: DB, minutesAgo: number[] = [30, 20, 10]) {
    const users = [];
    for (const [i, name] of ["a", "b", "c"].entries()) {
      const user = await makeUser(db, { authUserId: `auth-${name}` });
      await authIdentity(db, `auth-${name}`, `${name}@example.com`, true);
      await db.insert(schema.notificationDeliveries).values({
        ...deliveryValues(
          announcementNotification({
            broadcastId: ID,
            title: "Burn night",
            body: "Meet at 8.",
          }),
          {
            userId: user.id,
            broadcastId: null,
            channel: "both",
            presentation: "acknowledge",
          },
        ),
        createdAt: new Date(Date.now() - minutesAgo[i]! * 60_000),
      });
      users.push(user);
    }
    return users as [(typeof users)[0], (typeof users)[0], (typeof users)[0]];
  }

  it("leaves an email that will not go through queued, and still sends the ones behind it", async () => {
    const db = h.db();
    const [a, b, c] = await queueThree(db);

    // a always fails "not now" (a 5xx, a timeout); b's send throws.
    const send = vi.fn<EmailSend>(async (to) => {
      if (to === "a@example.com")
        return { ok: false, error: "Resend 503: down", retryable: true };
      if (to === "b@example.com") throw new Error("network down");
      return { ok: true };
    });
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      deferred: 2,
      expired: 0,
    });
    const after = await statuses(db);
    expect(after.get(a.id)).toBe("queued");
    expect(after.get(b.id)).toBe("queued");
    expect(after.get(c.id)).toBe("sent");

    // The next run tries a and b again.
    const next = vi.fn<EmailSend>(async () => ({ ok: true }) as const);
    expect(await drainQueuedEmail(next, { siteUrl: SITE })).toMatchObject({
      sent: 2,
      deferred: 0,
    });
  });

  it("stops the run at a rate limit, and after three 'not now' answers in a row", async () => {
    const db = h.db();
    const [a, b, c] = await queueThree(db);

    const limited = vi.fn<EmailSend>(async () => ({
      ok: false,
      error: "Resend 429: slow down",
      retryable: true,
      rateLimited: true,
    }));
    expect(await drainQueuedEmail(limited, { siteUrl: SITE })).toMatchObject({
      sent: 0,
      deferred: 1,
    });
    expect(limited).toHaveBeenCalledOnce();

    const down = vi.fn<EmailSend>(async () => ({
      ok: false,
      error: "Resend unreachable (TimeoutError)",
      retryable: true,
    }));
    expect(await drainQueuedEmail(down, { siteUrl: SITE })).toMatchObject({
      deferred: EMAIL_MAX_DEFERRALS_IN_A_ROW,
    });
    expect(down).toHaveBeenCalledTimes(EMAIL_MAX_DEFERRALS_IN_A_ROW);

    const after = await statuses(db);
    for (const user of [a, b, c]) expect(after.get(user.id)).toBe("queued");
  });

  it("marks an email queued too long failed, without sending it", async () => {
    const db = h.db();
    // a was queued past the cutoff (so a retry could fall outside Resend's
    // 24-hour idempotency window); b and c are fresh.
    const [a, b, c] = await queueThree(db, [
      EMAIL_MAX_QUEUED_HOURS * 60 + 5,
      20,
      10,
    ]);
    const send = vi.fn<EmailSend>(async () => ({ ok: true }) as const);
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 2,
      failed: 1,
      skipped: 0,
      deferred: 0,
      expired: 1,
    });
    expect(send.mock.calls.map(([to]) => to)).toEqual([
      "b@example.com",
      "c@example.com",
    ]);
    const after = await statuses(db);
    expect(after.get(a.id)).toBe("failed");
    expect(after.get(b.id)).toBe("sent");
    expect(after.get(c.id)).toBe("sent");
  });
});
