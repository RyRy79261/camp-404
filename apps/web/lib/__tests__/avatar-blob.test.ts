import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({ list: vi.fn(), del: vi.fn() }));

import {
  deleteAvatarBlobs,
  deleteQuestionnaireImageBlobs,
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
