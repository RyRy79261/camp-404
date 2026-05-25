import { z } from "zod";

/**
 * Just the slice of Telegram's `Update` object we actually consume.
 * We deliberately do not validate every field — Zod's `passthrough()`
 * keeps extras around for logging without forcing us to maintain a full
 * mirror of the Bot API schema.
 */

const telegramUserSchema = z
  .object({
    id: z.number(),
    is_bot: z.boolean().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

const telegramChatSchema = z
  .object({
    id: z.number(),
    type: z.string(),
    title: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

const chatInviteLinkSchema = z
  .object({
    invite_link: z.string(),
    name: z.string().optional(),
    creates_join_request: z.boolean().optional(),
    is_primary: z.boolean().optional(),
    is_revoked: z.boolean().optional(),
  })
  .passthrough();

const chatMemberSchema = z
  .object({
    status: z.string(),
    user: telegramUserSchema,
  })
  .passthrough();

const chatMemberUpdatedSchema = z
  .object({
    chat: telegramChatSchema,
    from: telegramUserSchema,
    date: z.number(),
    old_chat_member: chatMemberSchema,
    new_chat_member: chatMemberSchema,
    invite_link: chatInviteLinkSchema.optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    message_id: z.number(),
    chat: telegramChatSchema,
    from: telegramUserSchema.optional(),
    date: z.number(),
    text: z.string().optional(),
  })
  .passthrough();

export const updateSchema = z
  .object({
    update_id: z.number(),
    message: messageSchema.optional(),
    chat_member: chatMemberUpdatedSchema.optional(),
    my_chat_member: chatMemberUpdatedSchema.optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof updateSchema>;
export type TelegramChatMemberUpdate = z.infer<typeof chatMemberUpdatedSchema>;
export type TelegramMessage = z.infer<typeof messageSchema>;

/**
 * Validate that a Telegram webhook request carries the secret token we
 * configured via `setWebhook`. Telegram passes it in the
 * `X-Telegram-Bot-Api-Secret-Token` header on every delivery.
 */
export function verifyWebhookSecret(
  headerValue: string | null,
  expectedSecret: string,
): boolean {
  if (!headerValue || !expectedSecret) return false;
  // Constant-time compare so we don't leak prefix-match timing to a caller
  // that can replay attempts.
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedSecret);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

export function parseUpdate(raw: unknown): TelegramUpdate {
  return updateSchema.parse(raw);
}

/**
 * Reads the `name` field a bot put on a `createChatInviteLink` call back
 * out of an incoming `chat_member` update. We use this name as our
 * correlation id between the issued invite and the join event.
 */
export function inviteLinkFromUpdate(
  update: TelegramChatMemberUpdate,
): string | null {
  return update.invite_link?.invite_link ?? null;
}
