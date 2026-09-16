import { beforeEach, describe, expect, it, vi } from "vitest";

// The scheduled fan-out answers 500 when any broadcast failed, so the cron
// dashboard shows it, and never puts a secret in the body.

vi.mock("@camp404/db/broadcasts", () => ({ dispatchDueBroadcasts: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn(() => null) }));

import { GET } from "./route";
import { dispatchDueBroadcasts } from "@camp404/db/broadcasts";
import { assertCron } from "@/lib/cron-auth";

const req = () =>
  new Request("https://camp.test/api/cron/notifications/dispatch");

const SECRET_URL = "postgres://user:s3cr3t-pass@db.example/app";

describe("GET /api/cron/notifications/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCron).mockReturnValue(null);
  });

  it("runs nothing without the cron secret", async () => {
    vi.mocked(assertCron).mockReturnValue(
      new Response("Unauthorized", { status: 401 }) as never,
    );
    expect((await GET(req())).status).toBe(401);
    expect(dispatchDueBroadcasts).not.toHaveBeenCalled();
  });

  it("answers 200 when every broadcast went out", async () => {
    vi.mocked(dispatchDueBroadcasts).mockResolvedValue({
      dispatched: 2,
      deliveries: 9,
      failures: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 2,
      deliveries: 9,
      failures: [],
    });
  });

  it("answers 500 and names the failed broadcast, without a secret", async () => {
    process.env.DATABASE_URL = SECRET_URL;
    vi.mocked(dispatchDueBroadcasts).mockResolvedValue({
      dispatched: 1,
      deliveries: 4,
      failures: [{ broadcastId: "b-1", error: `lost ${SECRET_URL}` }],
    });
    try {
      const res = await GET(req());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        dispatched: 1,
        failures: [{ broadcastId: "b-1" }],
      });
      expect(JSON.stringify(body)).not.toContain("s3cr3t-pass");
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it("answers 503 without a secret when the run itself throws", async () => {
    process.env.DATABASE_URL = SECRET_URL;
    vi.mocked(dispatchDueBroadcasts).mockRejectedValue(
      new Error(`connect failed: ${SECRET_URL}`),
    );
    try {
      const res = await GET(req());
      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toContain("s3cr3t-pass");
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});
