import type { Database, PooledDatabase, Tx } from "./index";
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
  /** Stable dotted verb, e.g. "member.rank_changed". */
  action: string;
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
