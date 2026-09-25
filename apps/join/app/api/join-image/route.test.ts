import { beforeEach, describe, expect, it, vi } from "vitest";

// The join page's pictures are public: served to anyone, signed in or not,
// but only from the join-page folder.

vi.mock("@vercel/blob", () => ({ get: vi.fn() }));

import { GET } from "./route";
import { get } from "@vercel/blob";

const req = (pathname: string) =>
  new Request(
    `https://camp.test/api/join-image?pathname=${encodeURIComponent(pathname)}`,
  );

describe("GET /api/join-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/jpeg" },
    } as never);
  });

  it("streams a join-page picture to anyone, cacheable", async () => {
    const res = await GET(req("join-page/2026/image-abc.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(get).toHaveBeenCalledWith("join-page/2026/image-abc.jpg", {
      access: "private",
      token: "vercel_blob_rw_test",
    });
  });

  it("serves no other folder: members' photos stay behind /api/avatar", async () => {
    expect((await GET(req("avatars/auth-1/avatar.webp"))).status).toBe(404);
    expect((await GET(req("join-page/../avatars/a/b.webp"))).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves nothing that is not a photo", async () => {
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/svg+xml" },
    } as never);
    expect((await GET(req("join-page/2026/x.svg"))).status).toBe(404);
  });

  it("serves nothing when no store is connected", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await GET(req("join-page/2026/a.jpg"))).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers not found when the picture is missing", async () => {
    vi.mocked(get).mockResolvedValue(null as never);
    expect((await GET(req("join-page/2026/gone.jpg"))).status).toBe(404);
  });
});
