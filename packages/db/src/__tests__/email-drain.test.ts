import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  announcementNotification,
  questionnaireReleaseNotification,
} from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { deliveryValues } from "../deliveries";
import { drainQueuedEmail, type EmailSend } from "../email";
import * as schema from "../schema";

// The email drain against real rows. Neon Auth's users live in the neon_auth
// schema, which Camp 404 does not migrate, so each test creates the part the
// drain reads.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const ID = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";
const SITE = "https://camp-404.com";

async function neonAuthUser(
  h: ReturnType<typeof useTestDb>,
  id: string,
  email: string | null,
  verified: boolean,
) {
  const client = h.client();
  await client.exec(
    `create schema if not exists neon_auth;
     create table if not exists neon_auth."user" (id text primary key, email text, "emailVerified" boolean);`,
  );
  await client.query(
    `insert into neon_auth."user" (id, email, "emailVerified") values ($1, $2, $3)`,
    [id, email, verified],
  );
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
    await h.client().exec(`drop schema if exists neon_auth cascade;`);
    const verified = await makeUser(db, { authUserId: "auth-verified" });
    const unverified = await makeUser(db, { authUserId: "auth-unverified" });
    const noAuthRow = await makeUser(db, { authUserId: "auth-missing" });
    const erased = await makeUser(db, {
      authUserId: "auth-erased",
      sanitised: true,
    });
    await neonAuthUser(h, "auth-verified", "ada@example.com", true);
    await neonAuthUser(h, "auth-unverified", "bo@example.com", false);
    await neonAuthUser(h, "auth-erased", "gone@example.com", true);

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
    });
    expect(send).toHaveBeenCalledOnce();
    const [to, email] = send.mock.calls[0]!;
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
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("records a refused or throwing send as failed and leaves quiet notices alone", async () => {
    const db = h.db();
    await h.client().exec(`drop schema if exists neon_auth cascade;`);
    const a = await makeUser(db, { authUserId: "auth-a" });
    const b = await makeUser(db, { authUserId: "auth-b" });
    await neonAuthUser(h, "auth-a", "a@example.com", true);
    await neonAuthUser(h, "auth-b", "b@example.com", true);
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

    const send: EmailSend = async (to) => {
      if (to === "a@example.com") return { ok: false, error: "bounced" };
      throw new Error("network down");
    };
    expect(await drainQueuedEmail(send, { siteUrl: SITE })).toEqual({
      sent: 0,
      failed: 2,
      skipped: 0,
    });
    const rows = await db
      .select({ emailStatus: schema.notificationDeliveries.emailStatus })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.presentation, "feed"));
    expect(rows).toEqual([{ emailStatus: "skipped" }]);
  });
});
