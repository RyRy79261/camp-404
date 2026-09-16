// Notification payload builders: the one place the words a member reads are
// written.
//
// PURE: no I/O, no database, no env. Each builder turns safe, display-level
// facts (a questionnaire title, a due date, an announcement the captain wrote)
// into a NotificationPayload. Who receives it, the channel, the presentation
// and the insert are the caller's job (@camp404/db).
//
// PRIVACY: a builder never takes a private field (ID or passport number, phone,
// email, emergency contact, medical detail), so it cannot put one in a
// notification. notificationMentionsAny is the check the tests run against
// every builder to keep that true.

import type { NotificationKind, NotificationPayload } from "@camp404/types";
import { notificationLink } from "./notification-links";
import { CAMP_TIME_ZONE } from "./time-zone";

export type { NotificationKind, NotificationPayload } from "@camp404/types";

/** The reference a questionnaire notice carries: the activation it is about. */
export const QUESTIONNAIRE_REF_TYPE = "questionnaire_activation";
/** The reference an announcement carries: its own broadcast. */
export const ANNOUNCEMENT_REF_TYPE = "announcement";
/** The reference a captain request carries: the promotion request. */
export const CAPTAIN_PROMOTION_REF_TYPE = "captain_promotion";

const DUE_ON = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** The tap-through path for a payload (the inbox when it points at nothing). */
export function payloadLink(payload: NotificationPayload): string {
  return notificationLink(payload.refType, payload.refId);
}

/** A camp announcement, as a captain wrote it. */
export function announcementNotification(input: {
  broadcastId: string;
  title: string;
  body: string;
}): NotificationPayload {
  return {
    kind: "announcement",
    title: input.title,
    body: input.body,
    refType: ANNOUNCEMENT_REF_TYPE,
    refId: input.broadcastId,
  };
}

/** The line a member reads when a questionnaire is sent to them. */
export function releaseBody(
  title: string,
  dueAt: Date | null,
  blocking: boolean,
): string {
  const due = dueAt ? `, due ${DUE_ON.format(dueAt)}` : "";
  return blocking
    ? `New questionnaire: ${title}${due}. You need to answer it before using the app.`
    : `New questionnaire: ${title}${due}. Tap to answer.`;
}

/** A questionnaire was sent to the member. */
export function questionnaireReleaseNotification(input: {
  activationId: string;
  title: string;
  dueAt: Date | null;
  blocking: boolean;
}): NotificationPayload {
  return {
    kind: "questionnaire_release",
    title: input.title,
    body: releaseBody(input.title, input.dueAt, input.blocking),
    refType: QUESTIONNAIRE_REF_TYPE,
    refId: input.activationId,
  };
}

/**
 * The reminder line (§7.4: there is no custom message in v1). A send with no
 * deadline gets the deadline-free phrasing rather than "undefined" where a date
 * should be.
 */
export function reminderBody(title: string, dueAt: Date | null): string {
  return dueAt
    ? `Reminder: ${title} is due ${DUE_ON.format(dueAt)}. Tap to complete.`
    : `Reminder: ${title} is still waiting for your answer. Tap to complete.`;
}

/** A nudge about a questionnaire the member has not finished. */
export function questionnaireReminderNotification(input: {
  activationId: string;
  title: string;
  dueAt: Date | null;
}): NotificationPayload {
  return {
    kind: "questionnaire_reminder",
    title: input.title,
    body: reminderBody(input.title, input.dueAt),
    refType: QUESTIONNAIRE_REF_TYPE,
    refId: input.activationId,
  };
}

/**
 * A captain approved the member's place in the camp.
 *
 * There is no rejection notice. A rejected applicant is held at a screen that
 * already says so on every load, and a push or inbox row would repeat it to
 * someone who can do nothing with it.
 */
export function approvalNotification(): NotificationPayload {
  return {
    kind: "approval_decision",
    title: "You're in",
    body: "A captain approved your place in Camp 404. Welcome to camp.",
    refType: null,
    refId: null,
  };
}

/**
 * A captain asked the member to become a captain. The member answers on their
 * notifications page, where the request waits with Accept and Decline. The
 * requester's display name is the only fact it carries.
 */
export function captainPromotionNotification(input: {
  requestId: string;
  requesterName: string | null;
}): NotificationPayload {
  const who = input.requesterName?.trim() || "A captain";
  return {
    kind: "captain_promotion",
    title: "Captain request",
    body: `${who} asked you to become a captain. Open your notifications to accept or decline.`,
    refType: CAPTAIN_PROMOTION_REF_TYPE,
    refId: input.requestId,
  };
}

/**
 * The kind of a delivery fanned out from a scheduled broadcast. Broadcast
 * kinds that name who it is for map to themselves. A reminder is always about
 * a questionnaire today. A system broadcast is a questionnaire release when it
 * points at one; anything else reads as an announcement.
 */
export function kindForBroadcast(
  kind:
    | "announcement"
    | "team_message"
    | "lead_directive"
    | "reminder"
    | "system",
  refType: string | null,
): NotificationKind {
  switch (kind) {
    case "team_message":
    case "lead_directive":
      return kind;
    case "reminder":
      return "questionnaire_reminder";
    case "system":
      return refType === QUESTIONNAIRE_REF_TYPE
        ? "questionnaire_release"
        : "announcement";
    default:
      return "announcement";
  }
}

/**
 * A scheduled broadcast, fanned out by the dispatch cron. Its text is what the
 * sender wrote; it points at its own reference, or at itself.
 */
export function scheduledBroadcastNotification(input: {
  id: string;
  kind: Parameters<typeof kindForBroadcast>[0];
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
}): NotificationPayload {
  return {
    kind: kindForBroadcast(input.kind, input.refType),
    title: input.title,
    body: input.body,
    refType: input.refType,
    refId: input.refId ?? input.id,
  };
}

/**
 * True when any needle appears in what the member can see: the title, the body
 * or the link. The privacy tests use it to prove a built payload carries no
 * private value. Blank needles are ignored, so an empty field on a test
 * fixture cannot match everything.
 */
export function notificationMentionsAny(
  payload: NotificationPayload,
  needles: readonly string[],
): boolean {
  const haystack = [payload.title, payload.body, payloadLink(payload)]
    .join("\n")
    .toLowerCase();
  return needles.some((n) => {
    const needle = n.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}
