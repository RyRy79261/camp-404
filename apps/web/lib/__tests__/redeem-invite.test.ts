import { beforeEach, describe, expect, it, vi } from "vitest";

// Two submits of the invite form at once (two tabs, a network retry) used to
// throw the member onto an error page even though they had joined: both
// requests saw no row, both claimed a use, and the second insert hit the
// unique auth_user_id.

vi.mock("@camp404/db/burner-profile", () => ({
  createCampUser: vi.fn(),
  findUserByAuthId: vi.fn(),
  getBurnerProfileByUserId: vi.fn(),
  setUserApproval: vi.fn(),
  setUserApprovalStatus: vi.fn(),
  setUserDisplayName: vi.fn(),
  setUserInviteCode: vi.fn(),
  setUserProfileImage: vi.fn(),
  setUserRank: vi.fn(),
  upsertBurnerProfile: vi.fn(),
  getIdDocumentColumns: vi.fn(),
  setIdDocumentColumns: vi.fn(),
}));
vi.mock("@camp404/db/activations", () => ({
  ensureRequiredAction: vi.fn(),
  satisfyRequiredAction: vi.fn(),
  getPendingRequiredActions: vi.fn(),
  reconcileOpenActivations: vi.fn(),
}));
vi.mock("../access-control", () => ({
  claimInviteCode: vi.fn(),
  isGodEmail: vi.fn(() => false),
}));
vi.mock("../test-mode", () => ({ isE2ETestMode: () => false }));

import { redeemInviteForUser } from "../users";
import { createCampUser, findUserByAuthId } from "@camp404/db/burner-profile";
import { ensureRequiredAction } from "@camp404/db/activations";
import { claimInviteCode } from "../access-control";

const AUTH = { id: "auth-1", primaryEmail: "ada@example.com", displayName: "Ada" };
const ROW = {
  id: "camp-1",
  authUserId: "auth-1",
  displayName: "Ada",
  profileImageUrl: null,
  inviteCode: "berlin-crew",
  rank: "member",
  approvalStatus: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimInviteCode).mockResolvedValue({
    code: "berlin-crew",
    assignedRank: null,
    requiresApproval: true,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("redeemInviteForUser — two submits at once", () => {
  it("reports success when the other request created the member first", async () => {
    vi.mocked(findUserByAuthId)
      .mockResolvedValueOnce(null) // the gate read: no row yet
      .mockResolvedValueOnce(ROW as never); // after the insert lost the race
    vi.mocked(createCampUser).mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    expect(await redeemInviteForUser(AUTH, "Berlin-Crew")).toEqual({ ok: true });
    // The winner already seeded the gate; this request adds nothing.
    expect(ensureRequiredAction).not.toHaveBeenCalled();
  });

  it("still throws a failure that created nobody", async () => {
    vi.mocked(findUserByAuthId).mockResolvedValue(null);
    vi.mocked(createCampUser).mockRejectedValue(new Error("database down"));
    await expect(redeemInviteForUser(AUTH, "berlin-crew")).rejects.toThrow(
      "database down",
    );
  });
});
