import { NextResponse } from "next/server";

// Scheduled jobs that are not built yet. Each one answers with what it is, so
// a run log shows "stub, did nothing" and not a success that processed 0.
// `schedule` must match vercel.json; a test checks it.

export const CRON_STUBS = {
  "recipes/analyse": {
    schedule: "0 8 * * *",
    message: "Not built yet. Recipes are not analysed. This run did nothing.",
  },
  "manuals/generate": {
    schedule: "30 8 * * *",
    message: "Not built yet. Manuals are not generated. This run did nothing.",
  },
} as const;

export type CronStubJob = keyof typeof CRON_STUBS;

export function cronStubResponse(job: CronStubJob): NextResponse {
  const { schedule, message } = CRON_STUBS[job];
  return NextResponse.json({
    ok: true,
    job,
    status: "stub",
    scheduled: schedule,
    message,
  });
}
