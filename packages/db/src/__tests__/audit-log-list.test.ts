import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { isAuditCursor, listAuditLog } from "../audit";
import * as schema from "../schema";

// The audit page reads the trail newest first, a bounded page at a time, with
// the actor's name and, when the target is a member, the member's name.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function record(
  db: DB,
  action: string,
  at: string,
  row: { actorId?: string | null; target?: string | null } = {},
) {
  await db.insert(schema.auditLog).values({
    action,
    actorId: row.actorId ?? null,
    target: row.target ?? null,
    createdAt: sql`${at}::timestamp` as unknown as Date,
  });
}

describe("listAuditLog", () => {
  const h = useTestDb();

  it("names the actor and a member target, and leaves other targets as text", async () => {
    const db = h.db();
    const captain = await makeUser(db, { displayName: "Cap Tain" });
    const member = await makeUser(db, { displayName: "Mem Ber" });
    await record(db, "camp.cycle.renamed", "2026-09-15 10:00:00", {
      actorId: captain.id,
      target: "2027",
    });
    await record(db, "member.approval_decided", "2026-09-16 10:00:00", {
      actorId: captain.id,
      target: member.id,
    });
    await record(db, "member.team_assigned", "2026-09-16 11:00:00");

    const { rows, nextCursor } = await listAuditLog();
    expect(nextCursor).toBeNull();
    expect(rows.map((r) => r.action)).toEqual([
      "member.team_assigned",
      "member.approval_decided",
      "camp.cycle.renamed",
    ]);
    expect(rows[0]).toMatchObject({ actorName: null, targetName: null });
    expect(rows[1]).toMatchObject({
      actorName: "Cap Tain",
      target: member.id,
      targetName: "Mem Ber",
    });
    expect(rows[2]).toMatchObject({ target: "2027", targetName: null });
  });

  it("reads every row once across pages, rows in one millisecond included", async () => {
    const db = h.db();
    await record(db, "a", "2026-09-14 08:00:00");
    await record(db, "b", "2026-09-15 10:00:00.123100");
    await record(db, "c", "2026-09-15 10:00:00.123400");
    await record(db, "d", "2026-09-16 09:00:00.500000");
    await record(db, "e", "2026-09-16 09:00:00.500000");

    const seen: string[] = [];
    let before: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await listAuditLog({ before, limit: 2 });
      seen.push(...page.rows.map((r) => r.action));
      if (!page.nextCursor) break;
      expect(isAuditCursor(page.nextCursor)).toBe(true);
      before = page.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen.slice(2)).toEqual(["c", "b", "a"]);
  });

  it("reads nothing for a cursor it did not make, and takes an oversized page size", async () => {
    const db = h.db();
    await record(db, "a", "2026-09-14 08:00:00");
    expect(await listAuditLog({ before: "'; drop table audit_log" })).toEqual({
      rows: [],
      nextCursor: null,
    });
    expect((await listAuditLog({ limit: 10_000 })).rows).toHaveLength(1);
  });
});
