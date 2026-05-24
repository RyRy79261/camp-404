import {
  enqueueAnnouncement,
  findInviteByLink,
  getActiveChatByKind,
  listDueAnnouncements,
  listPendingInvitesForUser,
  markAnnouncementFailed,
  markAnnouncementSent,
  markInviteUsed,
  recordInvite,
  recordTelegramUserId,
  type TelegramAnnouncementRow,
  type TelegramChatRow,
  type TelegramInviteRow,
} from "@camp404/db/telegram";
import { TelegramApiError, type TelegramClient } from "./client";
import type { TelegramChatMemberUpdate } from "./webhook";

/** How long a per-user invite link stays valid before Telegram retires it. */
export const DEFAULT_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IssueInviteResult {
  invite: TelegramInviteRow;
  chat: TelegramChatRow;
  /** Whether we reused an existing pending link instead of creating one. */
  reused: boolean;
}

/**
 * Issue a single-use group invite link to the given user. Idempotent:
 * if the user already has a pending, non-expired invite to the main
 * group, the existing row is returned unchanged.
 */
export async function issueGroupInviteForUser(input: {
  client: TelegramClient;
  userId: string;
  /** Override the default 7-day expiry. */
  ttlSeconds?: number;
  now?: Date;
}): Promise<IssueInviteResult> {
  const now = input.now ?? new Date();
  const chat = await getActiveChatByKind("main_group");
  if (!chat) {
    throw new Error(
      "No active main_group telegram chat is configured. Register one via upsertChat first.",
    );
  }

  const existing = (await listPendingInvitesForUser(input.userId, now))[0];
  if (existing && existing.chatId === chat.chatId) {
    return { invite: existing, chat, reused: true };
  }

  const ttl = input.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS;
  const expireDate = Math.floor(now.getTime() / 1000) + ttl;
  const link = await input.client.createChatInviteLink({
    chatId: chat.chatId,
    memberLimit: 1,
    expireDate,
    name: `camp404:${input.userId}`,
  });
  const invite = await recordInvite({
    userId: input.userId,
    chatId: chat.chatId,
    inviteLink: link.invite_link,
    expiresAt: new Date(expireDate * 1000),
  });
  return { invite, chat, reused: false };
}

/**
 * Handle a `chat_member` webhook update. When a user joins via one of
 * our issued invite links, mark the invite row used and link the user's
 * numeric Telegram id back to their camp profile.
 *
 * Returns the affected invite row (if any) so the caller can log.
 */
export async function handleChatMemberUpdate(
  update: TelegramChatMemberUpdate,
): Promise<TelegramInviteRow | null> {
  const becameMember =
    isJoinedState(update.new_chat_member.status) &&
    !isJoinedState(update.old_chat_member.status);
  if (!becameMember) return null;

  const link = update.invite_link?.invite_link;
  if (!link) return null;

  const invite = await findInviteByLink(link);
  if (!invite || invite.status !== "pending") return null;

  const joinedAt = new Date(update.date * 1000);
  await markInviteUsed(invite.id, joinedAt);
  await recordTelegramUserId({
    userId: invite.userId,
    telegramUserId: String(update.new_chat_member.user.id),
  });
  return { ...invite, status: "used", joinedAt };
}

function isJoinedState(status: string): boolean {
  return (
    status === "member" || status === "administrator" || status === "creator"
  );
}

export interface EnqueueAnnouncementInput {
  body: string;
  /** Optional cross-reference to a `broadcasts` row. */
  broadcastId?: string | null;
  /** Future-dated announcements: send no earlier than this. */
  sendAfter?: Date | null;
  /** Override the default `announcement_channel` target. */
  chatId?: string;
}

/**
 * Queue a Telegram announcement. Defaults to the active
 * `announcement_channel`. Returns the queued row.
 */
export async function queueAnnouncement(
  input: EnqueueAnnouncementInput,
): Promise<TelegramAnnouncementRow> {
  let chatId = input.chatId;
  if (!chatId) {
    const chat = await getActiveChatByKind("announcement_channel");
    if (!chat) {
      throw new Error(
        "No active announcement_channel telegram chat is configured.",
      );
    }
    chatId = chat.chatId;
  }
  return enqueueAnnouncement({
    chatId,
    body: input.body,
    broadcastId: input.broadcastId ?? null,
    sendAfter: input.sendAfter ?? null,
  });
}

export interface DispatchResult {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Drain the announcement queue: send each due row, mark it sent / failed.
 * Safe to call from a cron — bounded by `limit` per invocation so a
 * thundering herd doesn't exhaust the function's wall-clock budget.
 */
export async function dispatchPendingAnnouncements(input: {
  client: TelegramClient;
  now?: Date;
  limit?: number;
}): Promise<DispatchResult> {
  const now = input.now ?? new Date();
  const due = await listDueAnnouncements(now, input.limit ?? 25);
  let sent = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const message = await input.client.sendMessage({
        chatId: row.chatId,
        text: row.body,
      });
      await markAnnouncementSent({
        id: row.id,
        messageId: String(message.message_id),
        sentAt: new Date(),
      });
      sent++;
    } catch (err) {
      const description =
        err instanceof TelegramApiError
          ? err.description
          : err instanceof Error
            ? err.message
            : String(err);
      await markAnnouncementFailed({ id: row.id, errorMessage: description });
      failed++;
    }
  }
  return { attempted: due.length, sent, failed };
}
