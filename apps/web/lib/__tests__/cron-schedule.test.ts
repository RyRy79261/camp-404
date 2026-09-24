import { describe, expect, it } from "vitest";
import { dailyTimeLabel, isJobBuilt, SCHEDULED_JOBS } from "../cron-schedule";
import { CRON_STUBS } from "../cron-stub";

// The page's words for the schedule. That the list matches vercel.json is
// checked in cron-stub.test.ts, next to the other schedule checks.

describe("dailyTimeLabel", () => {
  it("reads a once-a-day schedule as a UTC time", () => {
    expect(dailyTimeLabel("30 7 * * *")).toBe("Daily at 07:30 UTC");
    expect(dailyTimeLabel("0 8 * * *")).toBe("Daily at 08:00 UTC");
    expect(dailyTimeLabel("35 9 * * *")).toBe("Daily at 09:35 UTC");
    expect(dailyTimeLabel("59 23 * * *")).toBe("Daily at 23:59 UTC");
  });

  it("refuses any other shape rather than describe it wrongly", () => {
    for (const schedule of [
      "*/5 * * * *",
      "0 9 * * 1",
      "0 9 1 * *",
      "0 24 * * *",
      "60 9 * * *",
      "30 7 * *",
      "",
    ]) {
      expect(() => dailyTimeLabel(schedule)).toThrow();
    }
  });

  it("describes every scheduled job", () => {
    for (const job of SCHEDULED_JOBS) {
      expect(dailyTimeLabel(job.schedule)).toMatch(/^Daily at \d\d:\d\d UTC$/);
    }
  });
});

describe("isJobBuilt", () => {
  it("marks each stub as not built, and every other job as built", () => {
    const stubs = Object.keys(CRON_STUBS);
    expect(stubs.length).toBeGreaterThan(0);
    for (const job of SCHEDULED_JOBS) {
      expect(isJobBuilt(job.job)).toBe(!stubs.includes(job.job));
    }
    expect(
      SCHEDULED_JOBS.filter((j) => !isJobBuilt(j.job)).map((j) => j.job),
    ).toEqual(["recipes/analyse", "manuals/generate"]);
  });

  it("does not mistake an inherited key for a stub", () => {
    expect(isJobBuilt("toString")).toBe(true);
  });
});
