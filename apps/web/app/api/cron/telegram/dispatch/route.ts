import { NextResponse } from "next/server";
import { dispatchPendingAnnouncements } from "@camp404/telegram";
import { getTelegramClient } from "@/lib/telegram";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Drains the `telegram_announcements` queue. NOT yet registered in
// vercel.json — nothing enqueues announcements yet, and Vercel's daily-cron
// cap means this will need an inline send or a plan upgrade once the enqueue
// side ships. Until then it is only reachable via a manual authorized request.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;

  let client;
  try {
    client = getTelegramClient();
  } catch {
    // Telegram stays off until the owner turns it on (DEFERRED.md). Say so,
    // not a success that sent nothing.
    return NextResponse.json({
      ok: true,
      job: "telegram/dispatch",
      status: "not_configured",
      scheduled: false,
      message:
        "Telegram is off: the bot is not configured. This run did nothing.",
    });
  }

  const result = await dispatchPendingAnnouncements({ client });
  // Same terminal-failure rule as the push drain: markAnnouncementFailed puts
  // the row in 'failed' and listDueAnnouncements only reads 'queued', so a
  // failure is never retried and a 200 would bury it.
  const ok = result.failed === 0;
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
}
