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

import type { NotificationPayload } from "@camp404/types";
import { notificationLink } from "./notification-links";
import {
  FEE_PAYMENT_REF_TYPE,
  FEE_PLEDGE_ACTION_TITLE,
  FEE_PLEDGE_REF_TYPE,
  type NextFeePayment,
} from "./camp-fees";
import { formatMoney } from "./money";
import { GEAR_ORDER_ACTION_TITLE, GEAR_ORDER_REF_TYPE } from "./rental";
import { CAMP_TIME_ZONE } from "./time-zone";

export type { NotificationKind, NotificationPayload } from "@camp404/types";

/** The reference a questionnaire notice carries: the activation it is about. */
export const QUESTIONNAIRE_REF_TYPE = "questionnaire_activation";
/** The reference an announcement carries: its own broadcast. */
export const ANNOUNCEMENT_REF_TYPE = "announcement";
/** The reference a captain request carries: the promotion request. */
export const CAPTAIN_PROMOTION_REF_TYPE = "captain_promotion";
/** The reference a task deadline reminder carries: the task. */
export const TASK_REF_TYPE = "task";
/** The reference a pet's notice carries: the pet. */
export const PET_REF_TYPE = "pet";
/**
 * The reference an event invite carries: the event's Google id (the app's are
 * 32 hex digits, a UUID without its dashes), written as a UUID to fit the
 * column; the link takes the dashes out again.
 */
export const CALENDAR_EVENT_REF_TYPE = "calendar_event";

/** An app event's Google id as the uuid column holds it, or null. */
export function calendarEventRefId(calendarEventId: string): string | null {
  const hex = calendarEventId.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** The reference a driver's message carries: its own broadcast. */
export const CAR_MESSAGE_REF_TYPE = "car_message";
/**
 * The reference a deadline reminder carries for a required action that no
 * questionnaire send stands behind: the required_actions row itself.
 */
export const REQUIRED_ACTION_REF_TYPE = "required_action";

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
 * A captain put an optional questionnaire in My forms and chose "Tell everyone
 * it's there" (#313, owner approved 2026-10-03). Nobody is asked: the note
 * says where it is and that it is up to them. The tap opens the form.
 */
export function optInQuestionnaireNotification(input: {
  activationId: string;
  title: string;
}): NotificationPayload {
  return {
    kind: "questionnaire_release",
    title: input.title,
    body: `${input.title} is in My forms under Optional. Nobody has to fill it in: answer it if you want to.`,
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
 * A nudge about a required action with a deadline that is not tied to a
 * questionnaire send (#134). It reuses the questionnaire reminder's kind: the
 * kind is not shown to the member and only decides that it is emailed, and a
 * kind of its own would need a database migration. The row's title (what the
 * member was asked to do) is the only fact it carries.
 */
export function requiredActionReminderNotification(input: {
  requiredActionId: string;
  title: string;
  dueAt: Date;
}): NotificationPayload {
  return {
    kind: "questionnaire_reminder",
    title: input.title,
    body: `Reminder: ${input.title} is due ${DUE_ON.format(input.dueAt)}. Tap to open the app.`,
    refType: REQUIRED_ACTION_REF_TYPE,
    refId: input.requiredActionId,
  };
}

/**
 * A captain asked the member to say what sleeping gear they need (#241). It
 * reuses the questionnaire reminder's kind, as the required-action reminder
 * does: the kind is not shown and only decides that it is emailed. It points
 * at the member's `required_actions` row and opens My gear.
 */
export function gearOrderAskNotification(input: {
  requiredActionId: string | null;
}): NotificationPayload {
  return {
    kind: "questionnaire_reminder",
    title: GEAR_ORDER_ACTION_TITLE,
    body: "The captains are putting the camp's gear order together. Open My gear and say what you have and what you need.",
    refType: GEAR_ORDER_REF_TYPE,
    refId: input.requiredActionId,
  };
}

const FEE_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "30 Nov", from a YYYY-MM-DD day (the day as written if it is not one). */
function feeDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : FEE_DAY.format(date);
}

/**
 * The Finance team asked the member to say what they can put in to camp fees
 * (camp fees sprint, owner 2026-10-27). Personal: it is about their own
 * pledge, so it goes by Ol' Jeb too. Opens My dues.
 */
export function feePledgeAskNotification(input: {
  requiredActionId: string | null;
}): NotificationPayload {
  return {
    kind: "fee_reminder",
    title: FEE_PLEDGE_ACTION_TITLE,
    body: "Say how much you can put in to camp fees this year and by when. Any amount helps, and you can ask for a subsidy. Open My dues.",
    refType: FEE_PLEDGE_REF_TYPE,
    refId: input.requiredActionId,
  };
}

/**
 * A reminder about the member's OWN next camp fee payment: how much and by
 * when, what they paid of what, and their payment reference. Sent by the
 * Finance team's "Remind who still owes" and automatically as an instalment
 * comes due. Never names anyone else. Opens My dues.
 */
export function feePaymentReminderNotification(input: {
  requiredActionId: string | null;
  next: NextFeePayment;
  owingCents: number;
  paidCents: number;
  totalCents: number;
  refCode: string | null;
}): NotificationPayload {
  const title =
    input.next.kind === "due"
      ? `Your camp fee: ${formatMoney(input.next.amountCents)} by ${feeDay(input.next.dueOn)}`
      : `Your camp fee: ${formatMoney(input.owingCents)} still to pay`;
  const body = [
    `You have paid ${formatMoney(input.paidCents)} of ${formatMoney(input.totalCents)}.`,
    input.next.kind === "due" && input.next.overdue
      ? "That day has passed, so please pay when you can or talk to the Finance team."
      : null,
    input.next.kind === "no_date"
      ? "Talk to a captain about when you can pay it."
      : null,
    input.refCode ? `Your reference is ${input.refCode}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "fee_reminder",
    title,
    body,
    refType: FEE_PAYMENT_REF_TYPE,
    refId: input.requiredActionId,
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
 * A driver wrote to the people riding in their car. The text is the
 * driver's own; the inbox names them as the sender. The tap opens My lift.
 */
export function carMessageNotification(input: {
  broadcastId: string;
  title: string;
  body: string;
}): NotificationPayload {
  return {
    kind: "car_message",
    title: input.title,
    body: input.body,
    refType: CAR_MESSAGE_REF_TYPE,
    refId: input.broadcastId,
  };
}

/**
 * A captain marked the member's pet in. The hint is the captain's one line,
 * and the pet's name the member's own; nothing says what "in" means.
 */
export function petInNotification(input: {
  petId: string;
  petName: string;
  hint: string;
}): NotificationPayload {
  return {
    kind: "pet_in",
    title: `${input.petName} is in`,
    body: `Your pet is in. Hint: ${input.hint}`,
    refType: PET_REF_TYPE,
    refId: input.petId,
  };
}

/**
 * A calendar event made for the member: by name, or for the team leads they
 * are one of. It says what, when (camp time, GMT+2) and the call link, and
 * the tap opens the event in the Calendar.
 */
export function campEventInviteNotification(input: {
  calendarEventId: string;
  title: string;
  /** "Tue 27 Oct, 21:00 GMT+2", as the Telegram post says it. */
  when: string;
  forTeamLeads: boolean;
  callUrl: string | null;
}): NotificationPayload {
  const why = input.forTeamLeads
    ? "For the team leads."
    : "You're on the list.";
  return {
    kind: "event_invite",
    title: `You're invited: ${input.title}`,
    body: [
      input.when,
      why,
      input.callUrl ? `Join the call: ${input.callUrl}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    refType: CALENDAR_EVENT_REF_TYPE,
    refId: calendarEventRefId(input.calendarEventId),
  };
}

/** Which of a task's two deadline reminders this is. */
export type TaskReminderStage = "day_before" | "due_day";

/**
 * A task the member is responsible for is due tomorrow, or today. The task's
 * title is the only fact it carries; the tap opens the task board.
 */
export function taskDeadlineNotification(input: {
  taskId: string;
  title: string;
  stage: TaskReminderStage;
}): NotificationPayload {
  const when = input.stage === "day_before" ? "Due tomorrow" : "Due today";
  return {
    kind: "task_reminder",
    title: input.title,
    body: `${when}: ${input.title}. Tap to open the task board.`,
    refType: TASK_REF_TYPE,
    refId: input.taskId,
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
