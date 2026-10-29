import {
  findInviteByLink,
  getActiveChatByKind,
  listPendingInvitesForUser,
  markInviteUsed,
  recordInvite,
  recordTelegramUserId,
  type TelegramChatRow,
  type TelegramInviteRow,
} from "@camp404/db/telegram";
import type { TelegramClient } from "./client";
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
