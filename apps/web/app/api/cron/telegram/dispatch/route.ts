import { NextResponse } from "next/server";
import { dispatchPendingAnnouncements } from "@camp404/telegram";
import { getTelegramClient } from "@/lib/telegram";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Drains the `telegram_announcements` queue. Scheduled in vercel.json.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;

  let client;
  try {
    client = getTelegramClient();
  } catch {
    return NextResponse.json({
      ok: true,
      skipped: "telegram_bot_not_configured",
    });
  }

  const result = await dispatchPendingAnnouncements({ client });
  return NextResponse.json({ ok: true, ...result });
}
