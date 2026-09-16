import { auditActionLabel, auditDetail, CAMP_TIME_ZONE } from "@camp404/core";
import type { AuditLogRow } from "@camp404/db/audit";

// How the audit page words a row. Pure, so it is tested without a database.
// Dates use Intl with the camp's time zone. No date library, and no calendar
// maths: a relative time is only elapsed seconds, and past a week the page
// shows the date instead.

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

/** "16 Sept 2026, 14:05" in the camp's time zone. */
export function formatDateTime(at: Date): string {
  return DATE_TIME.format(at);
}

// "always", not "auto": "auto" says "yesterday" for 1 day, which is a calendar
// claim that 30 elapsed hours may not match.
const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "always" });

const STEPS: readonly [
  limit: number,
  size: number,
  unit: Intl.RelativeTimeFormatUnit,
][] = [
  [3_600, 60, "minute"],
  [86_400, 3_600, "hour"],
  [604_800, 86_400, "day"],
];

/**
 * "5 minutes ago", "1 day ago", "3 days ago". Null for anything a week or more
 * old, or in the future: the date alone says it better.
 */
export function relativeTime(at: Date, now: Date): string | null {
  const seconds = (now.getTime() - at.getTime()) / 1000;
  if (seconds < 0) return null;
  if (seconds < 60) return "just now";
  for (const [limit, size, unit] of STEPS) {
    if (seconds < limit)
      return RELATIVE.format(-Math.floor(seconds / size), unit);
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who or what a row is about, in words. Null when it is about nothing. */
export function auditTarget(
  row: Pick<AuditLogRow, "action" | "target" | "targetName">,
  teamLabel: (key: string) => string,
): string | null {
  if (!row.target) return null;
  if (row.targetName) return row.targetName;
  if (row.action.startsWith("camp.teams.")) return teamLabel(row.target);
  if (row.action.startsWith("camp.cycle.")) return `Year ${row.target}`;
  if (row.action === "invite.revoked") return `Code ${row.target}`;
  // A member id with no member row: the account is gone.
  if (UUID.test(row.target)) return "A removed account";
  return row.target;
}

export interface AuditEntry {
  id: string;
  what: string;
  who: string;
  about: string | null;
  detail: string | null;
  when: string;
  ago: string | null;
}

/** One row as the page shows it. */
export function auditEntry(
  row: AuditLogRow,
  teamLabel: (key: string) => string,
  now: Date,
): AuditEntry {
  return {
    id: row.id,
    what: auditActionLabel(row.action),
    // No actor id is a scheduled job or the app itself.
    who: row.actorId ? (row.actorName ?? "A removed account") : "The app",
    about: auditTarget(row, teamLabel),
    detail: auditDetail(row.action, row.metadata, teamLabel),
    when: formatDateTime(row.createdAt),
    ago: relativeTime(row.createdAt, now),
  };
}
