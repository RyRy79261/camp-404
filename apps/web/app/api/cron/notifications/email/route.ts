import { NextResponse } from "next/server";
import { drainQueuedEmail } from "@camp404/db/email";
import { redactSecrets } from "@camp404/core";
import { assertCron } from "@/lib/cron-auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

// Emails the notices that must not be missed (see shouldEmailNotification),
// through Resend, one recipient at a time. Scheduled daily after the in-app
// dispatch. Without Resend config it answers 503 and touches nothing, so the
// queue waits until email is turned on.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Email is not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL.",
      },
      { status: 503 },
    );
  }
  try {
    const result = await drainQueuedEmail(sendEmail, { siteUrl: SITE_URL });
    // A failed email is terminal (not retried), so a run with failures is not
    // a healthy run on the cron dashboard.
    const ok = result.failed === 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: redactSecrets(
          err instanceof Error ? err.message : "email drain failed",
          process.env,
        ),
      },
      { status: 503 },
    );
  }
}
