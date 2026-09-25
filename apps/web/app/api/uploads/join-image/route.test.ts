import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A picture for the join page: captains only, photos but never SVG, stored
// private under the year's folder and handed back as the relative link both
// apps serve. The request is stubbed to what the handler reads.

vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@camp404/db/cycles", () => ({
  currentCycleNumber: vi.fn(async () => 2026),
}));

import { POST } from "./route";
import { captainActionGate } from "@/lib/captain-gate";
import { rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { put } from "@vercel/blob";

function upload(type: string, size = 3): Request {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(size)], "lounge", { type }));
  return {
    method: "POST",
    url: "https://camp.test/api/uploads/join-image",
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/uploads/join-image", () => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: "cap-1" },
      rank: "captain",
    } as never);
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    vi.mocked(put).mockResolvedValue({
      pathname: "join-page/2026/image-abc.jpg",
    } as never);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });
  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it("stores a JPEG privately under the year and returns the join-image link", async () => {
    const res = await POST(upload("image/jpeg"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "/api/join-image?pathname=join-page%2F2026%2Fimage-abc.jpg",
    });
    expect(vi.mocked(put).mock.calls[0]![0]).toBe("join-page/2026/image.jpg");
    expect(vi.mocked(put).mock.calls[0]![2]).toMatchObject({
      access: "private",
      addRandomSuffix: true,
    });
    expect(captainActionGate).toHaveBeenCalledWith("captain");
  });

  it("refuses anyone below captain", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    expect((await POST(upload("image/png"))).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses an SVG, which the route would serve same-origin", async () => {
    expect((await POST(upload("image/svg+xml"))).status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a picture over 5 MB", async () => {
    expect((await POST(upload("image/png", 5 * 1024 * 1024 + 1))).status).toBe(
      413,
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("slows a captain down after too many uploads", async () => {
    vi.mocked(rateLimiter.limit).mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 30,
    });
    const res = await POST(upload("image/png"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(put).not.toHaveBeenCalled();
  });

  it("says uploads are off when the store is not configured", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await POST(upload("image/png"))).status).toBe(501);
    expect(put).not.toHaveBeenCalled();
  });

  it("stores nothing under E2E, but hands back a link of the stored shape", async () => {
    vi.mocked(isE2ETestMode).mockReturnValueOnce(true);
    const res = await POST(upload("image/webp"));
    expect(await res.json()).toEqual({
      url: "/api/join-image?pathname=join-page%2Fe2e%2Ftest-image.webp",
    });
    expect(put).not.toHaveBeenCalled();
  });
});
