import { errorLogText } from "@camp404/core";
import {
  forgetTelegramUpdate,
  recordTelegramUpdate,
} from "@camp404/db/telegram-dm";
import { NextResponse } from "next/server";
import {
  handleChatMemberUpdate,
  handleGroupMessage,
  handleMyChatMember,
  handlePrivateMessage,
  updateSchema,
  verifyWebhookSecret,
} from "@camp404/telegram";
import {
  getTelegramClient,
  getWebhookSecret,
  telegramBotUsername,
} from "@/lib/telegram";

export const runtime = "nodejs";

// Webhook receiver for Ol' Jeb, the camp's Telegram bot. Telegram POSTs every
// update here with the secret header set by `setWebhook`.
//
// - A bad secret is 401. A body that is not an update we read is 200: Telegram
//   retries anything else, and one bad update must not stall the queue.
// - Each update is handled once, by its update_id (`telegram_updates`): a
//   retry of one already handled is 200 and does nothing.
// - Our own failure (the database, mostly) is 503, after forgetting the
//   update_id, so Telegram's retry handles it again.
//
// What Ol' Jeb reads: private messages (`/start <code>` connects a member,
// `/stop` stops their notices, anything else gets one fixed sentence), in a
// group only `/notifyhere` from a connected captain (the chat or topic he
// posts camp news in) and a group's move to a supergroup,
// `my_chat_member` (a member blocking the bot), and `chat_member` (a member
// joining the camp group through their invite link). No other group text
// is read. Register the webhook with allowed_updates
// ["message", "my_chat_member", "chat_member"], on the production domain only.
export async function POST(req: Request) {
  let secret: string;
  try {
    secret = getWebhookSecret();
  } catch {
    return new NextResponse("Telegram bot not configured", { status: 503 });
  }

  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecret(headerSecret, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "non-json" });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true, ignored: "not-an-update" });
  }
  const update = parsed.data;

  try {
    if (!(await recordTelegramUpdate(update.update_id))) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }
  } catch (err) {
    console.error(
      "[telegram/webhook] could not record the update",
      errorLogText(err, process.env),
    );
    return new NextResponse("Try again", { status: 503 });
  }

  try {
    if (update.message?.chat.type === "private") {
      await handlePrivateMessage(update.message, getTelegramClient());
    } else if (update.message) {
      await handleGroupMessage(
        update.message,
        getTelegramClient(),
        telegramBotUsername(),
      );
    }
    if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member);
    }
    if (update.chat_member) {
      await handleChatMemberUpdate(update.chat_member);
    }
  } catch (err) {
    console.error(
      "[telegram/webhook] update handler failed",
      errorLogText(err, process.env),
    );
    try {
      await forgetTelegramUpdate(update.update_id);
    } catch {
      // Then Telegram's retry is dropped as a duplicate; nothing better to do.
    }
    return new NextResponse("Try again", { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
