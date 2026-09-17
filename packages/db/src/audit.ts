import type { AuditAction } from "@camp404/core";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  createHttpDb,
  type Database,
  type PooledDatabase,
  type Tx,
} from "./index";
import * as schema from "./schema";

// The single writer for `audit_log`. Every privileged action that changes
// someone else's data (rank changes, approvals, account erasure, config edits)
// appends one row here.
//
// The handle is a parameter, never opened inside: an audit row must land in the
// SAME transaction as the change it describes, or the two can disagree (the
// change commits, the audit write fails — or worse, the change rolls back and
// the audit row stays). A writer that opened its own connection could not
// participate in the caller's transaction at all.

/** Any drizzle handle that can INSERT: a pooled/http db, or a transaction. */
export type DbOrTx = Database | PooledDatabase["db"] | Tx;

export interface AuditEvent {
  /** The user who performed the action; null for system / cron actors. */
  actorId?: string | null;
  /** Stable dotted verb, e.g. "member.rank_changed". Each one has a label in core. */
  action: AuditAction;
  /** What was acted on — a user id, config key, etc. */
  target?: string | null;
  /** Free-form context. Never put decrypted PII or secrets in here. */
  metadata?: Record<string, unknown>;
}

/**
 * Append one row to `audit_log`. Pass the caller's `tx` inside a
 * `withTransaction` so the audit row commits or rolls back with the change it
 * records; pass a plain db handle only for actions that aren't transactional.
 *
 * Throws on failure — unlike `appendMcpAuditLog` (best-effort telemetry for a
 * read path), this records privileged writes, and a silently missing row is
 * worse than a failed action.
 */
export async function writeAuditEvent(
  db: DbOrTx,
  event: AuditEvent,
): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorId: event.actorId ?? null,
    action: event.action,
    target: event.target ?? null,
    metadata: event.metadata ?? null,
  });
}

/**
 * Append one audit row on its own connection. Only for an event with no
 * change to share a transaction with: a privileged READ, such as a captain
 * opening someone's ID number. A write must use writeAuditEvent with its tx.
 */
export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  await writeAuditEvent(createHttpDb(), event);
}

/** How many audit rows the audit page shows at a time. */
export const AUDIT_PAGE_SIZE = 50;

export interface AuditLogRow {
  id: string;
  /** As stored. Rows older than a label may hold an action core no longer lists. */
  action: string;
  actorId: string | null;
  /** Null for a system actor, or an actor whose account row is gone. */
  actorName: string | null;
  target: string | null;
  /** The member's name when the target is a member's id. */
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  /** Pass back as `before` for the next (older) page; null on the last page. */
  nextCursor: string | null;
}

// The same cursor as the inbox: the last row's created_at to the microsecond,
// and its id, so rows written in the same millisecond are never skipped.
const AUDIT_CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6})~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** True when a string from a URL is a cursor listAuditLog made. */
export function isAuditCursor(value: string): boolean {
  return AUDIT_CURSOR.test(value);
}

/**
 * One page of the audit trail, newest first. Bounded: never more than `limit`
 * rows (at most 200). An unrecognised cursor reads nothing, rather than
 * restarting from the top. The caller checks the viewer is a captain first.
 */
export async function listAuditLog(
  options: { before?: string | null; limit?: number } = {},
): Promise<AuditLogPage> {
  const limit = Math.min(Math.max(1, options.limit ?? AUDIT_PAGE_SIZE), 200);
  let olderThan = undefined as ReturnType<typeof sql> | undefined;
  if (options.before != null) {
    const match = AUDIT_CURSOR.exec(options.before);
    if (!match) return { rows: [], nextCursor: null };
    olderThan = sql`(${schema.auditLog.createdAt}, ${schema.auditLog.id}) < (${match[1]}::timestamp, ${match[2]}::uuid)`;
  }

  const actor = alias(schema.users, "audit_actor");
  const subject = alias(schema.users, "audit_subject");
  const rows = await createHttpDb()
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      actorName: actor.displayName,
      target: schema.auditLog.target,
      targetName: subject.displayName,
      metadata: schema.auditLog.metadata,
      createdAt: schema.auditLog.createdAt,
      cursorAt: sql<string>`to_char(${schema.auditLog.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
    })
    .from(schema.auditLog)
    .leftJoin(actor, eq(actor.id, schema.auditLog.actorId))
    // A target is free text: a member id, a year, a team key or an invite
    // code. Compare as text, so a target that is not a uuid never errors.
    .leftJoin(subject, sql`${subject.id}::text = ${schema.auditLog.target}`)
    .where(and(olderThan))
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    // One extra row says whether there is another page.
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page.map(({ cursorAt: _cursorAt, ...row }) => row),
    nextCursor:
      rows.length > limit && last ? `${last.cursorAt}~${last.id}` : null,
  };
}
