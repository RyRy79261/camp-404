import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { dispatchDueBroadcasts } from "../broadcasts";
import * as schema from "../schema";

// The scheduled fan-out reports each broadcast that fails, keeps going with
// the rest, and leaves the failed one due for the next run.

const NOW = new Date("2026-03-01T09:00:00Z");

describe("dispatchDueBroadcasts", () => {
  const h = useTestDb();

  async function scheduled(senderId: string, title: string) {
    const [row] = await h
      .db()
      .insert(schema.broadcasts)
      .values({
        senderId,
        kind: "team_message",
        scope: "everyone",
        title,
        body: "Body",
        channel: "in_app",
        presentation: "feed",
        publishedAt: new Date("2026-03-01T08:00:00Z"),
      })
      .returning({ id: schema.broadcasts.id });
    return row!.id;
  }

  it("reports no failures on a clean run", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db, { approvalStatus: "approved" });
    await scheduled(captain.id, "Kitchen crew");

    expect(await dispatchDueBroadcasts(NOW)).toEqual({
      dispatched: 1,
      deliveries: 1,
      failures: [],
    });
  });

  it("reports a broadcast that throws, dispatches the rest, and leaves it due", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const broken = await scheduled(captain.id, "boom");
    const fine = await scheduled(captain.id, "Kitchen crew");

    // A real Postgres failure inside the claim transaction.
    await h.client().exec(`
      CREATE FUNCTION refuse_boom() RETURNS trigger AS $$
      BEGIN
        IF NEW.title = 'boom' THEN
          RAISE EXCEPTION 'delivery refused for boom';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER refuse_boom BEFORE INSERT ON notification_deliveries
        FOR EACH ROW EXECUTE FUNCTION refuse_boom();
    `);
    try {
      const result = await dispatchDueBroadcasts(NOW);

      expect(result).toMatchObject({ dispatched: 1, deliveries: 1 });
      expect(result.failures).toEqual([
        { broadcastId: broken, error: "delivery refused for boom" },
      ]);

      const rows = await db
        .select({
          id: schema.broadcasts.id,
          dispatchedAt: schema.broadcasts.dispatchedAt,
        })
        .from(schema.broadcasts);
      const dispatchedAt = new Map(rows.map((r) => [r.id, r.dispatchedAt]));
      expect(dispatchedAt.get(broken)).toBeNull();
      expect(dispatchedAt.get(fine)).toEqual(NOW);
      expect(
        await db
          .select({ title: schema.notificationDeliveries.title })
          .from(schema.notificationDeliveries)
          .where(eq(schema.notificationDeliveries.userId, member.id)),
      ).toEqual([{ title: "Kitchen crew" }]);
    } finally {
      await h.client().exec(`
        DROP TRIGGER refuse_boom ON notification_deliveries;
        DROP FUNCTION refuse_boom();
      `);
    }

    // Fixed: the next run delivers it.
    expect(await dispatchDueBroadcasts(NOW)).toEqual({
      dispatched: 1,
      deliveries: 1,
      failures: [],
    });
  });
});
