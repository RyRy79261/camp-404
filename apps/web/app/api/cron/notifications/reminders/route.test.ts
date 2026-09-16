import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn() }));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  remindDueSoon: vi.fn(),
}));

import { GET } from "./route";
import { assertCron } from "@/lib/cron-auth";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";

const request = () =>
  new Request("https://camp.test/api/cron/notifications/reminders");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertCron).mockReturnValue(null);
});

describe("GET /api/cron/notifications/reminders", () => {
  it("runs nothing without the cron secret", async () => {
    vi.mocked(assertCron).mockReturnValue(
      new Response("Unauthorized", { status: 401 }) as never,
    );
    expect((await GET(request())).status).toBe(401);
    expect(remindDueSoon).not.toHaveBeenCalled();
  });

  it("reports what it sent", async () => {
    vi.mocked(remindDueSoon).mockResolvedValue({ activations: 2, reminded: 5 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, activations: 2, reminded: 5 });
  });

  it("answers 500 without leaking a secret from the error", async () => {
    process.env.DATABASE_URL = "postgres://user:s3cr3t-pass@db.example/app";
    vi.mocked(remindDueSoon).mockRejectedValue(
      new Error("connect failed: postgres://user:s3cr3t-pass@db.example/app"),
    );
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("s3cr3t-pass");
    delete process.env.DATABASE_URL;
  });
});
