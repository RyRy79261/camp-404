import { NextResponse } from "next/server";
import { dispatchDueBroadcasts } from "@camp404/db/broadcasts";

export const runtime = "nodejs";

// Scheduled fan-out worker: materialises notification_deliveries for broadcasts
// whose `send_at` has arrived (or is immediate) but that haven't been
// dispatched yet. Idempotent — the (broadcast_id, user_id) dedupe index plus
// the `dispatched_at` claim guard against double-delivery. Immediate camp-wide
// announcements still fan out inline at publish time; this drains the deferred
// / scheduled tail produced by the gating + scoped-broadcast work.
//
// NOTE: inline auth check matches the other cron routes on `main`; switch to
// `lib/cron-auth.assertCron` once the auth-hardening PR (#38) lands.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await dispatchDueBroadcasts();
  return NextResponse.json({ ok: true, ...result });
}
