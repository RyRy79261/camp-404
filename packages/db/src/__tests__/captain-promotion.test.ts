import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  acceptCaptainPromotion,
  decideCaptainPromotion,
  sendCaptainPromotion,
} from "../captain-promotion";
import * as schema from "../schema";

// The two-sided captain handshake against real rows: a send tells the target
// once, and an accept is one transaction (status, rank, audit) that only the
// target can make.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function noticesFor(db: DB, userId: string) {
  return db
    .select({
      kind: schema.notificationDeliveries.kind,
      body: schema.notificationDeliveries.body,
      refId: schema.notificationDeliveries.refId,
      presentation: schema.notificationDeliveries.presentation,
    })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.userId, userId));
}

async function rankOf(db: DB, userId: string) {
  const [row] = await db
    .select({ rank: schema.users.rank })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row!.rank;
}

describe("sendCaptainPromotion", () => {
  const h = useTestDb();

  it("tells the target who asked, once, however often it is sent", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      displayName: "Captain Jo",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });

    const first = await sendCaptainPromotion({
      targetUserId: member.id,
      requestedByUserId: captain.id,
    });
    const again = await sendCaptainPromotion({
      targetUserId: member.id,
      requestedByUserId: captain.id,
    });
    expect(again.id).toBe(first.id);

    const notices = await noticesFor(db, member.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: "captain_promotion",
      refId: first.id,
      presentation: "popup",
    });
    expect(notices[0]!.body).toContain("Captain Jo asked you");
    expect(await rankOf(db, member.id)).toBe("member");
  });
});

describe("acceptCaptainPromotion", () => {
  const h = useTestDb();

  it("makes the target a captain and records it, in one step", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const request = await sendCaptainPromotion({
      targetUserId: member.id,
      requestedByUserId: captain.id,
    });

    const accepted = await acceptCaptainPromotion({
      requestId: request.id,
      actorUserId: member.id,
    });
    expect(accepted?.status).toBe("accepted");
    expect(await rankOf(db, member.id)).toBe("captain");

    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "member.rank_changed"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: member.id, target: member.id });
    expect(audit[0]!.metadata).toMatchObject({
      from: "member",
      to: "captain",
      via: "captain_promotion",
      requestId: request.id,
      requestedByUserId: captain.id,
    });

    // A second accept is a no-op, not a second audit row.
    expect(
      await acceptCaptainPromotion({
        requestId: request.id,
        actorUserId: member.id,
      }),
    ).toBeNull();
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "member.rank_changed")),
    ).toHaveLength(1);
  });

  it("lets nobody but the target accept, and nothing after a decline", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const bystander = await makeUser(db, { approvalStatus: "approved" });
    const request = await sendCaptainPromotion({
      targetUserId: member.id,
      requestedByUserId: captain.id,
    });

    for (const actor of [captain.id, bystander.id]) {
      expect(
        await acceptCaptainPromotion({
          requestId: request.id,
          actorUserId: actor,
        }),
      ).toBeNull();
    }
    expect(await rankOf(db, bystander.id)).toBe("member");

    expect(
      (
        await decideCaptainPromotion({
          requestId: request.id,
          status: "declined",
          actorUserId: member.id,
        })
      )?.status,
    ).toBe("declined");
    expect(
      await acceptCaptainPromotion({
        requestId: request.id,
        actorUserId: member.id,
      }),
    ).toBeNull();
    expect(await rankOf(db, member.id)).toBe("member");
  });
});
