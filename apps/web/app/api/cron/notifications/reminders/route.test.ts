import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn() }));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  remindDueSoon: vi.fn(),
}));
vi.mock("@camp404/db/tasks", () => ({
  remindTaskDeadlines: vi.fn(),
}));

import { GET } from "./route";
import { assertCron } from "@/lib/cron-auth";
import { remindDueSoon } from "@camp404/db/questionnaire-lifecycle";
import { remindTaskDeadlines } from "@camp404/db/tasks";

const request = () =>
  new Request("https://camp.test/api/cron/notifications/reminders");

const SECRET_URL = "postgres://user:s3cr3t-pass@db.example/app";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertCron).mockReturnValue(null);
  vi.mocked(remindDueSoon).mockResolvedValue({ activations: 2, reminded: 5 });
  vi.mocked(remindTaskDeadlines).mockResolvedValue({ tasks: 3, reminded: 1 });
});

describe("GET /api/cron/notifications/reminders", () => {
  it("runs nothing without the cron secret", async () => {
    vi.mocked(assertCron).mockReturnValue(
      new Response("Unauthorized", { status: 401 }) as never,
    );
    expect((await GET(request())).status).toBe(401);
    expect(remindDueSoon).not.toHaveBeenCalled();
    expect(remindTaskDeadlines).not.toHaveBeenCalled();
  });

  it("runs both jobs and reports what each sent", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(remindDueSoon).toHaveBeenCalledTimes(1);
    expect(remindTaskDeadlines).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      ok: true,
      activations: 2,
      reminded: 5,
      taskReminders: { tasks: 3, reminded: 1 },
    });
  });

  it("answers 500 without leaking a secret from the error", async () => {
    process.env.DATABASE_URL = SECRET_URL;
    vi.mocked(remindDueSoon).mockRejectedValue(
      new Error(`connect failed: ${SECRET_URL}`),
    );
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("s3cr3t-pass");
    delete process.env.DATABASE_URL;
  });

  it("still runs the task reminders when the questionnaire job fails, and says so", async () => {
    vi.mocked(remindDueSoon).mockRejectedValue(new Error("boom"));
    const res = await GET(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      taskReminders: { tasks: 3, reminded: 1 },
    });
    expect(body.error).toMatch(/questionnaire reminders: boom/);
    expect(body).not.toHaveProperty("activations");
  });

  it("answers 500 when the task job fails, carrying the questionnaire report and no secret", async () => {
    process.env.DATABASE_URL = SECRET_URL;
    vi.mocked(remindTaskDeadlines).mockRejectedValue(
      new Error(`connect failed: ${SECRET_URL}`),
    );
    const res = await GET(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, activations: 2, reminded: 5 });
    expect(body).not.toHaveProperty("taskReminders");
    expect(body.error).toMatch(/^task reminders:/);
    expect(JSON.stringify(body)).not.toContain("s3cr3t-pass");
    delete process.env.DATABASE_URL;
  });
});
