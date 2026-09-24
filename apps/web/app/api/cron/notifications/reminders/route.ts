import { NextResponse } from "next/server";
import { redactSecrets } from "@camp404/core";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";
import { remindTaskDeadlines } from "@camp404/db/tasks";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Daily deadline nudges (vercel.json: 09:00 UTC, which is 11:00 in camp time).
// Two jobs, run side by side:
//  - questionnaires: every open send due within the next 48 hours reminds the
//    members still pending, with the same 24-hour dedup as a captain's manual
//    reminder;
//  - tasks: the person responsible for an open or in-progress task hears about
//    it the camp day before it is due and on the day, once each (deduped in
//    task_deadline_reminders).
// The deliveries they write go out through the push and email drains like any
// other. One job failing does not stop the other: the run answers 500 with the
// error and whatever the other job reported, so the cron dashboard stays
// honest about both.
function message(label: string, reason: unknown): string {
  const text = reason instanceof Error ? reason.message : `${label} failed`;
  return `${label}: ${redactSecrets(text, process.env)}`;
}

export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  const [questionnaires, tasks] = await Promise.allSettled([
    remindDueSoon(),
    remindTaskDeadlines(),
  ]);
  const report = {
    ...(questionnaires.status === "fulfilled" ? questionnaires.value : {}),
    ...(tasks.status === "fulfilled" ? { taskReminders: tasks.value } : {}),
  };
  const errors = [
    questionnaires.status === "rejected"
      ? message("questionnaire reminders", questionnaires.reason)
      : null,
    tasks.status === "rejected"
      ? message("task reminders", tasks.reason)
      : null,
  ].filter((e): e is string => e !== null);
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, error: errors.join("; "), ...report },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ...report });
}
