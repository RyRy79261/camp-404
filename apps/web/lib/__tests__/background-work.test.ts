import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The work that used to run on a schedule: at the action and on page load,
// guarded, each step on its own, and never under E2E test mode.

vi.mock("server-only", () => ({}));
const afterSpy = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterSpy }));
vi.mock("@camp404/db/broadcasts", () => ({ dispatchDueBroadcasts: vi.fn() }));
vi.mock("@camp404/db/email", () => ({ drainQueuedEmail: vi.fn() }));
vi.mock("@camp404/db/push", () => ({ drainQueuedPush: vi.fn() }));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  remindDueSoon: vi.fn(),
}));
vi.mock("@camp404/db/tasks", () => ({ remindTaskDeadlines: vi.fn() }));
vi.mock("@camp404/db/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@camp404/db/maintenance", () => ({
  backfillIdEncryption: vi.fn(),
  listLiveAuthUserIds: vi.fn(),
}));
vi.mock("@/lib/avatar-blob", () => ({ sweepOrphanAvatarBlobs: vi.fn() }));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/firebase-admin", () => ({ sendPush: vi.fn() }));
vi.mock("@/lib/integration-config", () => ({
  firebaseAdminCredentials: vi.fn(),
}));

import {
  DUE_WORK_EVERY_MS,
  DUE_WORK_KEY,
  MAINTENANCE_EVERY_MS,
  MAINTENANCE_KEY,
  deliverAfterResponse,
  deliverDue,
  isReminderHour,
  resetLocalCheckForTests,
  runDueWork,
  runDueWorkAfterResponse,
} from "@/lib/background-work";
import { dispatchDueBroadcasts } from "@camp404/db/broadcasts";
import { drainQueuedEmail } from "@camp404/db/email";
import { drainQueuedPush } from "@camp404/db/push";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";
import { remindTaskDeadlines } from "@camp404/db/tasks";
import { consumeRateLimit } from "@camp404/db/rate-limit";
import {
  backfillIdEncryption,
  listLiveAuthUserIds,
} from "@camp404/db/maintenance";
import { sweepOrphanAvatarBlobs } from "@/lib/avatar-blob";
import { isEmailConfigured } from "@/lib/email";
import { firebaseAdminCredentials } from "@/lib/integration-config";

// 12:00 in camp (UTC+2), inside reminder hours; 02:00 in camp, outside.
const NOON = new Date("2026-09-24T10:00:00Z");
const NIGHT = new Date("2026-09-24T00:00:00Z");
const ALLOW = { ok: true, retryAfterSeconds: 0 };
const DENY = { ok: false, retryAfterSeconds: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  resetLocalCheckForTests();
  vi.mocked(dispatchDueBroadcasts).mockResolvedValue({
    dispatched: 0,
    deliveries: 0,
    failures: [],
  });
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOW);
  vi.mocked(firebaseAdminCredentials).mockReturnValue({} as never);
  vi.mocked(isEmailConfigured).mockReturnValue(true);
  vi.mocked(listLiveAuthUserIds).mockResolvedValue(new Set(["auth-1"]));
  vi.mocked(sweepOrphanAvatarBlobs).mockResolvedValue({
    status: "swept",
    folders: 0,
    deleted: 0,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.E2E_TEST_MODE;
});

describe("deliverDue", () => {
  it("fans out, then sends push and email", async () => {
    await deliverDue();
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    expect(drainQueuedPush).toHaveBeenCalledOnce();
    expect(drainQueuedEmail).toHaveBeenCalledOnce();
  });

  it("leaves push and email queued while their service is not set up", async () => {
    vi.mocked(firebaseAdminCredentials).mockReturnValue(null);
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    await deliverDue();
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    expect(drainQueuedPush).not.toHaveBeenCalled();
    expect(drainQueuedEmail).not.toHaveBeenCalled();
  });

  it("still sends push and email when the fan-out throws", async () => {
    vi.mocked(dispatchDueBroadcasts).mockRejectedValue(new Error("db down"));
    await deliverDue();
    expect(drainQueuedPush).toHaveBeenCalledOnce();
    expect(drainQueuedEmail).toHaveBeenCalledOnce();
  });
});

describe("runDueWork", () => {
  it("claims the guard, reminds, delivers and runs the upkeep", async () => {
    expect(await runDueWork(NOON)).toBe("ran");
    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: DUE_WORK_KEY,
      limit: 1,
      windowMs: DUE_WORK_EVERY_MS,
    });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: MAINTENANCE_KEY,
      limit: 1,
      windowMs: MAINTENANCE_EVERY_MS,
    });
    expect(remindDueSoon).toHaveBeenCalledWith({ now: NOON });
    expect(remindTaskDeadlines).toHaveBeenCalledWith({ now: NOON });
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    expect(backfillIdEncryption).toHaveBeenCalledOnce();
  });

  it("does nothing when another server ran it inside the window", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue(DENY);
    expect(await runDueWork(NOON)).toBe("not_due");
    expect(remindDueSoon).not.toHaveBeenCalled();
    expect(dispatchDueBroadcasts).not.toHaveBeenCalled();
  });

  it("does nothing when the guard cannot be stored", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue(null);
    expect(await runDueWork(NOON)).toBe("not_due");
    expect(dispatchDueBroadcasts).not.toHaveBeenCalled();
  });

  it("asks the database at most once a minute from one server", async () => {
    await runDueWork(NOON);
    await runDueWork(new Date(NOON.getTime() + 30_000));
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    await runDueWork(new Date(NOON.getTime() + 61_000));
    expect(dispatchDueBroadcasts).toHaveBeenCalledTimes(2);
  });

  it("sends no reminders at night, but still delivers", async () => {
    await runDueWork(NIGHT);
    expect(remindDueSoon).not.toHaveBeenCalled();
    expect(remindTaskDeadlines).not.toHaveBeenCalled();
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
  });

  it("skips the upkeep when it already ran today", async () => {
    vi.mocked(consumeRateLimit).mockImplementation(async ({ key }) =>
      key === MAINTENANCE_KEY ? DENY : ALLOW,
    );
    await runDueWork(NOON);
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    expect(backfillIdEncryption).not.toHaveBeenCalled();
  });

  it("sweeps orphan photos on production only", async () => {
    await runDueWork(NOON);
    expect(sweepOrphanAvatarBlobs).not.toHaveBeenCalled();

    resetLocalCheckForTests();
    process.env.VERCEL_ENV = "production";
    await runDueWork(NOON);
    expect(sweepOrphanAvatarBlobs).toHaveBeenCalledWith(new Set(["auth-1"]));
  });

  it("keeps going when one reminder job throws", async () => {
    vi.mocked(remindDueSoon).mockRejectedValue(new Error("boom"));
    await runDueWork(NOON);
    expect(remindTaskDeadlines).toHaveBeenCalledOnce();
    expect(dispatchDueBroadcasts).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("isReminderHour", () => {
  it("is camp daytime, 09:00 up to 21:00 in Johannesburg", () => {
    expect(isReminderHour(new Date("2026-09-24T06:59:00Z"))).toBe(false);
    expect(isReminderHour(new Date("2026-09-24T07:00:00Z"))).toBe(true);
    expect(isReminderHour(new Date("2026-09-24T18:59:00Z"))).toBe(true);
    expect(isReminderHour(new Date("2026-09-24T19:00:00Z"))).toBe(false);
  });
});

describe("the after-response triggers", () => {
  it("queue their work after the response", () => {
    deliverAfterResponse();
    runDueWorkAfterResponse();
    expect(afterSpy).toHaveBeenCalledTimes(2);
  });

  it("do nothing under E2E test mode", () => {
    process.env.E2E_TEST_MODE = "1";
    deliverAfterResponse();
    runDueWorkAfterResponse();
    expect(afterSpy).not.toHaveBeenCalled();
  });
});

describe("the System status page's list", () => {
  it("names the reminder hours and the five-minute guard the code uses", async () => {
    const { BACKGROUND_JOBS } = await import("@/lib/background-jobs");
    const { REMINDER_HOURS } = await import("@/lib/background-work");
    const pad = (n: number) => String(n).padStart(2, "0");
    const reminders = BACKGROUND_JOBS.find((j) => j.label === "Reminders");
    expect(reminders?.when).toContain(
      `${pad(REMINDER_HOURS.from)}:00–${pad(REMINDER_HOURS.until)}:00`,
    );
    // The page's description says "at most once every five minutes".
    expect(DUE_WORK_EVERY_MS).toBe(5 * 60 * 1000);
  });
});
