import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two defects live here, and both are only visible if the test asserts what the
// route did NOT do. A missing Blob token used to answer 200 with a proxy URL
// for a blob nobody ever wrote — the client persists any 2xx URL to
// users.profile_image_url, where it 404s forever — so the load-bearing
// assertion is that no url comes back and `put` was never called. And the
// `image/*` prefix test admitted image/svg+xml, which /api/avatar streams back
// same-origin with its stored content type: a stored SVG executes in this
// app's origin. The allow-list test must assert `put` was not called, not just
// the status.
//
// Runs under the suite's default jsdom environment (see the push cron route
// test for why these route tests don't opt into the node environment). Under
// jsdom a real multipart Request parses into undici's File, which fails the
// route's `instanceof File` check against the jsdom global — so the request is
// stubbed down to what the handler actually reads: formData() and headers
// (the latter only reaches the mocked getClientIp).

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/avatar-blob", () => ({ deleteAvatarBlobs: vi.fn() }));

import { POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { isE2ETestMode } from "@/lib/test-mode";
import { rateLimiter } from "@/lib/rate-limit";
import { put } from "@vercel/blob";

const TOKEN = "vercel_blob_rw_test_token";

function upload(type: string, name = "avatar.webp"): Request {
  const form = new FormData();
  form.set("image", new File([new Uint8Array([1, 2, 3, 4])], name, { type }));
  return {
    method: "POST",
    url: "https://camp.test/api/uploads/avatar",
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/uploads/avatar", () => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "u1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    } as never);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it("returns 501 and no url when the Blob store is unconfigured", async () => {
    // THE REFUSED CASE. A status check alone would not have caught the defect:
    // the old branch answered 200 *with a url*, which is what got persisted.
    const res = await POST(upload("image/webp"));

    expect(res.status).toBe(501);
    const body = (await res.json()) as { error?: string; url?: string };
    expect(body.error).toBe(
      "Photo uploads aren't configured on this deployment.",
    );
    expect(body.url).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it("still stubs a deterministic proxy URL under E2E_TEST_MODE with no token", async () => {
    // The harness path the fix deliberately preserves — E2E_TEST_MODE is never
    // set on a deployed environment, and CI ships no blob token.
    vi.mocked(isE2ETestMode).mockReturnValue(true);

    const res = await POST(upload("image/webp"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "/api/avatar?pathname=avatars%2Fu1%2Ftest-avatar.webp",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects image/svg+xml with 415 and never writes a blob", async () => {
    // THE XSS CASE: /api/avatar serves blobs same-origin with their stored
    // content type, so a stored SVG runs script in this app's origin.
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;

    const res = await POST(upload("image/svg+xml", "payload.svg"));

    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      error: "Photo must be a WebP or PNG image",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects every other content type with 415 — an allow-list, not an SVG denylist", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;

    for (const type of ["image/gif", "image/jpeg", "text/html", ""]) {
      // "" is the no-content-type case a hand-rolled POST can produce.
      const res = await POST(upload(type, "file.bin"));
      expect(res.status, `content type ${JSON.stringify(type)}`).toBe(415);
    }
    expect(put).not.toHaveBeenCalled();
  });

  it("writes a WebP to the private store and returns the proxy URL, never the blob URL", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
    vi.mocked(put).mockResolvedValue({
      pathname: "avatars/u1/avatar-x7f2.webp",
      url: "https://blob.vercel-storage.com/avatars/u1/avatar-x7f2.webp",
    } as never);

    const res = await POST(upload("image/webp"));

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      "avatars/u1/avatar.webp",
      expect.any(File),
      {
        access: "private",
        addRandomSuffix: true,
        contentType: "image/webp",
        token: TOKEN,
      },
    );
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe(
      "/api/avatar?pathname=avatars%2Fu1%2Favatar-x7f2.webp",
    );
    expect(body.url).not.toContain("blob.vercel-storage.com");
  });

  it("accepts image/png (the canvas WebP-encode fallback)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
    vi.mocked(put).mockResolvedValue({
      pathname: "avatars/u1/avatar-a1b2.png",
    } as never);

    const res = await POST(upload("image/png", "avatar.png"));

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledWith(
      "avatars/u1/avatar.png",
      expect.any(File),
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("reports a blob-store failure as 502 rather than a fake success", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
    vi.mocked(put).mockRejectedValue(new Error("store unreachable"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(upload("image/webp"));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string; url?: string };
    expect(body.error).toBe("Upload failed");
    expect(body.url).toBeUndefined();
    err.mockRestore();
  });

  it("never reaches the store for an unauthenticated request", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await POST(upload("image/webp"));

    expect(res.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });
});
