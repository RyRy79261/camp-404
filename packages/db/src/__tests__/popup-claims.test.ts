import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  claimPopups,
  countUnseenPopups,
  POPUP_CLAIM_LIMIT,
} from "../broadcasts";
import * as schema from "../schema";

// A pop-up shows once, as a toast. The claim is the showing: it stamps
// read_at in the same statement that returns the rows, so no second claim
// (another tab, the next poll) can show it again.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function deliver(
  db: DB,
  userId: string,
  title: string,
  presentation: "popup" | "feed" | "acknowledge",
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(schema.notificationDeliveries)
    .values({
      userId,
      title,
      body: `${title} body`,
      channel: "in_app",
      presentation,
      refType: "announcement",
      refId: "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
      createdAt,
    })
    .returning({ id: schema.notificationDeliveries.id });
  return row!.id;
}

const at = (minute: number) =>
  new Date(`2026-09-16T10:${String(minute).padStart(2, "0")}:00Z`);

describe("claimPopups", () => {
  const h = useTestDb();

  it("shows each unread pop-up once, oldest first, and leaves it in the inbox read", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const second = await deliver(db, member.id, "Second", "popup", at(2));
    const first = await deliver(db, member.id, "First", "popup", at(1));

    expect(await countUnseenPopups(member.id)).toBe(2);
    const claimed = await claimPopups(member.id);
    expect(claimed.map((p) => p.deliveryId)).toEqual([first, second]);
    expect(claimed[0]).toMatchObject({
      title: "First",
      body: "First body",
      refType: "announcement",
    });

    expect(await countUnseenPopups(member.id)).toBe(0);
    expect(await claimPopups(member.id)).toEqual([]);
    const rows = await db
      .select({ readAt: schema.notificationDeliveries.readAt })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, member.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.readAt instanceof Date)).toBe(true);
  });

  it("claims only pop-ups, only the caller's, and only unread ones", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await deliver(db, member.id, "Quiet", "feed", at(1));
    await deliver(db, member.id, "Takeover", "acknowledge", at(2));
    await deliver(db, other.id, "Theirs", "popup", at(3));
    const seen = await deliver(db, member.id, "Seen", "popup", at(4));
    await db
      .update(schema.notificationDeliveries)
      .set({ readAt: at(5) })
      .where(eq(schema.notificationDeliveries.id, seen));

    expect(await countUnseenPopups(member.id)).toBe(0);
    expect(await claimPopups(member.id)).toEqual([]);
    expect(await countUnseenPopups(other.id)).toBe(1);
  });

  it("shows a backlog a few at a time", async () => {
    const db = h.db();
    const member = await makeUser(db);
    for (let i = 0; i < POPUP_CLAIM_LIMIT + 2; i++) {
      await deliver(db, member.id, `Notice ${i}`, "popup", at(i));
    }
    const batch = await claimPopups(member.id);
    expect(batch.map((p) => p.title)).toEqual(
      Array.from({ length: POPUP_CLAIM_LIMIT }, (_, i) => `Notice ${i}`),
    );
    expect(await countUnseenPopups(member.id)).toBe(2);
  });
});
