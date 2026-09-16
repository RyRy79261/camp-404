import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAuditEvent } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Captain notes on a member (owner's call, 2026-09-16: captains only, audited,
// never in the CSV). Captain-gated by every caller. Not in the member field
// list (MEMBER_FIELD_READERS), because that list lets a member read their own
// data and these notes are not the member's to read.

/** The longest note a captain may write, in characters. */
export const MAX_MEMBER_NOTE_LENGTH = 2000;

export interface MemberNote {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  /** The author's display name now; null when the author is gone. */
  authorName: string | null;
}

/** Every note on one member, newest first. */
export async function listMemberNotes(userId: string): Promise<MemberNote[]> {
  const db = createHttpDb();
  const author = alias(schema.users, "author");
  return db
    .select({
      id: schema.memberNotes.id,
      body: schema.memberNotes.body,
      createdAt: schema.memberNotes.createdAt,
      authorId: schema.memberNotes.authorId,
      authorName: author.displayName,
    })
    .from(schema.memberNotes)
    .leftJoin(author, eq(author.id, schema.memberNotes.authorId))
    .where(eq(schema.memberNotes.userId, userId))
    .orderBy(desc(schema.memberNotes.createdAt), desc(schema.memberNotes.id));
}

/**
 * Add a note, with a `member.note_added` audit row in the same transaction.
 * The audit row records the length, not the words: the note is on its own
 * row, and an audit trail that copies it would outlive the member's erasure.
 * The body is trimmed; the caller refuses blank or over-long bodies.
 */
export async function addMemberNote(input: {
  userId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  const body = input.body.trim();
  if (!body || body.length > MAX_MEMBER_NOTE_LENGTH) {
    throw new Error("addMemberNote: the body must be 1 to 2000 characters");
  }
  await withTransaction(async (tx) => {
    await tx.insert(schema.memberNotes).values({
      userId: input.userId,
      authorId: input.authorId,
      body,
    });
    await writeAuditEvent(tx, {
      actorId: input.authorId,
      action: "member.note_added",
      target: input.userId,
      metadata: { length: body.length },
    });
  });
}
