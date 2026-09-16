import { beforeEach, describe, expect, it, vi } from "vitest";

// The email cron: refuses without the cron secret, does nothing without Resend
// config, and reports failures as a non-2xx so the dashboard shows them.

vi.mock("@camp404/db/email", () => ({ drainQueuedEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn(() => null) }));

import { NextResponse } from "next/server";
import { GET } from "./route";
import { drainQueuedEmail } from "@camp404/db/email";
import { assertCron } from "@/lib/cron-auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";

const req = () => new Request("https://camp.test/api/cron/notifications/email");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertCron).mockReturnValue(null);
  vi.mocked(isEmailConfigured).mockReturnValue(true);
});

describe("GET /api/cron/notifications/email", () => {
  it("drains with the Resend sender and the site's own links", async () => {
    vi.mocked(drainQueuedEmail).mockResolvedValue({
      sent: 2,
      failed: 0,
      skipped: 1,
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      sent: 2,
      failed: 0,
      skipped: 1,
    });
    expect(drainQueuedEmail).toHaveBeenCalledWith(sendEmail, {
      siteUrl: "https://camp-404.com",
    });
  });

  it("answers 500 when an email failed", async () => {
    vi.mocked(drainQueuedEmail).mockResolvedValue({
      sent: 1,
      failed: 1,
      skipped: 0,
    });
    expect((await GET(req())).status).toBe(500);
  });

  it("touches nothing until email is configured", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(drainQueuedEmail).not.toHaveBeenCalled();
  });

  it("refuses a caller without the cron secret", async () => {
    vi.mocked(assertCron).mockReturnValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    expect((await GET(req())).status).toBe(401);
    expect(drainQueuedEmail).not.toHaveBeenCalled();
  });
});
