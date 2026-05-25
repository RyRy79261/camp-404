import { NextResponse } from "next/server";
import {
  handleChatMemberUpdate,
  parseUpdate,
  verifyWebhookSecret,
} from "@camp404/telegram";
import { getWebhookSecret } from "@/lib/telegram";

export const runtime = "nodejs";

// Webhook receiver for the Camp 404 Telegram bot. Telegram POSTs every
// update here; we verify the secret header (set via `setWebhook`), parse
// the update, and dispatch to the relevant handler. We ALWAYS reply 200
// OK as long as the secret is valid — Telegram retries non-2xx responses
// aggressively, and a parsing failure on one bad update should not stall
// the queue.
//
// Wiring: configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`,
// then `POST setWebhook` once at deploy time pointing at this URL with
// allowed_updates ["chat_member"] (plus "message" if you add commands).
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

  try {
    const update = parseUpdate(body);
    if (update.chat_member) {
      await handleChatMemberUpdate(update.chat_member);
    }
  } catch (err) {
    // Telegram will not retry a 200 — and we don't want it to. Log and
    // move on so a single malformed update doesn't block subsequent ones.
    console.error("[telegram/webhook] update handler failed", err);
  }

  return NextResponse.json({ ok: true });
}
