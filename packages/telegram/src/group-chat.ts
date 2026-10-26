import { isCommandForUs, OL_JEB_SAYS, parseBotCommand } from "@camp404/core";
import {
  addTelegramPlace,
  moveTelegramChat,
  type TelegramPostSend,
} from "@camp404/db/telegram-posts";
import { TelegramApiError, type TelegramClient } from "./client";
import { telegramSendFailure } from "./private-chat";
import type { TelegramMessage } from "./webhook";

// Ol' Jeb in the camp's groups (step 2 of docs/plans/2026-10-25-telegram-ol-
// jeb.md). He reads one command there, `/notifyhere`, from a captain who
// connected him, and nothing else a group says: privacy mode stays on, so
// Telegram sends him only commands, and he ignores every other one.

/** The thread a message is in: a forum topic's id, or null for the chat. */
function topicOf(message: TelegramMessage): string | null {
  return message.is_topic_message && message.message_thread_id !== undefined
    ? String(message.message_thread_id)
    : null;
}

/** "Camp 404 › Announcements" for a topic, the chat's own title otherwise. */
function placeTitle(message: TelegramMessage): string {
  const chat = message.chat.title?.trim() || "Telegram chat";
  if (!topicOf(message)) return chat;
  const topic = message.reply_to_message?.forum_topic_created?.name?.trim();
  return `${chat} › ${topic || "topic"}`;
}

/**
 * A message in a group or supergroup: `/notifyhere` (for Ol' Jeb) adds the
 * chat, or the topic it was sent in, as a place he posts camp news; a group
 * that became a supergroup keeps its place under the new id. Anything else
 * is ignored.
 */
export async function handleGroupMessage(
  message: TelegramMessage,
  client: TelegramClient,
  botUsername: string | null,
): Promise<void> {
  const type = message.chat.type;
  if (type !== "group" && type !== "supergroup") return;
  if (message.migrate_to_chat_id !== undefined) {
    await moveTelegramChat(
      String(message.chat.id),
      String(message.migrate_to_chat_id),
    );
    return;
  }
  if (!message.from || message.from.is_bot) return;
  const command = parseBotCommand(message.text);
  if (command.command !== "notifyhere") return;
  if (!isCommandForUs(command.bot, botUsername)) return;

  const threadId = topicOf(message);
  const result = await addTelegramPlace({
    telegramUserId: String(message.from.id),
    chatId: String(message.chat.id),
    threadId,
    title: placeTitle(message),
    username: message.chat.username ?? null,
  });
  // The place is saved (or refused); a reply that fails must not make
  // Telegram retry the update.
  await client
    .sendMessage({
      chatId: message.chat.id,
      messageThreadId: threadId === null ? undefined : Number(threadId),
      text: result.ok ? OL_JEB_SAYS.postingHere : OL_JEB_SAYS.notACaptain,
    })
    .catch(() => undefined);
}

/** The post drain's send, through the Bot API. */
export function telegramPostSender(client: TelegramClient): TelegramPostSend {
  return async (chatId, threadId, post) => {
    try {
      await client.sendMessage({
        chatId,
        messageThreadId: threadId === null ? undefined : Number(threadId),
        text: post.text,
        disableWebPagePreview: true,
        inlineKeyboard: post.button ? [[post.button]] : undefined,
      });
      return { ok: true };
    } catch (err) {
      if (!(err instanceof TelegramApiError)) throw err;
      return telegramSendFailure(err);
    }
  };
}
