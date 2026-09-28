import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { deletePushTokenForUser, upsertPushToken } from "../push";
import * as schema from "../schema";

// A device token names a phone, not a person. When a second member registers
// a token the first never forgot, the phone has changed hands (the server
// cannot tell that apart from a leaked token; see upsertPushToken), so the
// token moves, and what the last member chose for it does not move with it.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function tokenRow(db: DB, token: string) {
  const [row] = await db
    .select()
    .from(schema.pushTokens)
    .where(eq(schema.pushTokens.token, token));
  return row;
}

describe("upsertPushToken", () => {
  const h = useTestDb();

  it("moves a token to the member now on the device, and drops the last member's topics", async () => {
    const db = h.db();
    const first = await makeUser(db);
    const next = await makeUser(db);
    await upsertPushToken({
      userId: first.id,
      token: "phone",
      platform: "web",
      topics: ["announcements"],
    });

    await upsertPushToken({ userId: next.id, token: "phone", platform: "web" });

    const row = await tokenRow(db, "phone");
    expect(row?.userId).toBe(next.id);
    expect(row?.topics).toEqual([]);
    // One row: the phone is not addressed as both members.
    expect(await db.select().from(schema.pushTokens)).toHaveLength(1);
    // The last member can no longer remove it: it is not theirs any more.
    await deletePushTokenForUser(first.id, "phone");
    expect((await tokenRow(db, "phone"))?.userId).toBe(next.id);
  });

  it("keeps the member's own topics when the same member re-registers", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await upsertPushToken({
      userId: member.id,
      token: "phone",
      platform: "web",
      topics: ["announcements"],
    });

    await upsertPushToken({
      userId: member.id,
      token: "phone",
      platform: "web",
    });

    expect((await tokenRow(db, "phone"))?.topics).toEqual(["announcements"]);
  });

  it("takes the topics the new owner sends", async () => {
    const db = h.db();
    const first = await makeUser(db);
    const next = await makeUser(db);
    await upsertPushToken({
      userId: first.id,
      token: "phone",
      platform: "web",
      topics: ["announcements"],
    });

    await upsertPushToken({
      userId: next.id,
      token: "phone",
      platform: "android",
      topics: ["tasks"],
    });

    const row = await tokenRow(db, "phone");
    expect(row).toMatchObject({
      userId: next.id,
      platform: "android",
      topics: ["tasks"],
    });
  });
});
