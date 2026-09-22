import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { NotificationKind } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  claimPopups,
  countUnseenPopups,
  listInbox,
  markAllRead,
  markRead,
  unreadClearableCount,
} from "../broadcasts";
import * as schema from "../schema";

// The inbox tabs (All / Unread / Announcements) narrow the SQL, and
// "Mark all read" clears the caller's unread rows and nobody else's. Both are
// real queries against PGlite, because both are WHERE clauses: a filter applied
// to a fetched page would hand back short pages and a cursor that skips rows,
// and a mark-all with a missing `user_id` term would empty the whole camp's
// inboxes without any type error to say so.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function deliver(
  db: DB,
  userId: string,
  title: string,
  at: string,
  kind: NotificationKind = "announcement",
  readAt: string | null = null,
  presentation: "feed" | "popup" | "acknowledge" = "feed",
) {
  await db.insert(schema.notificationDeliveries).values({
    userId,
    title,
    body: `${title} body`,
    channel: "in_app",
    presentation,
    kind,
    createdAt: sql`${at}::timestamp` as unknown as Date,
    readAt: readAt ? (sql`${readAt}::timestamp` as unknown as Date) : null,
  });
}

async function titles(
  userId: string,
  filter?: Parameters<typeof listInbox>[1],
) {
  const page = await listInbox(userId, filter);
  return page.items.map((i) => i.title);
}

describe("listInbox filters", () => {
  const h = useTestDb();

  it("narrows to unread, and to announcements, without touching another member", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);

    await deliver(db, member.id, "read announcement", "2026-09-10 08:00:00", "announcement", "2026-09-11 08:00:00"); // prettier-ignore
    await deliver(db, member.id, "unread announcement", "2026-09-11 08:00:00"); // prettier-ignore
    await deliver(db, member.id, "unread questionnaire", "2026-09-12 08:00:00", "questionnaire_release"); // prettier-ignore
    await deliver(db, member.id, "unread team message", "2026-09-13 08:00:00", "team_message"); // prettier-ignore
    await deliver(db, other.id, "not mine", "2026-09-14 08:00:00");

    expect(await titles(member.id)).toEqual([
      "unread team message",
      "unread questionnaire",
      "unread announcement",
      "read announcement",
    ]);
    expect(await titles(member.id, { filter: "all" })).toHaveLength(4);
    expect(await titles(member.id, { filter: "unread" })).toEqual([
      "unread team message",
      "unread questionnaire",
      "unread announcement",
    ]);
    expect(await titles(member.id, { filter: "announcements" })).toEqual([
      "unread team message",
      "unread announcement",
      "read announcement",
    ]);
  });

  it("pages inside the filter, so a full page of hidden rows never shortens a page", async () => {
    const db = h.db();
    const member = await makeUser(db);
    // Three announcements, each buried under a questionnaire release. Filtering
    // a fetched page of 2 would return one row per page; filtering in SQL
    // returns a full page and a cursor that lands on the next announcement.
    for (const [i, day] of [10, 11, 12].entries()) {
      await deliver(db, member.id, `note ${i}`, `2026-09-${day} 08:00:00`, "questionnaire_release"); // prettier-ignore
      await deliver(db, member.id, `bulletin ${i}`, `2026-09-${day} 09:00:00`); // prettier-ignore
    }

    const first = await listInbox(member.id, {
      filter: "announcements",
      limit: 2,
    });
    expect(first.items.map((i) => i.title)).toEqual([
      "bulletin 2",
      "bulletin 1",
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = await listInbox(member.id, {
      filter: "announcements",
      limit: 2,
      before: first.nextCursor,
    });
    expect(second.items.map((i) => i.title)).toEqual(["bulletin 0"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("markAllRead", () => {
  const h = useTestDb();

  it("clears only the caller's unread rows, and says how many it cleared", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);

    await deliver(db, member.id, "mine a", "2026-09-10 08:00:00");
    await deliver(db, member.id, "mine b", "2026-09-11 08:00:00");
    await deliver(db, member.id, "mine read", "2026-09-09 08:00:00", "announcement", "2026-09-09 09:00:00"); // prettier-ignore
    await deliver(db, other.id, "theirs", "2026-09-10 08:00:00");

    expect(await markAllRead(member.id)).toBe(2);

    expect(await titles(member.id, { filter: "unread" })).toEqual([]);
    // The other member's inbox is untouched — the UPDATE is pinned to user_id.
    expect(await titles(other.id, { filter: "unread" })).toEqual(["theirs"]);

    // A second press has nothing left to clear, and says so rather than
    // re-stamping rows that were already read.
    expect(await markAllRead(member.id)).toBe(0);
  });

  it("never swallows a pop-up the member has not been shown", async () => {
    const db = h.db();
    const member = await makeUser(db);
    // `read_at` on a pop-up is the "was SHOWN" mark that claimPopups stamps —
    // not a "was read" one. Clearing it here would mean the member never sees
    // the pop-up at all, which for a questionnaire release is the whole point.
    await deliver(db, member.id, "feed row", "2026-09-10 08:00:00");
    await deliver(db, member.id, "your questionnaire is open", "2026-09-11 08:00:00", "questionnaire_release", null, "popup"); // prettier-ignore
    await deliver(db, member.id, "please acknowledge", "2026-09-12 08:00:00", "announcement", null, "acknowledge"); // prettier-ignore

    // Only the two non-pop-up rows are clearable, and only they are cleared.
    expect(await unreadClearableCount(member.id)).toBe(2);
    expect(await markAllRead(member.id)).toBe(2);

    expect(await titles(member.id, { filter: "unread" })).toEqual([
      "your questionnaire is open",
    ]);
    // The pop-up is still owed, and still claimable.
    expect(await countUnseenPopups(member.id)).toBe(1);
    expect((await claimPopups(member.id)).map((p) => p.title)).toEqual([
      "your questionnaire is open",
    ]);
    // Once shown, it is read like anything else, and there is nothing left.
    expect(await countUnseenPopups(member.id)).toBe(0);
    expect(await titles(member.id, { filter: "unread" })).toEqual([]);
  });

  it("leaves the already-read timestamp alone", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await deliver(db, member.id, "old", "2026-09-01 08:00:00");
    await markRead(member.id, [(await listInbox(member.id)).items[0]!.id]);
    const before = (await listInbox(member.id)).items[0]!.readAt;

    expect(await markAllRead(member.id)).toBe(0);

    expect((await listInbox(member.id)).items[0]!.readAt).toEqual(before);
  });
});
