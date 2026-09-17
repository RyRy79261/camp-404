import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for decideApprovalAction and decideApprovalsAction — the
// highest-privilege writes in camp-management (approving, rejecting or
// re-opening another member's vetting). Covers the captain gate (including the
// approval check a pending captain must not pass), the boundary guards, the
// refusals the decision panel shows, and the compare-and-set the db write
// performs: a captain acting on a stale roster is TOLD they lost, never
// silently told ok.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
  findCampUserById: vi.fn(),
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

import { decideApprovalAction, decideApprovalsAction } from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  decideUserApproval,
  ensureCampUser,
  findCampUserById,
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
  vi.mocked(findCampUserById).mockImplementation(
    async (id: string) => ({ id, rank: "member" }) as never,
  );
});

/** A decision on a pending applicant, as the panel sends it. */
function onPending(
  userId: string,
  to: "approved" | "rejected",
  reason?: string,
) {
  return decideApprovalAction({ userId, from: "pending", to, reason });
}

describe("decideApprovalAction — the write", () => {
  it("approves a pending member and stamps the deciding captain", async () => {
    signInAsCaptain();

    const res = await onPending("member-1", "approved");

    expect(res).toEqual({ ok: true });
    expect(decideUserApproval).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      from: "pending",
      to: "approved",
      decidedByUserId: CAPTAIN,
      reason: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("rejects a pending member through the same path", async () => {
    signInAsCaptain();

    const res = await onPending(
      "member-1",
      "rejected",
      "  We are full this year.  ",
    );

    expect(res).toEqual({ ok: true });
    expect(decideUserApproval).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      from: "pending",
      to: "rejected",
      decidedByUserId: CAPTAIN,
      reason: "We are full this year.",
    });
  });

  it("reverses an approval, and re-opens a rejection", async () => {
    // Owner's call, 2026-09-16: a decision can be changed.
    signInAsCaptain();

    expect(
      await decideApprovalAction({
        userId: "member-1",
        from: "approved",
        to: "rejected",
        reason: "Dropped out.",
      }),
    ).toEqual({ ok: true });
    expect(
      await decideApprovalAction({
        userId: "member-2",
        from: "rejected",
        to: "pending",
      }),
    ).toEqual({ ok: true });
    expect(
      vi.mocked(decideUserApproval).mock.calls.map(([c]) => [c.from, c.to]),
    ).toEqual([
      ["approved", "rejected"],
      ["rejected", "pending"],
    ]);
  });

  it("stores a blank reason as no reason", async () => {
    signInAsCaptain();

    await onPending("member-1", "rejected", "   ");

    expect(vi.mocked(decideUserApproval).mock.calls[0]![0].reason).toBeNull();
  });

  it("refuses a reason that is too long, deciding nothing", async () => {
    signInAsCaptain();

    const res = await onPending("member-1", "rejected", "x".repeat(501));

    expect(res).toEqual({
      ok: false,
      error: "Keep the reason under 500 characters.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("reports the lost compare-and-set instead of a false success", async () => {
    // Two captains work the same queue from separately-rendered rosters, so both
    // still see the same controls. The db write compare-and-sets on the status
    // the captain saw; when it returns false this captain changed nothing and
    // must be told so.
    signInAsCaptain();
    vi.mocked(decideUserApproval).mockResolvedValue(false);

    const res = await onPending("member-1", "rejected");

    expect(res).toEqual({
      ok: false,
      error: "Another captain already changed this member's decision.",
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

    const res = await onPending("member-2", "approved");

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

    const res = await onPending("member-2", "approved");

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

    const res = await onPending("member-1", "approved");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("refuses a viewer who isn't camp-active yet", async () => {
    signInAsCaptain();
    vi.mocked(hasCampAccess).mockReturnValue(false);

    const res = await onPending("member-1", "approved");

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await onPending("member-1", "approved");

    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });
});

describe("decideApprovalAction — boundary guards", () => {
  it("refuses a captain deciding on their own account", async () => {
    signInAsCaptain();

    const res = await onPending(CAPTAIN, "approved");

    expect(res).toEqual({
      ok: false,
      error: "You can't decide on your own account.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("refuses taking an approved captain's access away", async () => {
    signInAsCaptain();
    vi.mocked(findCampUserById).mockResolvedValue({
      id: "cap-2",
      rank: "captain",
    } as never);

    const res = await decideApprovalAction({
      userId: "cap-2",
      from: "approved",
      to: "rejected",
    });

    expect(res).toEqual({
      ok: false,
      error: "A captain can't be taken out of camp here.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) member id before any write", async () => {
    signInAsCaptain();

    const res = await onPending("", "approved");

    expect(res).toEqual({ ok: false, error: "Invalid member." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("rejects an unknown decision value, and a move that is not a decision", async () => {
    signInAsCaptain();

    expect(await onPending("member-1", "banned" as never)).toEqual({
      ok: false,
      error: "Unknown decision.",
    });
    expect(
      await decideApprovalAction({
        userId: "member-1",
        from: "approved",
        to: "approved",
      }),
    ).toEqual({ ok: false, error: "Unknown decision." });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });

  it("says so when the member does not exist", async () => {
    signInAsCaptain();
    vi.mocked(findCampUserById).mockResolvedValue(null);

    expect(await onPending("ghost", "approved")).toEqual({
      ok: false,
      error: "Member not found.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });
});

describe("decideApprovalsAction — deciding the pending queue in bulk", () => {
  it("decides each member on its own compare-and-set and reports the split", async () => {
    signInAsCaptain();
    vi.mocked(decideUserApproval).mockImplementation(
      async ({ userId }) => userId !== "m-lost",
    );

    const res = await decideApprovalsAction({
      userIds: ["m-1", "m-lost", CAPTAIN, "m-1"],
      to: "approved",
    });

    expect(res).toEqual({
      ok: true,
      decided: ["m-1"],
      lost: ["m-lost"],
      refused: [
        { userId: CAPTAIN, error: "You can't decide on your own account." },
      ],
    });
    // Duplicates collapse, and the captain's own row never reaches the write.
    expect(
      vi.mocked(decideUserApproval).mock.calls.map(([c]) => c.userId),
    ).toEqual(["m-1", "m-lost"]);
    for (const [call] of vi.mocked(decideUserApproval).mock.calls) {
      expect(call).toMatchObject({ from: "pending", to: "approved" });
    }
  });

  it("gives every rejected member the same reason", async () => {
    signInAsCaptain();

    await decideApprovalsAction({
      userIds: ["m-1", "m-2"],
      to: "rejected",
      reason: " Full. ",
    });

    expect(
      vi.mocked(decideUserApproval).mock.calls.map(([c]) => c.reason),
    ).toEqual(["Full.", "Full."]);
  });

  it("refuses an empty pick, too many members, or a non-captain", async () => {
    signInAsCaptain();
    expect(
      await decideApprovalsAction({ userIds: [], to: "approved" }),
    ).toEqual({
      ok: false,
      error: "Pick at least one member.",
    });
    expect(
      await decideApprovalsAction({
        userIds: Array.from({ length: 101 }, (_, n) => `m-${n}`),
        to: "approved",
      }),
    ).toEqual({ ok: false, error: "Decide at most 100 members at a time." });

    signInAsMember();
    expect(
      await decideApprovalsAction({ userIds: ["m-1"], to: "approved" }),
    ).toEqual({
      ok: false,
      error: "Captain access only.",
    });
    expect(decideUserApproval).not.toHaveBeenCalled();
  });
});
