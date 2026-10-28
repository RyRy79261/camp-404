// Notices by Telegram: which ones a connected member gets from Ol' Jeb (the
// camp's bot), the message itself, and the few words Ol' Jeb answers with.
//
// PURE: no I/O. The drain (@camp404/db/telegram-drain) decides who is
// connected and records the outcome; apps/web sends. A Telegram message is the
// same plain text push puts on a lock screen (the title and the plain body),
// so it carries nothing a push would not.

import type {
  NotificationKind,
  NotificationPayload,
  ParticipationIntent,
  ParticipationStatus,
} from "@camp404/types";
import { plainPreview } from "./markdown-text";
import { CAMP_GMT } from "./time-zone";
import { notificationLink } from "./notification-links";
import {
  INTENT_LABEL,
  isComingThisYear,
  NO_ANSWER_LABEL,
} from "./participation";

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
    case "event_invite":
    case "fee_reminder":
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

export interface TelegramPost {
  /** Plain text, sent with no parse mode. */
  text: string;
  /** The button under it, or null. */
  button: { text: string; url: string } | null;
  /**
   * More messages, sent after it: the tags that did not fit under
   * Telegram's 4096 characters. Plain text, no button.
   */
  more?: string[];
}

/**
 * A queued post as it is stored: its title, its body and its button. Which
 * of the renderers below draws it is its kind's (`TELEGRAM_POST_KINDS` in
 * `@camp404/db/telegram-post-kinds`).
 */
export interface TelegramPostFields {
  title: string;
  body: string;
  buttonText: string | null;
  buttonPath: string | null;
}

function postButton(
  post: TelegramPostFields,
  siteUrl: string,
): TelegramPost["button"] {
  return post.buttonText && post.buttonPath
    ? {
        text: post.buttonText,
        url: `${siteUrl.replace(/\/+$/, "")}${post.buttonPath}`,
      }
    : null;
}

function postLines(post: TelegramPostFields): string[] {
  const lines = [post.title.trim()];
  const body = plainPreview(post.body);
  if (body) lines.push(body);
  return lines;
}

/** A post's title and plain body, with its button. */
export function renderPlainPost(
  post: TelegramPostFields,
  siteUrl: string,
): TelegramPost {
  return {
    text: clip(postLines(post).filter(Boolean).join("\n\n")),
    button: postButton(post, siteUrl),
  };
}

/**
 * A reminder: its title, the plain body, and the tags of who still owes the
 * form ("Still to answer: @a @b and 2 more without a Telegram username.").
 * `tags` are already `telegramMention` values.
 */
export function renderReminderPost(
  post: TelegramPostFields & { tags: readonly string[]; untagged: number },
  siteUrl: string,
): TelegramPost {
  const lines = postLines(post);
  const line = stillToAnswer(post.tags, post.untagged);
  if (line) lines.push(line);
  return {
    text: clip(lines.filter(Boolean).join("\n\n")),
    button: postButton(post, siteUrl),
  };
}

/**
 * A questionnaire posted by hand: its title and line, then every tag the
 * poster picked ("@a @b, this one's for you."). Every tag is sent: the ones
 * that do not fit under Telegram's limit go in the messages after it.
 */
export function renderQuestionnairePost(
  post: TelegramPostFields & { tags: readonly string[] },
  siteUrl: string,
): TelegramPost {
  return questionnairePost(
    postLines(post),
    post.tags,
    postButton(post, siteUrl),
  );
}

/** A new lead post's first line. */
export const TELEGRAM_LEAD_TITLE = "New team lead";

/**
 * A captain's "Tell the camp on Telegram" after making someone a lead: the
 * body holds only the team's name; the person is read as it is sent, so an
 * erased member's name is never stored in the post.
 */
export function renderLeadPost(
  post: TelegramPostFields & {
    lead: { name: string; mention: string | null };
  },
  siteUrl: string,
): TelegramPost {
  const team = post.body.trim();
  const who = post.lead.mention
    ? `${post.lead.name} (${post.lead.mention})`
    : post.lead.name;
  return {
    text: clip(
      `${TELEGRAM_LEAD_TITLE}\n\n${who} is now a ${team} lead. Give them a shout if you want to help out.`,
    ),
    button: postButton(post, siteUrl),
  };
}

/** The words after a hand-posted questionnaire's tags. */
export const QUESTIONNAIRE_TAG_TAIL = "this one's for you.";

/** {@link renderQuestionnairePost}'s tags, split under Telegram's limit. */
function questionnairePost(
  lines: string[],
  tags: readonly string[],
  button: TelegramPost["button"],
): TelegramPost {
  const head = clip(lines.filter(Boolean).join("\n\n"));
  if (tags.length === 0) return { text: head, button };
  const chunks: string[] = [];
  let current = "";
  // Room for ", this one's for you." on the last chunk.
  const room = TELEGRAM_MESSAGE_MAX - QUESTIONNAIRE_TAG_TAIL.length - 2;
  for (const tag of tags) {
    const next = current ? `${current} ${tag}` : tag;
    if (next.length > room && current) {
      chunks.push(current);
      current = tag;
    } else {
      current = next;
    }
  }
  chunks.push(current);
  chunks[chunks.length - 1] += `, ${QUESTIONNAIRE_TAG_TAIL}`;
  const first = `${head}\n\n${chunks[0]}`;
  if (first.length <= TELEGRAM_MESSAGE_MAX) {
    const more = chunks.slice(1);
    return more.length > 0
      ? { text: first, button, more }
      : { text: first, button };
  }
  return { text: head, button, more: chunks };
}

function clip(text: string): string {
  return text.length <= TELEGRAM_MESSAGE_MAX
    ? text
    : `${text.slice(0, TELEGRAM_MESSAGE_MAX - 1).trimEnd()}…`;
}

// --- Who a hand-posted questionnaire tags (owner's mock-up, 2026-10-27) ----

/** A member who still owes the questionnaire, as the "Post in Telegram" dialog lists them. */
export interface TagCandidate {
  userId: string;
  name: string;
  /** What the member said this year, or null for no answer. */
  intent: ParticipationIntent | null;
  /** Their stored status this year (both halves), or null. */
  status: ParticipationStatus | null;
  /** Their `@handle` (`telegramMention`), or null: they cannot be tagged. */
  mention: string | null;
  /** They connected Ol' Jeb, so they can get a private message instead. */
  connected: boolean;
}

/** The dialog's "Who to tag" chips. */
export const TAG_GROUPS = ["pending", "coming", "maybe", "nobody"] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

export const TAG_GROUP_LABEL: Readonly<Record<TagGroup, string>> = {
  pending: "Hasn't answered",
  coming: "Said Coming, hasn't answered",
  maybe: "Said Maybe",
  nobody: "Nobody",
};

/**
 * Whether a member who still owes the form is in a chip's group. Every
 * candidate owes it, so "Hasn't answered" is all of them; "Said Coming" is
 * the camp's own rule for who is coming (`isComingThisYear`, as the
 * automatic reminders tag); "Said Maybe" is the member's own answer.
 */
export function inTagGroup(c: TagCandidate, group: TagGroup): boolean {
  switch (group) {
    case "pending":
      return true;
    case "coming":
      return isComingThisYear(c.status);
    case "maybe":
      return c.intent === "maybe";
    case "nobody":
      return false;
  }
}

/** How many members a chip names (its count). */
export function tagGroupCount(
  candidates: readonly TagCandidate[],
  group: TagGroup,
): number {
  return candidates.filter((c) => inTagGroup(c, group)).length;
}

/**
 * Who a chip ticks: its members who can be tagged and have not connected
 * Ol' Jeb (a connected member gets a private message instead, so starts
 * unticked; the poster may still tick them).
 */
export function tagGroupTicks(
  candidates: readonly TagCandidate[],
  group: TagGroup,
): Set<string> {
  return new Set(
    candidates
      .filter((c) => inTagGroup(c, group) && c.mention && !c.connected)
      .map((c) => c.userId),
  );
}

/** A candidate's answer this year, in the member's own words. */
export function tagCandidateStanding(c: TagCandidate): string {
  return c.intent ? INTENT_LABEL[c.intent] : NO_ANSWER_LABEL;
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
 * When an event is, as a post or a notice says it: "Sat 2 Nov, 18:00 GMT+2",
 * or its days ("Mon 2 Nov to Wed 4 Nov") when it is all day.
 */
export function campEventWhenText(event: {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
}): string {
  return event.allDay
    ? event.endDate && event.endDate !== event.startDate
      ? `${postDay(event.startDate)} to ${postDay(event.endDate)}`
      : postDay(event.startDate)
    : `${postDay(event.startDate)}${event.startTime ? `, ${event.startTime} ${CAMP_GMT}` : ""}`;
}

/**
 * Who an event is for by name, out of `candidates` (the picked people still
 * approved, or this year's team leads), never the person who made or changed
 * it. Only a team-leads or people event has any.
 */
export function campEventGuestIds(
  event: { audience: string },
  candidates: readonly string[],
  actorId: string,
): string[] {
  if (event.audience !== "team_leads" && event.audience !== "people") return [];
  return [...new Set(candidates)].filter((id) => id !== actorId);
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
  /** Who it is for; a team-leads event says so (owner, 2026-10-27). */
  audience?: string;
}): string {
  const when = campEventWhenText(meeting);
  const who =
    meeting.audience === "team_leads"
      ? "Team leads"
      : meeting.audience === "people"
        ? "Picked people"
        : meeting.teamLabel
          ? `${meeting.teamLabel} team`
          : "Whole camp";
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
