import { NextResponse } from "next/server";
import { redactSecrets } from "@camp404/core";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Daily deadline nudge (vercel.json: 09:00 UTC, 11:00 in camp time). Every
// open questionnaire send due within the next 48 hours reminds the members
// still pending, with the same 24-hour dedup as a captain's manual reminder.
// The deliveries it writes go out through the push drain like any other.
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  try {
    const result = await remindDueSoon();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: redactSecrets(
          err instanceof Error ? err.message : "reminders failed",
          process.env,
        ),
      },
      { status: 500 },
    );
  }
}
