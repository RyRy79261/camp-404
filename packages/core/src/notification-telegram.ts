// Notices by Telegram: which ones a connected member gets from Ol' Jeb (the
// camp's bot), the message itself, and the few words Ol' Jeb answers with.
//
// PURE: no I/O. The drain (@camp404/db/telegram-drain) decides who is
// connected and records the outcome; apps/web sends. A Telegram message is the
// same plain text push puts on a lock screen (the title and the plain body),
// so it carries nothing a push would not.

import type { NotificationKind, NotificationPayload } from "@camp404/types";
import { plainPreview } from "./markdown-text";
import { notificationLink } from "./notification-links";

/**
 * Which notices a connected member asked for (users.telegram_notices).
 * "mine", the default (owner, 2026-10-26), is only the notices about this
 * member; "all" adds what goes to the whole camp or a team.
 */
export type TelegramNotices = "mine" | "all";

/**
 * Whether a notice is about this member alone: something they owe, their own
 * task, their own approval or promotion, their car, their pet. Announcements,
 * questionnaire sends and team messages go to many people, and the camp group
 * gets those.
 */
export function isPersonalNotification(kind: NotificationKind): boolean {
  switch (kind) {
    case "questionnaire_reminder":
    case "task_reminder":
    case "approval_decision":
    case "captain_promotion":
    case "car_message":
    case "pet_in":
      return true;
    case "announcement":
    case "questionnaire_release":
    case "team_message":
    case "lead_directive":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Whether a delivery that goes by push also goes to this member by Telegram. */
export function shouldTelegramNotification(
  kind: NotificationKind,
  notices: TelegramNotices,
): boolean {
  if (notices === "all") return true;
  return isPersonalNotification(kind);
}

/** Telegram refuses a message over 4096 characters. */
export const TELEGRAM_MESSAGE_MAX = 4096;

export const TELEGRAM_OPEN_BUTTON = "Open in Camp 404";

export interface TelegramNotice {
  /** Plain text, sent with no parse mode, so nothing in it is markup. */
  text: string;
  /** The "Open in Camp 404" button's address. */
  url: string;
}

/** The message Ol' Jeb sends for one notice. */
export function renderTelegramNotice(
  payload: Pick<NotificationPayload, "title" | "body" | "refType" | "refId">,
  siteUrl: string,
): TelegramNotice {
  const url = `${siteUrl.replace(/\/+$/, "")}${notificationLink(payload.refType, payload.refId)}`;
  const body = plainPreview(payload.body);
  const full = body ? `${payload.title}\n\n${body}` : payload.title;
  const text =
    full.length <= TELEGRAM_MESSAGE_MAX
      ? full
      : `${full.slice(0, TELEGRAM_MESSAGE_MAX - 1).trimEnd()}…`;
  return { text, url };
}

/** What a private message to Ol' Jeb asks for. */
export type BotCommand =
  | { command: "start"; code: string | null }
  | { command: "stop" }
  | { command: "other" };

/**
 * Read a private message: `/start <code>` (Telegram's deep link sends it),
 * `/stop`, or anything else. `/start@bot_name` is the same command.
 */
export function parseBotCommand(text: string | undefined): BotCommand {
  const match = /^\/([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/i.exec(
    (text ?? "").trim(),
  );
  if (!match) return { command: "other" };
  const name = match[1]!.toLowerCase();
  if (name === "start") return { command: "start", code: match[2] ?? null };
  if (name === "stop") return { command: "stop" };
  return { command: "other" };
}

/** Ol' Jeb's own words: casual and friendly (owner, 2026-10-26). */
export const OL_JEB_SAYS = {
  connected: (firstName: string | undefined) =>
    `Hey${firstName ? ` ${firstName}` : ""}, you're all set. Your camp notices will land here now.`,
  linkRunOut:
    "That link has run out. Press Connect Telegram on your Profile again.",
  hello:
    "I'm Ol' Jeb, Camp 404's bot. Connect me from your Profile in Camp 404 and I'll send your camp notices here.",
  stopped:
    "No worries, I'll stop messaging you. Reconnect from your Profile any time.",
  notConnected:
    "You're not connected yet. Connect me from your Profile in Camp 404 and I'll send your camp notices here.",
  onlyNotices: "I only send camp notices. For anything else, open Camp 404.",
} as const;
