import { beforeEach, describe, expect, it, vi } from "vitest";

// Streaming a bug report's screenshot (#313): captains only, whoever holds the
// link, and every serve writes an audit row after the response.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditReadAfterResponse: vi.fn() }));
vi.mock("@/lib/report-screenshots", () => ({
  readReportScreenshot: vi.fn(),
}));

import { auditReadAfterResponse } from "@/lib/audit";
import { captainActionGate } from "@/lib/captain-gate";
import { readReportScreenshot } from "@/lib/report-screenshots";
import { GET } from "./route";

const ID = "6f1c1d8e-2b1a-4c55-9a77-0d3c1f6b9e21";
const call = (query = "") =>
  GET(new Request(`http://localhost/api/report-screenshot/${ID}${query}`), {
    params: Promise.resolve({ id: ID }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readReportScreenshot).mockResolvedValue({
    userId: "member-1",
    contentType: "image/png",
    issueNumber: 412,
    body: new Uint8Array([0x89, 0x50]),
  });
});

describe("GET /api/report-screenshot/[id]", () => {
  it("refuses anyone the captain gate refuses, reads nothing, records nothing", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Captains only.",
    });
    const res = await call();
    expect(res.status).toBe(403);
    expect(captainActionGate).toHaveBeenCalledWith("captain");
    expect(readReportScreenshot).not.toHaveBeenCalled();
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("streams it to a captain, sandboxed and uncached, and records the opening", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "captain",
      campUser: { id: "captain-1" },
    } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(auditReadAfterResponse).toHaveBeenCalledWith({
      actorId: "captain-1",
      action: "report_screenshot.viewed",
      target: "member-1",
      metadata: { screenshotId: ID, issueNumber: 412, view: "open" },
    });
  });

  it("records the list's small picture as a glance", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "captain",
      campUser: { id: "captain-1" },
    } as never);
    await call("?view=list");
    expect(vi.mocked(auditReadAfterResponse).mock.lastCall?.[0]).toMatchObject({
      metadata: { view: "list" },
    });
  });

  it("answers 404 for a screenshot that is gone, and records nothing", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "captain",
      campUser: { id: "captain-1" },
    } as never);
    vi.mocked(readReportScreenshot).mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });
});
