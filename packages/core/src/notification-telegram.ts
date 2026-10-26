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

/** What a message to Ol' Jeb asks for. */
export type BotCommand =
  | { command: "start"; code: string | null }
  | { command: "stop" }
  /** `bot`: the name after `@` (`/notifyhere@jebediah_404_bot`), or null. */
  | { command: "notifyhere"; bot: string | null }
  | { command: "other" };

/**
 * Read a message: `/start <code>` (Telegram's deep link sends it), `/stop`,
 * `/notifyhere` (in a group or a topic), or anything else. `/start@bot_name`
 * is the same command.
 */
export function parseBotCommand(text: string | undefined): BotCommand {
  const match = /^\/([a-z]+)(?:@([A-Za-z0-9_]+))?(?:\s+(\S+))?\s*$/i.exec(
    (text ?? "").trim(),
  );
  if (!match) return { command: "other" };
  const name = match[1]!.toLowerCase();
  if (name === "start") return { command: "start", code: match[3] ?? null };
  if (name === "stop") return { command: "stop" };
  if (name === "notifyhere") {
    return { command: "notifyhere", bot: match[2] ?? null };
  }
  return { command: "other" };
}

/**
 * Whether a command is for Ol' Jeb: one with no `@name`, or with his own
 * (`ours`, without the @; any case). In a group with several bots,
 * `/notifyhere@other_bot` is that bot's.
 */
export function isCommandForUs(
  bot: string | null,
  ours: string | null,
): boolean {
  if (bot === null) return true;
  return ours !== null && bot.toLowerCase() === ours.toLowerCase();
}

/**
 * A member's Telegram username as a tag ("@cloud_404"), or null when what
 * they typed is not a username Telegram allows (5 to 32 letters, digits and
 * underscores, starting with a letter). Only a well-formed handle is ever
 * put in a post, so nothing a member typed becomes other text there.
 */
export function telegramMention(
  handle: string | null | undefined,
): string | null {
  const name = (handle ?? "").trim().replace(/^@+/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? `@${name}` : null;
}

// --- Posts in the camp's chats -------------------------------------------

export const TELEGRAM_ANSWER_BUTTON = "Answer in Camp 404";

/** What Ol' Jeb posts in a camp chat. */
export type TelegramPostKind = "announcement" | "reminder" | "meeting";

export interface TelegramPost {
  /** Plain text, sent with no parse mode. */
  text: string;
  /** The button under it, or null. */
  button: { text: string; url: string } | null;
}

/**
 * The post itself: its title, the plain body, and for a reminder the tags of
 * who still owes the form ("Still to answer: @a @b and 2 more without a
 * Telegram username."). `tags` are already `telegramMention` values.
 */
export function renderTelegramPost(
  post: {
    kind: TelegramPostKind;
    title: string;
    body: string;
    buttonText: string | null;
    buttonPath: string | null;
    tags?: readonly string[];
    untagged?: number;
  },
  siteUrl: string,
): TelegramPost {
  const lines = [post.title.trim()];
  const body = plainPreview(post.body);
  if (body) lines.push(body);
  if (post.kind === "reminder") {
    const line = stillToAnswer(post.tags ?? [], post.untagged ?? 0);
    if (line) lines.push(line);
  }
  const full = lines.filter(Boolean).join("\n\n");
  const text =
    full.length <= TELEGRAM_MESSAGE_MAX
      ? full
      : `${full.slice(0, TELEGRAM_MESSAGE_MAX - 1).trimEnd()}…`;
  const button =
    post.buttonText && post.buttonPath
      ? {
          text: post.buttonText,
          url: `${siteUrl.replace(/\/+$/, "")}${post.buttonPath}`,
        }
      : null;
  return { text, button };
}

function stillToAnswer(tags: readonly string[], untagged: number): string {
  const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);
  if (tags.length === 0) {
    return untagged > 0
      ? `Still to answer: ${people(untagged)} without a Telegram username.`
      : "";
  }
  const more =
    untagged > 0 ? ` and ${untagged} more without a Telegram username` : "";
  return `Still to answer: ${tags.join(" ")}${more}.`;
}

const POST_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A camp day ("2026-11-02") as "Mon 2 Nov". */
function postDay(day: string): string {
  return POST_DAY.format(new Date(`${day}T12:00:00Z`)).replace(",", "");
}

/**
 * A new meeting's second line: "Sat 2 Nov, 18:00 · Structures team", or the
 * days of an all-day one, and "Whole camp" with no team.
 */
export function meetingPostBody(meeting: {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  teamLabel: string | null;
}): string {
  const when = meeting.allDay
    ? meeting.endDate && meeting.endDate !== meeting.startDate
      ? `${postDay(meeting.startDate)} to ${postDay(meeting.endDate)}`
      : postDay(meeting.startDate)
    : `${postDay(meeting.startDate)}${meeting.startTime ? `, ${meeting.startTime}` : ""}`;
  const who = meeting.teamLabel ? `${meeting.teamLabel} team` : "Whole camp";
  return `${when} · ${who}`;
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
  postingHere: "Got it! I'll post camp news in this chat from now on.",
  notACaptain:
    "Sorry, only a captain who connected me in Camp 404 can do that.",
  notifyhereInGroup:
    "Send /notifyhere in the group or topic where I should post camp news.",
} as const;
