import "server-only";

import { TelegramClient } from "@camp404/telegram";

/**
 * Build a `TelegramClient` from environment. Throws if the bot token is
 * missing — callers are expected to handle that as a 503 in the route,
 * never to silently no-op.
 */
export function getTelegramClient(): TelegramClient {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return new TelegramClient({ botToken });
}

export function getWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

/** Whether Ol' Jeb can send: the bot token is set. */
export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * The bot's username (without "@"), for the Connect Telegram link. Unset: the
 * Profile shows no Telegram card.
 */
export function telegramBotUsername(): string | null {
  const name = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@+/, "");
  return name && /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : null;
}
