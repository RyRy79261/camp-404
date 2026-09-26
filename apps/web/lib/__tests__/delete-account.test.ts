import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app-layer orchestration of account erasure: DB scrub + best-effort avatar-blob
// cleanup. The pure DB patch is covered in account.test.ts; here we assert the
// orchestration (E2E short-circuit, cleanup called, cleanup failure swallowed).
vi.mock("@camp404/db/account", () => ({ sanitiseAccount: vi.fn() }));
vi.mock("@/lib/avatar-blob", () => ({ deleteAvatarBlobs: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  usesTestStore: vi.fn(() => false),
}));

import { deleteAccount } from "@/lib/account";
import { sanitiseAccount } from "@camp404/db/account";
import { deleteAvatarBlobs } from "@/lib/avatar-blob";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    vi.mocked(usesTestStore).mockReturnValue(false);
    vi.mocked(sanitiseAccount).mockResolvedValue({
      ok: true,
      lostCatNumber: 7,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("short-circuits under E2E mode without touching the DB or blobs", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const res = await deleteAccount({ userId: "u1", authUserId: "auth-1" });
    expect(res).toEqual({ ok: true, lostCatNumber: 0 });
    expect(sanitiseAccount).not.toHaveBeenCalled();
    expect(deleteAvatarBlobs).not.toHaveBeenCalled();
  });

  it("deletes the test store's desktop layout under E2E, as the real erasure deletes the row", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    vi.mocked(usesTestStore).mockReturnValue(true);
    testStore.reset();
    const member = testStore.createUser({
      authUserId: "auth-erased",
      displayName: "Erased",
      inviteCode: "seed",
    });
    const other = testStore.createUser({
      authUserId: "auth-kept",
      displayName: "Kept",
      inviteCode: "seed",
    });
    const layout = { cells: { inbox: { c: 0, r: 0 } }, items: [] };
    testStore.saveDesktopLayout(member.id, layout);
    testStore.saveDesktopLayout(other.id, layout);

    await deleteAccount({ userId: member.id, authUserId: member.authUserId });

    expect(testStore.getDesktopLayout(member.id)).toBeNull();
    expect(testStore.getDesktopLayout(other.id)).toEqual(layout);
    testStore.reset();
  });

  it("scrubs the DB, then deletes all the member's avatar blobs", async () => {
    const res = await deleteAccount({ userId: "u1", authUserId: "auth-1" });
    expect(res).toEqual({ ok: true, lostCatNumber: 7 });
    expect(sanitiseAccount).toHaveBeenCalledWith("u1");
    // No keepPathname — anonymisation removes every avatar object. And the
    // folder is the AUTH id's: the upload routes write avatars/<session user
    // id>/, so sweeping the camp id deleted nothing.
    expect(deleteAvatarBlobs).toHaveBeenCalledExactlyOnceWith("auth-1");
  });

  it("takes no avatar blobs with it when the DB refused the erasure", async () => {
    // The sole-captain refusal happens inside the sanitise transaction and
    // writes nothing — so the blobs, which the kept row still points at, must
    // survive too.
    vi.mocked(sanitiseAccount).mockResolvedValue({
      ok: false,
      reason: "sole_captain",
    });
    const res = await deleteAccount({ userId: "u1", authUserId: "auth-1" });
    expect(res).toEqual({ ok: false, reason: "sole_captain" });
    expect(deleteAvatarBlobs).not.toHaveBeenCalled();
  });

  it("swallows a blob-cleanup failure (the DB scrub stands) and logs it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteAvatarBlobs).mockRejectedValue(new Error("blob down"));
    const res = await deleteAccount({ userId: "u1", authUserId: "auth-1" });
    expect(res).toEqual({ ok: true, lostCatNumber: 7 }); // still returns the scrub result
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("avatar-cleanup"),
      expect.any(Error),
    );
  });
});
