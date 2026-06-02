import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app-layer orchestration of account erasure: DB scrub + best-effort avatar-blob
// cleanup. The pure DB patch is covered in account.test.ts; here we assert the
// orchestration (E2E short-circuit, cleanup called, cleanup failure swallowed).
vi.mock("server-only", () => ({}));
vi.mock("@camp404/db/account", () => ({ sanitiseAccount: vi.fn() }));
vi.mock("@/lib/avatar-blob", () => ({ deleteAvatarBlobs: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));

import { deleteAccount } from "@/lib/account";
import { sanitiseAccount } from "@camp404/db/account";
import { deleteAvatarBlobs } from "@/lib/avatar-blob";
import { isE2ETestMode } from "@/lib/test-mode";

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    vi.mocked(sanitiseAccount).mockResolvedValue({ lostCatNumber: 7 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("short-circuits under E2E mode without touching the DB or blobs", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const res = await deleteAccount("u1");
    expect(res).toEqual({ lostCatNumber: 0 });
    expect(sanitiseAccount).not.toHaveBeenCalled();
    expect(deleteAvatarBlobs).not.toHaveBeenCalled();
  });

  it("scrubs the DB, then deletes all the member's avatar blobs", async () => {
    const res = await deleteAccount("u1");
    expect(res).toEqual({ lostCatNumber: 7 });
    expect(sanitiseAccount).toHaveBeenCalledWith("u1");
    // No keepPathname — anonymisation removes every avatar object.
    expect(deleteAvatarBlobs).toHaveBeenCalledExactlyOnceWith("u1");
  });

  it("swallows a blob-cleanup failure (the DB scrub stands) and logs it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteAvatarBlobs).mockRejectedValue(new Error("blob down"));
    const res = await deleteAccount("u1");
    expect(res).toEqual({ lostCatNumber: 7 }); // still returns the scrub result
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("avatar-cleanup"),
      expect.any(Error),
    );
  });
});
