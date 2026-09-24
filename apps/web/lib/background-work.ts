import "server-only";

import { after } from "next/server";
import { CAMP_TIME_ZONE, redactSecrets } from "@camp404/core";
import { dispatchDueBroadcasts } from "@camp404/db/broadcasts";
import { drainQueuedEmail } from "@camp404/db/email";
import {
  backfillIdEncryption,
  listLiveAuthUserIds,
} from "@camp404/db/maintenance";
import { drainQueuedPush } from "@camp404/db/push";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";
import { consumeRateLimit } from "@camp404/db/rate-limit";
import { remindTaskDeadlines } from "@camp404/db/tasks";
import { sweepOrphanAvatarBlobs } from "./avatar-blob";
import { isEmailConfigured, sendEmail } from "./email";
import { sendPush } from "./firebase-admin";
import { firebaseAdminCredentials } from "./integration-config";
import { SITE_URL } from "./site";
import { isE2ETestMode } from "./test-mode";

// Work that used to run on a schedule, now run by people using the app. The
// camp is on Vercel's free plan, so nothing may depend on a cron job (owner,
// 2026-09-24: "no cron jobs in there").
//
// Two triggers, both in next/server `after()`, so nobody waits on them:
//
//  - At the action. A captain who publishes an announcement, sends or reminds
//    a questionnaire, asks a member to become captain, approves a member or
//    moves the camp to a new year calls `deliverAfterResponse()`: the notices
//    that write fan out, and push and email go out, right then.
//  - On a page load. Any signed-in member loading a console page calls
//    `runDueWorkAfterResponse()`, which does what is due: a scheduled
//    announcement whose time has come, deadline reminders, a retry of anything
//    left queued, and the upkeep. A row in `action_rate_limit` (one statement,
//    compare-and-set on the database clock) lets it run at most once per
//    DUE_WORK_EVERY_MS across every server, and the upkeep once per
//    MAINTENANCE_EVERY_MS.
//
// Every step is idempotent, and one failing step does not stop the others; a
// failure is logged with secrets scrubbed. Under E2E test mode none of it runs:
// the in-memory store has no queue, and the real-database run must not have
// reminders appear in its inboxes on their own.

/** How often a page load may run the due work, across all servers. */
export const DUE_WORK_EVERY_MS = 5 * 60 * 1000;
/** How often the upkeep (ID encryption, orphan photos) runs. */
export const MAINTENANCE_EVERY_MS = 24 * 60 * 60 * 1000;
/**
 * Reminders go out only in camp daytime, so a member loading a page at 02:00
 * does not buzz everyone else's phone. The old cron ran at 11:00 camp time.
 */
export const REMINDER_HOURS = { from: 9, until: 21 } as const;

export const DUE_WORK_KEY = "background:due-work";
export const MAINTENANCE_KEY = "background:maintenance";

/**
 * A server checks the database guard at most once a minute, so a busy page
 * costs no write per view. The database row is still the one that decides.
 */
const LOCAL_CHECK_EVERY_MS = 60 * 1000;
let lastLocalCheck = 0;

/** Tests only: forget this server's last check. */
export function resetLocalCheckForTests(): void {
  lastLocalCheck = 0;
}

const CAMP_HOUR = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: CAMP_TIME_ZONE,
});

/** Whether `now` is inside the camp's reminder hours. */
export function isReminderHour(now: Date): boolean {
  const hour = Number(CAMP_HOUR.format(now));
  return hour >= REMINDER_HOURS.from && hour < REMINDER_HOURS.until;
}

function logFailure(step: string, err: unknown): void {
  const text = err instanceof Error ? err.message : String(err);
  console.error(
    `[background] ${step} failed: ${redactSecrets(text, process.env)}`,
  );
}

/** Run one step; a throw is logged and reported as false. */
async function step(
  name: string,
  fn: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    logFailure(name, err);
    return false;
  }
}

/**
 * Deliver what is due now: fan out every published announcement whose time
 * has come, then send queued push and email. Push and email are skipped while
 * their service is not set up, so their rows stay queued until it is.
 */
export async function deliverDue(): Promise<void> {
  await step("announcement fan-out", async () => {
    const result = await dispatchDueBroadcasts();
    for (const f of result.failures) {
      logFailure(`announcement ${f.broadcastId}`, new Error(f.error));
    }
  });
  if (firebaseAdminCredentials(process.env)) {
    await step("push", () => drainQueuedPush(sendPush));
  }
  if (isEmailConfigured()) {
    await step("email", () =>
      drainQueuedEmail(sendEmail, { siteUrl: SITE_URL }),
    );
  }
}

/** Whether this call wins the guard for `key`: once per window, across servers. */
async function claim(key: string, windowMs: number): Promise<boolean> {
  const verdict = await consumeRateLimit({ key, limit: 1, windowMs });
  // null: the database could not be reached, so do nothing this time.
  return verdict?.ok === true;
}

/**
 * The upkeep that used to be the daily maintenance cron: encrypt any ID number
 * still stored as plain text, and on the production deployment only, delete
 * photos whose owner has no camp account. A preview's database is a copy that
 * can miss recent members, whose photos share the same store.
 */
export async function runMaintenance(): Promise<void> {
  await step("ID encryption", () => backfillIdEncryption());
  if (process.env.VERCEL_ENV === "production") {
    await step("orphan photos", async () => {
      const result = await sweepOrphanAvatarBlobs(await listLiveAuthUserIds());
      if (result.status === "refused") throw new Error(result.message);
    });
  }
}

export type DueWorkOutcome = "ran" | "not_due";

/**
 * Everything that is due, at most once per DUE_WORK_EVERY_MS across every
 * server: deadline reminders (in camp daytime), then delivery, then the upkeep
 * once a day.
 */
export async function runDueWork(
  now: Date = new Date(),
): Promise<DueWorkOutcome> {
  if (now.getTime() - lastLocalCheck < LOCAL_CHECK_EVERY_MS) return "not_due";
  lastLocalCheck = now.getTime();
  if (!(await claim(DUE_WORK_KEY, DUE_WORK_EVERY_MS))) return "not_due";

  if (isReminderHour(now)) {
    // Questionnaires due within 48 hours (24-hour dedup per member), and the
    // task deadline nudges (deduped in task_deadline_reminders).
    await step("questionnaire reminders", () => remindDueSoon({ now }));
    await step("task reminders", () => remindTaskDeadlines({ now }));
  }
  await deliverDue();
  if (await claim(MAINTENANCE_KEY, MAINTENANCE_EVERY_MS)) {
    await runMaintenance();
  }
  return "ran";
}

/** After this response: deliver the notices the action just wrote. */
export function deliverAfterResponse(): void {
  if (isE2ETestMode()) return;
  after(() => deliverDue());
}

/** After this response: run whatever is due (guarded; see runDueWork). */
export function runDueWorkAfterResponse(): void {
  if (isE2ETestMode()) return;
  after(async () => {
    await step("due work", () => runDueWork());
  });
}
