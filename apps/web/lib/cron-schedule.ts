import { CRON_STUBS } from "./cron-stub";

// The seven scheduled jobs, in the order apps/web/vercel.json lists them, for
// the captain System status page. vercel.json is what Vercel actually runs;
// this is the same list with a name and a sentence each, so a captain can read
// it. __tests__/cron-stub.test.ts checks it against vercel.json, path by path
// and time by time, so the page cannot drift from the schedule.
//
// Pure: no `server-only`, no file reads at runtime.

export interface ScheduledJob {
  /** The route under /api/cron/. */
  job: string;
  /** The cron expression vercel.json runs it on (UTC). */
  schedule: string;
  label: string;
  /** One plain sentence of what a run does. */
  what: string;
}

export const SCHEDULED_JOBS = [
  {
    job: "maintenance",
    schedule: "30 7 * * *",
    label: "Daily maintenance",
    what: "Encrypts any ID number still stored as plain text, and on the live site deletes profile photos and image answers whose owner has no camp account.",
  },
  {
    job: "recipes/analyse",
    schedule: "0 8 * * *",
    label: "Recipe analysis",
    what: "Meant to analyse the camp's recipes. It is not built yet, so a run does nothing.",
  },
  {
    job: "manuals/generate",
    schedule: "30 8 * * *",
    label: "Manual writing",
    what: "Meant to write the camp's manuals. It is not built yet, so a run does nothing.",
  },
  {
    job: "notifications/reminders",
    schedule: "0 9 * * *",
    label: "Reminders",
    what: "Reminds members who still owe a questionnaire that is due within the next 48 hours.",
  },
  {
    job: "notifications/dispatch",
    schedule: "15 9 * * *",
    label: "Notice delivery",
    what: "Delivers scheduled announcements whose send time has arrived to each recipient's inbox.",
  },
  {
    job: "notifications/push",
    schedule: "25 9 * * *",
    label: "Push notifications",
    what: "Sends queued notices to the phones and browsers that have push turned on.",
  },
  {
    job: "notifications/email",
    schedule: "35 9 * * *",
    label: "Email notices",
    what: "Emails the notices that must not be missed, through Resend.",
  },
] as const satisfies readonly ScheduledJob[];

export type ScheduledJobPath = (typeof SCHEDULED_JOBS)[number]["job"];

/** Whether a job does real work, or is a stub from lib/cron-stub.ts. */
export function isJobBuilt(job: string): boolean {
  return !Object.hasOwn(CRON_STUBS, job);
}

const DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;

/**
 * "30 7 * * *" -> "Daily at 07:30 UTC". Only the once-a-day shape every job
 * uses today; anything else throws, so a new shape is described on purpose
 * rather than wrongly.
 */
export function dailyTimeLabel(schedule: string): string {
  const match = DAILY.exec(schedule);
  if (!match) {
    throw new Error(`Not a once-a-day cron schedule: "${schedule}"`);
  }
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) {
    throw new Error(`Not a valid time of day: "${schedule}"`);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Daily at ${pad(hour)}:${pad(minute)} UTC`;
}
