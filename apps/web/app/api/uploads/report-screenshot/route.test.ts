import { beforeEach, describe, expect, it, vi } from "vitest";

// A bug report's screenshot upload (#313). What matters: only a camp member
// may upload; only a real PNG, JPEG or WebP under 5 MB is kept (the type is
// only the browser's claim, so the first bytes are checked); it is kept as a
// PRIVATE blob in the member's own folder; and the answer is an id, never the
// blob's address.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  usesTestStore: vi.fn(() => false),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({
    pathname: pathname.replace(".png", "-abc123.png"),
    url: "https://blob.example/private/secret",
  })),
  del: vi.fn(async () => undefined),
  get: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(async () => ({ id: "camp-1" })),
  hasCampAccess: vi.fn(() => true),
}));
vi.mock("@camp404/db/report-screenshots", () => ({
  createReportScreenshot: vi.fn(async () => ({ id: "shot-1" })),
  SCREENSHOT_GONE: "gone",
  UNFILED_SCREENSHOT_TTL_MS: 1,
}));

import { put } from "@vercel/blob";
import { createReportScreenshot } from "@camp404/db/report-screenshots";
import { getAuthenticatedUser } from "@/lib/auth";
import { rateLimiter } from "@/lib/rate-limit";
import { hasCampAccess } from "@/lib/users";
import { POST } from "./route";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

function upload(bytes: Uint8Array | number[], type: string): Request {
  const form = new FormData();
  form.set(
    "screenshot",
    new File([new Uint8Array(bytes)], "Screenshot.png", { type }),
  );
  return {
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
  } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
});

describe("POST /api/uploads/report-screenshot", () => {
  it("keeps a PNG privately in the member's folder and answers with an id only", async () => {
    const res = await POST(upload(PNG, "image/png"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ screenshotId: "shot-1" });
    expect(JSON.stringify(body)).not.toContain("blob.example");

    expect(put).toHaveBeenCalledWith(
      "report-screenshots/camp-1/screenshot.png",
      expect.anything(),
      expect.objectContaining({ access: "private", addRandomSuffix: true }),
    );
    expect(createReportScreenshot).toHaveBeenCalledWith({
      userId: "camp-1",
      pathname: "report-screenshots/camp-1/screenshot-abc123.png",
      contentType: "image/png",
      sizeBytes: PNG.length,
    });
  });

  it("refuses someone signed in but not in the camp", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    const res = await POST(upload(PNG, "image/png"));
    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await POST(upload(PNG, "image/png"))).status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a type it does not take, and bytes that are not what the type says", async () => {
    const gif = await POST(upload([0x47, 0x49, 0x46, 0x38], "image/gif"));
    expect(gif.status).toBe(415);
    // An HTML page that claims to be a PNG.
    const fake = await POST(
      upload(new TextEncoder().encode("<html><script>"), "image/png"),
    );
    expect(fake.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a picture over 5 MB", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    const res = await POST(upload(big, "image/png"));
    expect(res.status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it("is rate-limited", async () => {
    vi.mocked(rateLimiter.limit).mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 60,
    } as never);
    const res = await POST(upload(PNG, "image/png"));
    expect(res.status).toBe(429);
    expect(put).not.toHaveBeenCalled();
  });
});
