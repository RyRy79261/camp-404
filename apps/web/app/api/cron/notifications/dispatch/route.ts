import { NextResponse } from "next/server";
import { redactSecrets } from "@camp404/core";
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
  try {
    const result = await dispatchDueBroadcasts();
    // A failed broadcast is not lost: its claim rolled back, so the next run
    // tries it again. The run still answers 500, so the cron dashboard shows
    // that something did not go out on time.
    const ok = result.failures.length === 0;
    return NextResponse.json(
      {
        ok,
        dispatched: result.dispatched,
        deliveries: result.deliveries,
        failures: result.failures.map((f) => ({
          broadcastId: f.broadcastId,
          error: redactSecrets(f.error, process.env),
        })),
      },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: redactSecrets(
          err instanceof Error ? err.message : "dispatch failed",
          process.env,
        ),
      },
      { status: 503 },
    );
  }
}
