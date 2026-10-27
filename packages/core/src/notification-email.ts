// Email for notifications: which ones are worth an email, and the email itself.
//
// PURE: no I/O. The drain (@camp404/db/email) decides who has a verified
// address and records the outcome; the Resend adapter (apps/web/lib/email.ts)
// sends. Email is the loudest channel a camp member has, and the one they
// cannot mute inside the app, so only notices a member must not miss go out:
// a must-acknowledge announcement, a questionnaire sent to them or chasing
// them, a task of theirs coming due, their approval, and a captain request. Quiet announcements, pop-ups
// and team chatter stay in the app.

import type { NotificationKind, NotificationPayload } from "@camp404/types";
import { renderEmailLayout } from "./email-layout";
import { plainPreview } from "./markdown-text";
import { payloadLink } from "./notifications";

type Presentation = "acknowledge" | "popup" | "feed";

/** Whether a delivery of this kind and presentation also goes out by email. */
export function shouldEmailNotification(
  kind: NotificationKind,
  presentation: Presentation,
): boolean {
  switch (kind) {
    case "announcement":
      return presentation === "acknowledge";
    case "questionnaire_release":
    case "questionnaire_reminder":
    case "task_reminder":
    case "approval_decision":
    case "captain_promotion":
      return true;
    // Team chatter, and a driver's word to their riders: in the app and by
    // push only.
    case "team_message":
    case "lead_directive":
    case "car_message":
      return false;
    // A pet's hint: a nice surprise, not something a member must not miss.
    case "pet_in":
      return false;
    // An event made for them by name or as a lead: not to be missed.
    case "event_invite":
      return true;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export interface NotificationEmail {
  subject: string;
  text: string;
  html: string;
}

/** The small label over an email's title: what kind of notice it is. */
export const NOTIFICATION_EMAIL_LABEL: Readonly<
  Record<NotificationKind, string>
> = {
  announcement: "Announcement",
  team_message: "Team message",
  lead_directive: "From your team leads",
  questionnaire_release: "New questionnaire",
  questionnaire_reminder: "Reminder",
  approval_decision: "Your place in the camp",
  captain_promotion: "Captain request",
  task_reminder: "Task due",
  car_message: "From your driver",
  pet_in: "Camp pets",
  event_invite: "Calendar",
};

const FOOTER =
  "You get this email because you are a member of Camp 404. This notice is also in your inbox in the app.";

/**
 * The email for one notification: the notice's own title and body, and a link
 * to open it in the app. Everything a member wrote is escaped in the HTML part,
 * so an announcement cannot inject markup into someone's inbox.
 *
 * Email is a PLAIN-TEXT boundary, both halves of it. The text part has no
 * renderer at all, and the HTML part escapes what it is handed — which is the
 * only safe thing to do with a member's markup in someone else's inbox, and
 * which would print `**Water**` verbatim. So a body written in markdown is
 * stripped to its words here; the rendered version waits behind the link.
 */
export function renderNotificationEmail(
  payload: NotificationPayload,
  siteUrl: string,
): NotificationEmail {
  // payloadLink is always an in-app path ("/..."); core has no URL global.
  const url = `${siteUrl.replace(/\/+$/, "")}${payloadLink(payload)}`;
  const subject = `Camp 404: ${payload.title}`.slice(0, 200);
  const body = plainPreview(payload.body);
  const text = `${payload.title}\n\n${body}\n\nOpen in Camp 404: ${url}\n\n${FOOTER}\n`;
  const html = renderEmailLayout({
    label: NOTIFICATION_EMAIL_LABEL[payload.kind],
    title: payload.title,
    paragraphs: body.split(/\n{2,}/),
    button: { text: "Open in Camp 404", url },
    footer: FOOTER,
  });
  return { subject, text, html };
}
