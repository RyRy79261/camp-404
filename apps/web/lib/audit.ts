import "server-only";

import { after } from "next/server";
import { appendAuditEvent, type AuditEvent } from "@camp404/db/audit";

/**
 * Record that a person read someone else's private data. The row is written
 * after the response is sent (next/server `after`, which runs once per
 * request), so the reader does not wait on it.
 *
 * Fail-open on purpose: the data has already been shown, and refusing the
 * page cannot take that back. But a failed write is logged, never swallowed,
 * because an audit trail that silently misses reads cannot be trusted.
 */
export function auditReadAfterResponse(event: AuditEvent): void {
  after(async () => {
    try {
      await appendAuditEvent(event);
    } catch (error) {
      console.error(`audit write failed: ${event.action}`, error);
    }
  });
}
