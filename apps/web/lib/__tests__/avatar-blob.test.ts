import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({ list: vi.fn(), del: vi.fn() }));

import {
  ORPHAN_MIN_AGE_MS,
  avatarProxyUrl,
  deleteAvatarBlobs,
  deleteQuestionnaireImageBlobs,
  orphanAvatarBlobs,
  ownProfilePhotoPathname,
  pruneReplacedProfilePhotos,
  sweepOrphanAvatarBlobs,
} from "@/lib/avatar-blob";
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

  it("deletes nothing without the store token, and says so", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deleteAvatarBlobs("u1");
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    // Erasure must not skip a member's photos silently.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("BLOB_READ_WRITE_TOKEN is not set"),
    );
    warn.mockRestore();
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

  it("leaves questionnaire image answers alone on a profile re-upload", async () => {
    // The defect this pins: answers live in nested `answers/<question>/`
    // folders under the SAME prefix, so an unfiltered orphan sweep took them
    // with it — a new profile photo destroyed every image answer the member
    // had given. Orphan cleanup stays flat.
    vi.mocked(list).mockResolvedValue(
      blobs(
        ["avatars/u1/old.webp", "https://blob/old"],
        ["avatars/u1/new.webp", "https://blob/new"],
        ["avatars/u1/answers/kitchen-setup_photo/a.webp", "https://blob/ans"],
      ),
    );
    await deleteAvatarBlobs("u1", "avatars/u1/new.webp");
    expect(del).toHaveBeenCalledWith(["https://blob/old"], {
      token: "test-token",
    });
  });

  it("propagates a list() failure for the caller to handle (best-effort at call-sites)", async () => {
    vi.mocked(list).mockRejectedValue(new Error("network down"));
    await expect(deleteAvatarBlobs("u1")).rejects.toThrow("network down");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("deleteQuestionnaireImageBlobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("prunes inside one question's folder and cannot reach the profile photo", async () => {
    // The converse invariant: storing an image ANSWER must not delete the
    // member's profile photo (nor another question's answer). The prefix is
    // the whole guarantee — list() is only ever asked for this one folder.
    vi.mocked(list).mockResolvedValue(
      blobs(
        ["avatars/u1/answers/gear-photo/old.webp", "https://blob/old"],
        ["avatars/u1/answers/gear-photo/new.webp", "https://blob/new"],
      ),
    );
    await deleteQuestionnaireImageBlobs(
      "u1",
      "gear-photo",
      "avatars/u1/answers/gear-photo/new.webp",
    );
    expect(list).toHaveBeenCalledWith({
      prefix: "avatars/u1/answers/gear-photo/",
      token: "test-token",
    });
    expect(del).toHaveBeenCalledWith(["https://blob/old"], {
      token: "test-token",
    });
  });
});

describe("ownProfilePhotoPathname", () => {
  it("reads the member's own flat photo out of a proxy URL", () => {
    expect(
      ownProfilePhotoPathname("u1", avatarProxyUrl("avatars/u1/avatar-x.webp")),
    ).toBe("avatars/u1/avatar-x.webp");
  });

  it("refuses anything it did not mint for this member", () => {
    expect(
      ownProfilePhotoPathname("u1", avatarProxyUrl("avatars/u2/avatar.webp")),
    ).toBeNull();
    expect(
      ownProfilePhotoPathname(
        "u1",
        avatarProxyUrl("avatars/u1/answers/q/a.webp"),
      ),
    ).toBeNull();
    expect(
      ownProfilePhotoPathname("u1", "https://example.com/avatars/u1/a.webp"),
    ).toBeNull();
    expect(ownProfilePhotoPathname("u1", "/api/avatar")).toBeNull();
  });
});

describe("pruneReplacedProfilePhotos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  const STORE = () =>
    blobs(
      ["avatars/u1/old.webp", "https://blob/old"],
      ["avatars/u1/new.webp", "https://blob/new"],
      ["avatars/u1/answers/q/a.webp", "https://blob/ans"],
    );

  it("keeps the photo the profile now points at, and the image answers", async () => {
    vi.mocked(list).mockResolvedValue(STORE());
    await pruneReplacedProfilePhotos(
      "u1",
      avatarProxyUrl("avatars/u1/new.webp"),
    );
    expect(del).toHaveBeenCalledWith(["https://blob/old"], {
      token: "test-token",
    });
  });

  it("keeps no photo once the member clears it, but still no image answers", async () => {
    vi.mocked(list).mockResolvedValue(STORE());
    await pruneReplacedProfilePhotos("u1", null);
    expect(del).toHaveBeenCalledWith(["https://blob/old", "https://blob/new"], {
      token: "test-token",
    });
  });

  it("prunes nothing for a saved URL it cannot read", async () => {
    await pruneReplacedProfilePhotos("u1", "https://example.com/me.png");
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("logs a store failure instead of failing the save that already happened", async () => {
    vi.mocked(list).mockRejectedValue(new Error("network down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      pruneReplacedProfilePhotos("u1", avatarProxyUrl("avatars/u1/new.webp")),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("orphanAvatarBlobs", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const old = new Date(now.getTime() - ORPHAN_MIN_AGE_MS - 1);
  const blob = (pathname: string, uploadedAt = old) => ({
    pathname,
    url: `https://blob/${pathname}`,
    uploadedAt,
  });

  it("picks blobs in folders of accounts that no longer exist, nested answers too", () => {
    const result = orphanAvatarBlobs(
      [
        blob("avatars/live/photo.webp"),
        blob("avatars/gone/photo.webp"),
        blob("avatars/gone/answers/kitchen-photo/a.webp"),
      ],
      new Set(["live"]),
      now,
    );
    expect(result).toEqual({
      folders: ["gone"],
      urls: [
        "https://blob/avatars/gone/photo.webp",
        "https://blob/avatars/gone/answers/kitchen-photo/a.webp",
      ],
    });
  });

  it("leaves a blob younger than a day, and anything outside a member folder", () => {
    const result = orphanAvatarBlobs(
      [
        blob("avatars/gone/new.webp", new Date(now.getTime() - 60_000)),
        blob("avatars/loose.webp"),
      ],
      new Set(["live"]),
      now,
    );
    expect(result).toEqual({ folders: [], urls: [] });
  });
});

describe("sweepOrphanAvatarBlobs", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const old = new Date(now.getTime() - ORPHAN_MIN_AGE_MS - 1);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("pages through every avatar and deletes the orphans", async () => {
    vi.mocked(list)
      .mockResolvedValueOnce({
        blobs: [
          {
            pathname: "avatars/gone/a.webp",
            url: "https://blob/a",
            uploadedAt: old,
          },
        ],
        hasMore: true,
        cursor: "next",
      } as never)
      .mockResolvedValueOnce({
        blobs: [
          {
            pathname: "avatars/live/b.webp",
            url: "https://blob/b",
            uploadedAt: old,
          },
        ],
        hasMore: false,
      } as never);

    expect(await sweepOrphanAvatarBlobs(new Set(["live"]), now)).toEqual({
      status: "swept",
      folders: 1,
      deleted: 1,
    });
    expect(list).toHaveBeenLastCalledWith({
      prefix: "avatars/",
      token: "test-token",
      cursor: "next",
    });
    expect(del).toHaveBeenCalledWith(["https://blob/a"], {
      token: "test-token",
    });
  });

  it("refuses when no live accounts are given, and deletes nothing", async () => {
    const result = await sweepOrphanAvatarBlobs(new Set(), now);
    expect(result.status).toBe("refused");
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("checks nothing without the store token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const result = await sweepOrphanAvatarBlobs(new Set(["live"]), now);
    expect(result.status).toBe("not_configured");
    expect(list).not.toHaveBeenCalled();
  });
});
