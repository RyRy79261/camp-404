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
