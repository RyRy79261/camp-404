import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createHttpDb, withTransaction } from "../index";
import { writeAuditEvent } from "../audit";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The transaction primitive and the audit writer that composes inside it. Run
// against real Postgres (PGlite) because the whole point is atomicity — a
// mocked handle would happily "roll back" nothing.

describe("withTransaction", () => {
  const h = useTestDb();

  it("commits every write in the callback", async () => {
    const user = await makeUser(h.db());

    await withTransaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ rank: "captain" })
        .where(eq(schema.users.id, user.id));
      await tx.insert(schema.teamMemberships).values({
        userId: user.id,
        team: "kitchen",
      });
    });

    const [row] = await h
      .db()
      .select({ rank: schema.users.rank })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(row?.rank).toBe("captain");
    const memberships = await h.db().select().from(schema.teamMemberships);
    expect(memberships).toHaveLength(1);
  });

  it("rolls every write back when the callback throws, and rethrows", async () => {
    const user = await makeUser(h.db());

    await expect(
      withTransaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({ rank: "captain" })
          .where(eq(schema.users.id, user.id));
        await tx.insert(schema.teamMemberships).values({
          userId: user.id,
          team: "kitchen",
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [row] = await h
      .db()
      .select({ rank: schema.users.rank })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(row?.rank).toBe("member"); // the pre-transaction value
    const memberships = await h.db().select().from(schema.teamMemberships);
    expect(memberships).toHaveLength(0);
  });

  it("returns the callback's value", async () => {
    const answer = await withTransaction(async () => 42);
    expect(answer).toBe(42);
  });
});

describe("writeAuditEvent", () => {
  const h = useTestDb();

  it("commits with the change it records when given the caller's tx", async () => {
    const actor = await makeUser(h.db(), { rank: "captain" });
    const subject = await makeUser(h.db());

    await withTransaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ rank: "captain" })
        .where(eq(schema.users.id, subject.id));
      await writeAuditEvent(tx, {
        actorId: actor.id,
        action: "member.rank_changed",
        target: subject.id,
        metadata: { from: "member", to: "captain" },
      });
    });

    const rows = await h.db().select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: actor.id,
      action: "member.rank_changed",
      target: subject.id,
    });
    // The `$type<Record<string, unknown>>()` on the jsonb column: an object goes
    // in and an object — not a string — comes back.
    expect(rows[0]?.metadata).toEqual({ from: "member", to: "captain" });
  });

  it("is rolled back with the change it records when the transaction fails", async () => {
    const actor = await makeUser(h.db(), { rank: "captain" });
    const subject = await makeUser(h.db());

    await expect(
      withTransaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({ rank: "captain" })
          .where(eq(schema.users.id, subject.id));
        await writeAuditEvent(tx, {
          actorId: actor.id,
          action: "member.rank_changed",
          target: subject.id,
        });
        throw new Error("later step failed");
      }),
    ).rejects.toThrow("later step failed");

    expect(await h.db().select().from(schema.auditLog)).toHaveLength(0);
    const [row] = await h
      .db()
      .select({ rank: schema.users.rank })
      .from(schema.users)
      .where(eq(schema.users.id, subject.id));
    expect(row?.rank).toBe("member");
  });

  it("also accepts a plain db handle for non-transactional callers", async () => {
    await writeAuditEvent(createHttpDb(), {
      action: "cron.push_drained",
      metadata: { sent: 3 },
    });

    const rows = await h.db().select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    // System actors have no actor row; the column is nullable for exactly this.
    expect(rows[0]?.actorId).toBeNull();
    expect(rows[0]?.target).toBeNull();
  });
});
