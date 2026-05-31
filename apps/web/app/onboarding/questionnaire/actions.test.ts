import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server-side half of the stage 2→3 fix: when persistence throws (e.g.
// encrypt() with no PGCRYPTO_KEY), saveBurnerProfile must RETURN a typed
// {ok:false, errors:{_form}} rather than throw. The e2e can't reach this branch
// (E2E_TEST_MODE bypasses encryption), so it's guarded here by mocking the
// persistence layer — which also keeps the real server-only / DB modules out.

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserOrRedirect: vi.fn(),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  upsertBurnerProfile: vi.fn(),
  setIdDocuments: vi.fn(),
  setProfileImage: vi.fn(),
  satisfyBurnerProfileAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveBurnerProfile } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  setIdDocuments,
  upsertBurnerProfile,
} from "@/lib/users";

const responsesWithId = {
  "id.type": "passport",
  "id.number": "A1234567",
  birthday: "1990-04-12",
};

describe("saveBurnerProfile persistence error handling", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "member@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      authUserId: "auth-1",
      displayName: "Member",
      profileImageUrl: null,
      inviteCode: "INV",
      rank: "member",
      approvalStatus: "approved",
    });
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(upsertBurnerProfile).mockResolvedValue(undefined);
    // Silence the intentional console.error in the catch.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a typed _form error (not a throw) when ID encryption fails", async () => {
    vi.mocked(setIdDocuments).mockRejectedValue(
      new Error("PGCRYPTO_KEY env var is required"),
    );

    const result = await saveBurnerProfile(responsesWithId, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._form).toMatch(/couldn't save/i);
    }
  });

  it("returns ok on a successful non-final save", async () => {
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);

    const result = await saveBurnerProfile(responsesWithId, false);

    expect(result.ok).toBe(true);
  });
});
