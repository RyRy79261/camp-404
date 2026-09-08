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
    // `failed` is terminal: the drain flips those rows off 'queued', so no
    // later run retries them and the recipient never gets the push. A 200
    // makes `{ok:true, sent:0, failed:12}` indistinguishable from a healthy
    // run on the cron dashboard, so derive `ok` from `failed` and answer
    // non-2xx. Safe to 500 — the drain claims every row it touched before
    // returning, so a scheduler retry re-sends nothing.
    const ok = result.failed === 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
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
