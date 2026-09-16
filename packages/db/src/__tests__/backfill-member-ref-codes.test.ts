import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The data migration that gives existing members their payment reference on
// deploy. The harness applies it to an empty database, so these tests add rows
// first and run the migration's own SQL again.

const BACKFILL_SQL = readFileSync(
  new URL(
    "../../migrations/0032_backfill_member_ref_codes.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("0032_backfill_member_ref_codes", () => {
  const h = useTestDb();

  async function refOf(id: string) {
    const [row] = await h
      .db()
      .select({ refCode: schema.users.refCode })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return row?.refCode;
  }

  it("numbers members in join order and skips the system and erased accounts", async () => {
    const db = h.db();
    const second = await makeUser(db, {
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    const first = await makeUser(db, {
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const system = await makeUser(db, { isSystem: true });
    const erased = await makeUser(db, { sanitised: true });

    await h.client().exec(BACKFILL_SQL);

    expect(await refOf(first.id)).toBe("C404-M001");
    expect(await refOf(second.id)).toBe("C404-M002");
    expect(await refOf(system.id)).toBeNull();
    expect(await refOf(erased.id)).toBeNull();
  });

  it("keeps a reference already given and numbers after the highest", async () => {
    const db = h.db();
    const given = await makeUser(db, { refCode: "C404-M007" } as never);
    const member = await makeUser(db);

    await h.client().exec(BACKFILL_SQL);
    await h.client().exec(BACKFILL_SQL);

    expect(await refOf(given.id)).toBe("C404-M007");
    expect(await refOf(member.id)).toBe("C404-M008");
  });
});
