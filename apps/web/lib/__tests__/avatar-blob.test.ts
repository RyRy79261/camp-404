import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// avatar-blob.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ list: vi.fn(), del: vi.fn() }));

import { deleteAvatarBlobs } from "@/lib/avatar-blob";
import { del, list } from "@vercel/blob";

function blobs(...entries: Array<[string, string]>) {
  return {
    blobs: entries.map(([pathname, url]) => ({ pathname, url })),
  } as never;
}

describe("deleteAvatarBlobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("is a no-op when the store token is absent", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await deleteAvatarBlobs("u1");
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes every blob under the user's prefix (anonymisation)", async () => {
    vi.mocked(list).mockResolvedValue(
      blobs(
        ["avatars/u1/a.webp", "https://blob/a"],
        ["avatars/u1/b.webp", "https://blob/b"],
      ),
    );
    await deleteAvatarBlobs("u1");
    expect(list).toHaveBeenCalledWith({
      prefix: "avatars/u1/",
      token: "test-token",
    });
    expect(del).toHaveBeenCalledWith(["https://blob/a", "https://blob/b"], {
      token: "test-token",
    });
  });

  it("keeps the just-uploaded blob (orphan cleanup on re-upload)", async () => {
    vi.mocked(list).mockResolvedValue(
      blobs(
        ["avatars/u1/old.webp", "https://blob/old"],
        ["avatars/u1/new.webp", "https://blob/new"],
      ),
    );
    await deleteAvatarBlobs("u1", "avatars/u1/new.webp");
    expect(del).toHaveBeenCalledWith(["https://blob/old"], {
      token: "test-token",
    });
  });

  it("does not call del when nothing is stale", async () => {
    vi.mocked(list).mockResolvedValue(
      blobs(["avatars/u1/new.webp", "https://blob/new"]),
    );
    await deleteAvatarBlobs("u1", "avatars/u1/new.webp");
    expect(del).not.toHaveBeenCalled();
  });

  it("propagates a list() failure for the caller to handle (best-effort at call-sites)", async () => {
    vi.mocked(list).mockRejectedValue(new Error("network down"));
    await expect(deleteAvatarBlobs("u1")).rejects.toThrow("network down");
    expect(del).not.toHaveBeenCalled();
  });
});
