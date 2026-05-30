import { NextResponse } from "next/server";
import { dispatchPendingAnnouncements } from "@camp404/telegram";
import { getTelegramClient } from "@/lib/telegram";

export const runtime = "nodejs";

// Drains the `telegram_announcements` queue. NOT yet registered in
// vercel.json — nothing enqueues announcements yet, and Vercel's daily-cron
// cap means this will need an inline send or a plan upgrade once the enqueue
// side ships. Until then it is only reachable via a manual authorized request.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

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
