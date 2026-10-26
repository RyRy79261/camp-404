import {
  OL_JEB_SAYS,
  parseBotCommand,
  TELEGRAM_OPEN_BUTTON,
} from "@camp404/core";
import {
  connectTelegram,
  isTelegramConnected,
  stopTelegramByTelegramId,
  type TelegramSend,
} from "@camp404/db/telegram-dm";
import { TelegramApiError, type TelegramClient } from "./client";
import type { TelegramChatMemberUpdate, TelegramMessage } from "./webhook";

// Ol' Jeb's private chats: a member connects with `/start <code>` from their
// Profile's link, stops with `/stop` (or by blocking the bot), and gets each
// notice as a plain message with an "Open in Camp 404" button. Ol' Jeb reads
// only private messages and answers with a fixed sentence: group text is never
// read, and nothing a member types does anything but connect or stop.

/** Answer one private message. Group messages are ignored. */
export async function handlePrivateMessage(
  message: TelegramMessage,
  client: TelegramClient,
): Promise<void> {
  if (message.chat.type !== "private" || !message.from) return;
  if (message.from.is_bot) return;
  const telegramUserId = String(message.from.id);
  const command = parseBotCommand(message.text);

  let reply: string;
  if (command.command === "start" && command.code) {
    const result = await connectTelegram({
      code: command.code,
      telegramUserId,
      username: message.from.username ?? null,
    });
    reply = result.ok
      ? OL_JEB_SAYS.connected(message.from.first_name)
      : OL_JEB_SAYS.linkRunOut;
  } else if (command.command === "start") {
    reply = (await isTelegramConnected(telegramUserId))
      ? OL_JEB_SAYS.onlyNotices
      : OL_JEB_SAYS.hello;
  } else if (command.command === "stop") {
    reply = (await stopTelegramByTelegramId(telegramUserId))
      ? OL_JEB_SAYS.stopped
      : OL_JEB_SAYS.notConnected;
  } else {
    reply = OL_JEB_SAYS.onlyNotices;
  }
  // The work is done; a reply that fails to send must not make Telegram retry
  // the update, which would answer a used code with "That link has run out".
  await client
    .sendMessage({ chatId: message.chat.id, text: reply })
    .catch(() => undefined);
}

/**
 * The bot's own place in a chat changed. In a private chat, "kicked" means the
 * member blocked Ol' Jeb: stop their notices.
 */
export async function handleMyChatMember(
  update: TelegramChatMemberUpdate,
): Promise<void> {
  if (update.chat.type !== "private") return;
  if (update.new_chat_member.status === "kicked") {
    await stopTelegramByTelegramId(String(update.from.id));
  }
}

/** The drain's send, through the Bot API. */
export function telegramNoticeSender(client: TelegramClient): TelegramSend {
  return async (chatId, notice) => {
    try {
      await client.sendMessage({
        chatId,
        text: notice.text,
        disableWebPagePreview: true,
        inlineKeyboard: [[{ text: TELEGRAM_OPEN_BUTTON, url: notice.url }]],
      });
      return { ok: true };
    } catch (err) {
      if (!(err instanceof TelegramApiError)) throw err;
      return telegramSendFailure(err);
    }
  };
}

/** What a Bot API refusal means for one notice. */
export function telegramSendFailure(err: TelegramApiError) {
  const error = `Telegram ${err.errorCode}`;
  if (err.errorCode === 429)
    return { ok: false as const, error, rateLimited: true };
  // 403: blocked, or never opened the chat. 400 "chat not found": the same.
  if (
    err.errorCode === 403 ||
    (err.errorCode === 400 && /chat not found/i.test(err.description))
  ) {
    return { ok: false as const, error, blocked: true };
  }
  if (err.errorCode >= 500)
    return { ok: false as const, error, retryable: true };
  return { ok: false as const, error };
}
