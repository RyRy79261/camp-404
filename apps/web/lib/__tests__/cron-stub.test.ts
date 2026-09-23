import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every scheduled job exists, every job is scheduled on purpose, and a job
// that is not built yet says so instead of reporting success.

vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn(() => null) }));
vi.mock("@/lib/telegram", () => ({
  getTelegramClient: vi.fn(() => {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }),
}));
vi.mock("@camp404/telegram", () => ({ dispatchPendingAnnouncements: vi.fn() }));

import { CRON_STUBS, type CronStubJob } from "@/lib/cron-stub";
import { SCHEDULED_JOBS } from "@/lib/cron-schedule";
import { GET as manualsGenerate } from "@/app/api/cron/manuals/generate/route";
import { GET as recipesAnalyse } from "@/app/api/cron/recipes/analyse/route";
import { GET as telegramDispatch } from "@/app/api/cron/telegram/dispatch/route";
import { dispatchPendingAnnouncements } from "@camp404/telegram";

const WEB_ROOT = path.resolve(__dirname, "../..");
const CRON_DIR = path.join(WEB_ROOT, "app/api/cron");

const vercel = JSON.parse(
  readFileSync(path.join(WEB_ROOT, "vercel.json"), "utf8"),
) as { crons: { path: string; schedule: string }[] };

/** `notifications/push` for every route.ts under app/api/cron. */
function cronJobs(dir = CRON_DIR, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const job = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return [
      ...(existsSync(path.join(full, "route.ts")) ? [job] : []),
      ...cronJobs(full, job),
    ];
  });
}

/** Built but deliberately not scheduled. Telegram is off (DEFERRED.md). */
const UNSCHEDULED = ["telegram/dispatch"];

const req = (job: string) => new Request(`https://camp.test/api/cron/${job}`);

describe("the cron schedule", () => {
  it("points only at jobs that exist", () => {
    const jobs = new Set(cronJobs());
    expect(jobs.size).toBeGreaterThan(0);
    for (const cron of vercel.crons) {
      expect(jobs.has(cron.path.replace("/api/cron/", ""))).toBe(true);
    }
  });

  it("schedules every job except the ones left off on purpose", () => {
    const scheduled = vercel.crons.map((c) => c.path.replace("/api/cron/", ""));
    expect(
      cronJobs()
        .filter((job) => !scheduled.includes(job))
        .sort(),
    ).toEqual([...UNSCHEDULED].sort());
  });

  // The System status page lists SCHEDULED_JOBS, not vercel.json, so the two
  // must be the same list: same paths, same times, same order.
  it("matches the list the System status page shows, job for job", () => {
    expect(
      SCHEDULED_JOBS.map((j) => ({
        path: `/api/cron/${j.job}`,
        schedule: j.schedule,
      })),
    ).toEqual(vercel.crons.map(({ path, schedule }) => ({ path, schedule })));
  });

  it("lists each stub at the schedule vercel.json runs it on", () => {
    for (const [job, stub] of Object.entries(CRON_STUBS)) {
      expect(
        vercel.crons.find((c) => c.path === `/api/cron/${job}`)?.schedule,
      ).toBe(stub.schedule);
    }
  });
});

describe("a job that is not built yet", () => {
  const routes: Record<CronStubJob, (r: Request) => Promise<Response>> = {
    "manuals/generate": manualsGenerate,
    "recipes/analyse": recipesAnalyse,
  };

  for (const [job, GET] of Object.entries(routes)) {
    it(`${job} says it is a stub`, async () => {
      const res = await GET(req(job));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        job,
        status: "stub",
        scheduled: CRON_STUBS[job as CronStubJob].schedule,
        message: CRON_STUBS[job as CronStubJob].message,
      });
    });
  }
});

describe("telegram/dispatch while Telegram is off", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says it is not configured and sends nothing", async () => {
    const res = await telegramDispatch(req("telegram/dispatch"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      job: "telegram/dispatch",
      status: "not_configured",
      scheduled: false,
    });
    expect(dispatchPendingAnnouncements).not.toHaveBeenCalled();
  });
});
