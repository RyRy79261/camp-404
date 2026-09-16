import { NextResponse } from "next/server";
import { drainQueuedPush } from "@camp404/db/push";
import { redactSecrets } from "@camp404/core";
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
        // The failure is usually a Firebase/DB throw whose message can carry a
        // connection string or credential; scrub known secret values before it
        // goes into a response body (and from there, a log).
        error: redactSecrets(
          err instanceof Error ? err.message : "push drain failed",
          process.env,
        ),
      },
      { status: 503 },
    );
  }
}
