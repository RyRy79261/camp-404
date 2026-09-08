import { beforeEach, describe, expect, it, vi } from "vitest";

// The drain's `failed` count is the only signal that a push reached nobody —
// those rows are claimed off 'queued' and never retried, so the recipient
// permanently misses the notification. These tests pin the HTTP STATUS, not
// just the body: the status is what the cron dashboard reads, and a green 200
// on a fully-failed run was the defect.
//
// Runs under the suite's default jsdom environment: NextResponse resolves the
// Node Response/Headers globals fine there, and a per-file environment
// docblock can't currently opt this file into the node environment because
// tests/vitest-setup.ts touches HTMLCanvasElement unguarded. Mocking
// @/lib/firebase-admin also keeps its top-level `import "server-only"` from
// executing.

vi.mock("@camp404/db/push", () => ({ drainQueuedPush: vi.fn() }));
vi.mock("@/lib/firebase-admin", () => ({ sendPush: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn(() => null) }));

import { GET } from "./route";
import { drainQueuedPush } from "@camp404/db/push";
import { assertCron } from "@/lib/cron-auth";

const req = () => new Request("https://camp.test/api/cron/notifications/push");

describe("GET /api/cron/notifications/push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCron).mockReturnValue(null);
  });

  it("reports 200 ok:true when no delivery failed", async () => {
    // Guards against over-correcting: `skipped` (no registered tokens) and
    // `pruned` (dead tokens removed) are healthy outcomes, not failures.
    vi.mocked(drainQueuedPush).mockResolvedValue({
      sent: 3,
      failed: 0,
      skipped: 1,
      pruned: 2,
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sent: 3,
      failed: 0,
      skipped: 1,
      pruned: 2,
    });
  });

  it("refuses to report a fully-failed run as healthy (500, ok:false)", async () => {
    // THE LOAD-BEARING CASE: this exact body used to come back as HTTP 200.
    vi.mocked(drainQueuedPush).mockResolvedValue({
      sent: 0,
      failed: 12,
      skipped: 0,
      pruned: 0,
    });

    const res = await GET(req());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false, failed: 12 });
  });

  it("refuses a green run on a PARTIAL failure, and keeps the counts diagnosable", async () => {
    vi.mocked(drainQueuedPush).mockResolvedValue({
      sent: 9,
      failed: 1,
      skipped: 2,
      pruned: 3,
    });

    const res = await GET(req());

    expect(res.status).toBe(500);
    // The full count object still comes back, so an operator can tell 1-of-10
    // from 12-of-12 without re-running the drain.
    await expect(res.json()).resolves.toEqual({
      ok: false,
      sent: 9,
      failed: 1,
      skipped: 2,
      pruned: 3,
    });
  });

  it("keeps 503 for an unconfigured / throwing send layer", async () => {
    // Distinct from the new 500: "Firebase isn't set up" and "Firebase is set
    // up and sends are failing" are different operator actions.
    vi.mocked(drainQueuedPush).mockRejectedValue(
      new Error("Firebase admin is not configured"),
    );

    const res = await GET(req());

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("never runs the drain for an unauthorized request", async () => {
    // THE REFUSED CASE: the status logic sits strictly behind the cron guard,
    // so queue state cannot be probed without CRON_SECRET.
    vi.mocked(assertCron).mockReturnValue(
      new Response("Unauthorized", { status: 401 }) as never,
    );

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(drainQueuedPush).not.toHaveBeenCalled();
  });
});
