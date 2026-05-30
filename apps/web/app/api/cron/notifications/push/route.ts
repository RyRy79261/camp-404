import { NextResponse } from "next/server";
import { drainQueuedPush } from "@camp404/db/push";
import { sendPush } from "@/lib/firebase-admin";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Drains queued push/both notification_deliveries to FCM via firebase-admin.
// Idempotent (status claimed off 'queued' inside a transaction); scheduled
// daily after the in-app dispatch cron so there are deliveries to drain.
// Requires Firebase config — without it sendPush throws and we return 503.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  try {
    const result = await drainQueuedPush(sendPush);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "push drain failed",
      },
      { status: 503 },
    );
  }
}
