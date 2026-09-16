// Email for notifications: which ones are worth an email, and the email itself.
//
// PURE: no I/O. The drain (@camp404/db/email) decides who has a verified
// address and records the outcome; the Resend adapter (apps/web/lib/email.ts)
// sends. Email is the loudest channel a camp member has, and the one they
// cannot mute inside the app, so only notices a member must not miss go out:
// a must-acknowledge announcement, a questionnaire sent to them or chasing
// them, their approval, and a captain request. Quiet announcements, pop-ups
// and team chatter stay in the app.

import type { NotificationKind, NotificationPayload } from "@camp404/types";
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
    case "approval_decision":
    case "captain_promotion":
      return true;
    case "team_message":
    case "lead_directive":
      return false;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const FOOTER =
  "You're getting this because you're a member of Camp 404. It is also in your notifications in the app.";

/**
 * The email for one notification: the notice's own title and body, and a link
 * to open it in the app. Everything a member wrote is escaped in the HTML part,
 * so an announcement cannot inject markup into someone's inbox.
 */
export function renderNotificationEmail(
  payload: NotificationPayload,
  siteUrl: string,
): NotificationEmail {
  // payloadLink is always an in-app path ("/..."); core has no URL global.
  const url = `${siteUrl.replace(/\/+$/, "")}${payloadLink(payload)}`;
  const subject = `Camp 404: ${payload.title}`.slice(0, 200);
  const text = `${payload.title}\n\n${payload.body}\n\nOpen in Camp 404: ${url}\n\n${FOOTER}\n`;
  const html = [
    '<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">',
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(payload.title)}</h1>`,
    `<p style="white-space:pre-wrap;margin:0 0 20px">${escapeHtml(payload.body)}</p>`,
    `<p style="margin:0 0 24px"><a href="${escapeHtml(url)}">Open in Camp 404</a></p>`,
    `<p style="font-size:12px;color:#666;margin:0">${escapeHtml(FOOTER)}</p>`,
    "</div>",
  ].join("");
  return { subject, text, html };
}
