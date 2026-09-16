import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for decideApprovalAction — the highest-privilege write in
// camp-management (approving or rejecting another member's vetting). Covers the
// captain gate (including the approval check a pending captain must not pass),
// the boundary guards, and the compare-and-set the db write now performs: a
// captain acting on a stale roster is TOLD they lost, never silently told ok.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getOpenPromotionForTarget: vi.fn(),
  getPromotionRequestById: vi.fn(),
  sendCaptainPromotion: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({
  decryptOrNull: vi.fn(() => null),
  decryptField: vi.fn(() => ({ state: "absent", value: null })),
}));
vi.mock("@camp404/db/id-documents", () => ({
  ID_UNREADABLE_LABEL: "Unreadable",
  mergeIdNumber: vi.fn(() => ({})),
}));
vi.mock("@/lib/member-detail", () => ({
  presentMemberDetail: vi.fn(() => ({ id: "member-1" })),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(async () => ({
    version: "test",
    pages: [],
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { decideApprovalAction } from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  decideUserApproval,
  ensureCampUser,
  hasCampAccess,
  isApproved,
} from "@/lib/users";

const CAPTAIN = "cap-1";

function signInAsCaptain() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-cap",
    primaryEmail: "cap@example.com",
    displayName: "Cap",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: CAPTAIN,
    rank: "captain",
  } as never);
}

function signInAsMember() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-m",
    primaryEmail: "m@example.com",
    displayName: "M",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "member-x",
    rank: "member",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(decideUserApproval).mockResolvedValue(true);
});

describe("decideApprovalAction — the write", () => {
  it("approves a pending member and stamps the deciding captain", async () => {
    signInAsCaptain();

    const res = await decideApprovalAction("member-1", "approved");

    expect(res).toEqual({ ok: true });
    expect(decideUserApproval).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      status: "approved",
      decidedByUserId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("rejects a pending member through the same path", async () => {
    signInAsCaptain();

    const res = await decideApprovalAction("member-1", "rejected");

    expect(res).toEqual({ ok: true });
    expect(decideUserApproval).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      status: "rejected",
      decidedByUserId: CAPTAIN,
    });
  });

  it("reports the lost compare-and-set instead of a false success", async () => {
    // Two captains work the same queue from separately-rendered rosters, so both
    // still see Approve / Reject. The db write compare-and-sets on `pending`;
    // when it returns false this captain changed nothing and must be told so —
    // the old code returned { ok: true } unconditionally and lost the first
    // captain's decision AND its audit stamp in silence.
    signInAsCaptain();
    vi.mocked(decideUserApproval).mockResolvedValue(false);

    const res = await decideApprovalAction("member-1", "rejected");

    expect(res).toEqual({
      ok: false,
      error: "Another captain already decided on this member.",
    });
    // Revalidate fires either way: losing the CAS means this captain's roster is
    // stale, which is exactly why they got here.
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });
});

describe("decideApprovalAction — the gate", () => {
  it("refuses a captain still awaiting approval and never writes", async () => {
    // A captain+pending row is reachable through the product UI: the roster
    // offers assign-captain on a member still in the vetting queue, and
    // accepting flips rank without touching approval status. Such an account
    // must not be able to vet anyone — including approving a co-conspirator.
    signInAsCaptain();
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await decideApprovalAction("member-2", "approved");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    // Not merely an error-shaped response: the vetting write never happens.
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("refuses a rejected captain — isApproved is the single comparator", async () => {
    signInAsCaptain();
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: CAPTAIN,
      rank: "captain",
      approvalStatus: "rejected",
    } as never);
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await decideApprovalAction("member-2", "approved");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(isApproved).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "rejected" }),
      "cap@example.com",
    );
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("refuses a non-captain viewer and never writes", async () => {
    signInAsMember();

    const res = await decideApprovalAction("member-1", "approved");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("refuses a viewer who isn't camp-active yet", async () => {
    signInAsCaptain();
    vi.mocked(hasCampAccess).mockReturnValue(false);

    const res = await decideApprovalAction("member-1", "approved");

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await decideApprovalAction("member-1", "approved");

    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });
});

describe("decideApprovalAction — boundary guards", () => {
  it("refuses a captain deciding on their own account", async () => {
    signInAsCaptain();

    const res = await decideApprovalAction(CAPTAIN, "approved");

    expect(res).toEqual({
      ok: false,
      error: "You can't decide on your own account.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) member id before any write", async () => {
    signInAsCaptain();

    const res = await decideApprovalAction("", "approved");

    expect(res).toEqual({ ok: false, error: "Invalid member." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects an unknown decision value", async () => {
    signInAsCaptain();

    const res = await decideApprovalAction("member-1", "banned" as never);

    expect(res).toEqual({ ok: false, error: "Unknown decision." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });
});
