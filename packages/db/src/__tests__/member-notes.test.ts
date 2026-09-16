import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { addMemberNote, listMemberNotes } from "../member-notes";
import * as schema from "../schema";

// Captain notes on real rows: append-only, newest first, the author's current
// name, and an audit row that records the length but never the words.

describe("member notes", () => {
  const h = useTestDb();

  it("lists a member's notes newest first, with the author's name", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain", displayName: "Jo" });
    const member = await makeUser(db);
    const other = await makeUser(db);
    await db.insert(schema.memberNotes).values([
      {
        userId: member.id,
        authorId: captain.id,
        body: "First",
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
      {
        userId: member.id,
        authorId: null,
        body: "Second",
        createdAt: new Date("2026-09-02T10:00:00Z"),
      },
      { userId: other.id, authorId: captain.id, body: "Not theirs" },
    ]);

    expect(
      (await listMemberNotes(member.id)).map((n) => [n.body, n.authorName]),
    ).toEqual([
      ["Second", null],
      ["First", "Jo"],
    ]);
  });

  it("adds a trimmed note with an audit row that holds no words", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);

    await addMemberNote({
      userId: member.id,
      authorId: captain.id,
      body: "  Arrives Tuesday.  ",
    });

    const [note] = await listMemberNotes(member.id);
    expect(note).toMatchObject({
      body: "Arrives Tuesday.",
      authorId: captain.id,
    });
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.target, member.id));
    expect(audit.map((a) => [a.actorId, a.action, a.metadata])).toEqual([
      [captain.id, "member.note_added", { length: 16 }],
    ]);
  });

  it("refuses a blank or over-long note and writes nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);

    await expect(
      addMemberNote({ userId: member.id, authorId: captain.id, body: "   " }),
    ).rejects.toThrow();
    await expect(
      addMemberNote({
        userId: member.id,
        authorId: captain.id,
        body: "x".repeat(2001),
      }),
    ).rejects.toThrow();
    expect(await listMemberNotes(member.id)).toEqual([]);
    expect(await db.select().from(schema.auditLog)).toEqual([]);
  });
});
