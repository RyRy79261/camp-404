// What a notification is about, for the member who gets it. One value per
// delivery (notification_deliveries.kind).
//
// The database enum is built from this tuple (`notificationKindEnum` in
// @camp404/db/schema), so the TypeScript union and the Postgres type cannot
// drift: add a value here, then generate the migration.
export const NOTIFICATION_KINDS = [
  // A captain's announcement, or the one a year rollover sends.
  "announcement",
  // A scheduled broadcast to a team or to the team leads.
  "team_message",
  "lead_directive",
  // A questionnaire was sent to the member.
  "questionnaire_release",
  // A captain or the deadline cron nudged the member about a questionnaire.
  "questionnaire_reminder",
  // A captain approved the member's place in the camp.
  "approval_decision",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * What a member reads, and what it points at. A builder in
 * @camp404/core/notifications makes one; the caller decides who gets it, on
 * which channel, and how it is presented, and writes the delivery rows.
 *
 * `refType` and `refId` are the stored pointer. The tap-through link is
 * derived from them (notificationLink), never stored.
 */
export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
}
