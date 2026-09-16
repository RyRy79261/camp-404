import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { isInboxCursor, listInbox } from "../broadcasts";
import * as schema from "../schema";

// The inbox pages newest first on a (created_at, id) cursor. Rows written in
// the same millisecond, or the same microsecond, are the case a millisecond
// JavaScript Date would get wrong: these read every row exactly once, in order.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function deliver(db: DB, userId: string, title: string, at: string) {
  await db.insert(schema.notificationDeliveries).values({
    userId,
    title,
    body: `${title} body`,
    channel: "in_app",
    presentation: "feed",
    createdAt: sql`${at}::timestamp` as unknown as Date,
  });
}

async function readAll(userId: string, limit: number) {
  const titles: string[] = [];
  let before: string | null = null;
  for (let pages = 0; pages < 20; pages++) {
    const page = await listInbox(userId, { before, limit });
    titles.push(...page.items.map((i) => i.title));
    if (!page.nextCursor) return { titles, pages: pages + 1 };
    expect(isInboxCursor(page.nextCursor)).toBe(true);
    before = page.nextCursor;
  }
  throw new Error("paging never ended");
}

describe("listInbox paging", () => {
  const h = useTestDb();

  it("reads every row once, newest first, across rows in one millisecond", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await deliver(db, member.id, "oldest", "2026-09-14 08:00:00");
    await deliver(db, member.id, "ms-a", "2026-09-15 10:00:00.123100");
    await deliver(db, member.id, "ms-b", "2026-09-15 10:00:00.123400");
    await deliver(db, member.id, "ms-c", "2026-09-15 10:00:00.123900");
    await deliver(db, member.id, "same-1", "2026-09-16 09:00:00.500000");
    await deliver(db, member.id, "same-2", "2026-09-16 09:00:00.500000");
    await deliver(db, member.id, "newest", "2026-09-16 10:00:00");
    await deliver(db, other.id, "not mine", "2026-09-16 11:00:00");

    const everything = (await listInbox(member.id, { limit: 50 })).items.map(
      (i) => i.title,
    );
    expect(everything).toHaveLength(7);
    expect(everything[0]).toBe("newest");
    expect(everything.slice(3, 6)).toEqual(["ms-c", "ms-b", "ms-a"]);
    expect(everything.at(-1)).toBe("oldest");

    for (const limit of [1, 2, 3]) {
      const { titles } = await readAll(member.id, limit);
      expect(titles).toEqual(everything);
    }
  });

  it("says there is no next page when the last page is full", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await deliver(db, member.id, "a", "2026-09-16 09:00:00");
    await deliver(db, member.id, "b", "2026-09-16 10:00:00");
    const { pages } = await readAll(member.id, 2);
    expect(pages).toBe(1);
  });

  it("reads nothing for a cursor it did not make", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await deliver(db, member.id, "a", "2026-09-16 09:00:00");
    for (const bad of [
      "",
      "yesterday",
      "2026-09-16T09:00:00~x",
      "' or 1=1 --",
    ]) {
      expect(isInboxCursor(bad)).toBe(false);
      expect(await listInbox(member.id, { before: bad })).toEqual({
        items: [],
        nextCursor: null,
      });
    }
  });
});
