import { NextResponse } from "next/server";
import { dispatchDueBroadcasts } from "@camp404/db/broadcasts";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Scheduled fan-out worker: materialises notification_deliveries for broadcasts
// whose `send_at` has arrived (or is immediate) but that haven't been
// dispatched yet. Idempotent — the (broadcast_id, user_id) dedupe index plus
// the `dispatched_at` claim guard against double-delivery. Immediate camp-wide
// announcements still fan out inline at publish time; this drains the deferred
// / scheduled tail produced by the gating + scoped-broadcast work.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  const result = await dispatchDueBroadcasts();
  return NextResponse.json({ ok: true, ...result });
}
