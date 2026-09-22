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
  // A captain asked the member to become a captain.
  "captain_promotion",
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

/**
 * Which slice of their inbox a member is looking at. The state lives in
 * `?filter=` (never client state), so the list stays a server render and a
 * filtered inbox is linkable and survives the back button.
 */
export const INBOX_FILTERS = ["all", "unread", "announcements"] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

/**
 * The delivery kinds the "Announcements" tab shows: the broadcasts a captain
 * or a team lead composed and sent. Everything else in the inbox is a personal
 * event (a questionnaire sent your way, an approval decision, a captain
 * request), which is what the tab is there to filter out.
 */
export const ANNOUNCEMENT_NOTIFICATION_KINDS = [
  "announcement",
  "team_message",
  "lead_directive",
] as const satisfies readonly NotificationKind[];
