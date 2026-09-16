import { beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it is erased before the vi.mock factories hoist above it.
import type * as IdDocumentsModule from "@camp404/db/id-documents";

// Unit tests for sendCaptainPromotionAction (captain/roster side). The pure
// canSendPromotion guard is left REAL (exhaustively tested in @camp404/core);
// here we assert the orchestration: captain-gating, guard→copy mapping, the
// idempotent send call, and that NO rank flip happens on send.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  sendCaptainPromotion: vi.fn(),
  getPromotionRequestById: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({
  decryptOrNull: vi.fn(),
  decryptField: vi.fn(() => ({ state: "absent", value: null })),
}));
vi.mock("@camp404/db/id-documents", async (importOriginal) => ({
  // Spread the real module: actions.ts also reads ID_UNREADABLE_LABEL from
  // here, and a factory that omits it throws the moment a test drives
  // decryptField to "unreadable".
  ...(await importOriginal<typeof IdDocumentsModule>()),
  mergeIdNumber: vi.fn(),
}));
vi.mock("@/lib/member-detail", () => ({ presentMemberDetail: vi.fn() }));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cancelCaptainPromotionAction,
  sendCaptainPromotionAction,
} from "./actions";
import { deriveViewerRank, hasClearance } from "@camp404/core";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  decideCaptainPromotion,
  getPromotionRequestById,
  sendCaptainPromotion,
} from "@/lib/promotion";
import { getCampMemberDetail } from "@camp404/db/roster";

const CAPTAIN = "captain-1";

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

function targetRank(rank: "captain" | "member") {
  vi.mocked(getCampMemberDetail).mockResolvedValue({ rank } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(sendCaptainPromotion).mockResolvedValue({ id: "req-1" } as never);
});

describe("sendCaptainPromotionAction", () => {
  it("sends a request for a non-captain target (happy path), without flipping rank", async () => {
    signInAsCaptain();
    targetRank("member");

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({ ok: true, requestId: "req-1" });
    expect(sendCaptainPromotion).toHaveBeenCalledExactlyOnceWith({
      targetUserId: "member-1",
      requestedByUserId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
    // Only `target.rank` is read here, so this path must not opt into the ID
    // ciphertext — the data layer's default (exclude) has to stay in force.
    expect(getCampMemberDetail).toHaveBeenCalledExactlyOnceWith("member-1");
    expect(
      vi.mocked(getCampMemberDetail).mock.calls[0]![1]?.includeIdDocuments,
    ).not.toBe(true);
  });

  it("refuses a viewer who isn't camp-active yet", async () => {
    signInAsCaptain();
    vi.mocked(hasCampAccess).mockReturnValue(false);

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("sends to a target who leads a team — targetRank is not a viewer rank", async () => {
    // Bucket (c): `targetRank: deriveViewerRank(target.rank, false)` describes
    // the person being ACTED ON. canSendPromotion asks it one question —
    // "already a captain?" — so leading a team neither blocks nor enables a
    // promotion. A sweep that "fixed" this to `await isTeamLead(targetUserId)`
    // would buy a round-trip per send and imply a rule that does not exist.
    signInAsCaptain();
    targetRank("member"); // a lead IS a member row; lead-ness is derived

    const res = await sendCaptainPromotionAction("lead-1");

    expect(res).toEqual({ ok: true, requestId: "req-1" });
    // Both derivations of the same stored rank answer the guard identically.
    expect(deriveViewerRank("member", true)).not.toBe("captain");
    expect(deriveViewerRank("member", false)).not.toBe("captain");
  });

  it("refuses a genuine team lead as the VIEWER", async () => {
    // The mirror of the test above, and the half that matters: the acting
    // viewer's bar in requireCaptain is `captain`, and `team_lead < captain`
    // even though team-lead clearance is sitewide (owner-ratified 2026-09-09).
    // So a real lead — a `member` row that leads a team — cannot manufacture
    // captains, with or without the real isTeamLead flag at the call site.
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-lead",
      primaryEmail: "lead@example.com",
      displayName: "Lead",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "lead-1",
      rank: "member",
    } as never);

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
    expect(hasClearance(deriveViewerRank("member", true), "captain")).toBe(
      false,
    );
  });

  it("refuses a non-captain viewer", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-m",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "member-x",
      rank: "member",
    } as never);

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses a captain still awaiting approval", async () => {
    signInAsCaptain();
    targetRank("member");
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    // A pending captain must not be able to manufacture more of its own kind.
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses promoting yourself", async () => {
    signInAsCaptain();
    targetRank("captain"); // self is a captain, but self-check fires first

    const res = await sendCaptainPromotionAction(CAPTAIN);

    expect(res).toEqual({ ok: false, error: "You can't promote yourself." });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses a target who is already a captain", async () => {
    signInAsCaptain();
    targetRank("captain");

    const res = await sendCaptainPromotionAction("other-captain");

    expect(res).toEqual({ ok: false, error: "They're already a captain." });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects when the target isn't found", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(null as never);

    const res = await sendCaptainPromotionAction("ghost");

    expect(res).toEqual({ ok: false, error: "Member not found." });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await sendCaptainPromotionAction("member-1");

    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) target id at the boundary", async () => {
    signInAsCaptain();

    const res = await sendCaptainPromotionAction("");

    expect(res).toEqual({ ok: false, error: "Invalid member." });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(sendCaptainPromotion).not.toHaveBeenCalled();
  });
});

describe("cancelCaptainPromotionAction", () => {
  beforeEach(() => {
    vi.mocked(decideCaptainPromotion).mockResolvedValue({
      id: "req-1",
      status: "cancelled",
    } as never);
  });

  it("cancels an open request the captain sent", async () => {
    signInAsCaptain();
    vi.mocked(getPromotionRequestById).mockResolvedValue({
      id: "req-1",
      status: "sent",
      targetUserId: "member-1",
      requestedByUserId: CAPTAIN,
    } as never);

    const res = await cancelCaptainPromotionAction("req-1");

    expect(res).toEqual({ ok: true });
    expect(decideCaptainPromotion).toHaveBeenCalledExactlyOnceWith({
      requestId: "req-1",
      status: "cancelled",
      actorUserId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("refuses a non-captain viewer", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-m",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "member-x",
      rank: "member",
    } as never);

    const res = await cancelCaptainPromotionAction("req-1");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses a captain still awaiting approval", async () => {
    signInAsCaptain();
    vi.mocked(isApproved).mockReturnValue(false);
    vi.mocked(getPromotionRequestById).mockResolvedValue({
      id: "req-1",
      status: "sent",
      targetUserId: "member-1",
      requestedByUserId: CAPTAIN,
    } as never);

    const res = await cancelCaptainPromotionAction("req-1");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) request id", async () => {
    signInAsCaptain();

    const res = await cancelCaptainPromotionAction("");

    expect(res).toEqual({ ok: false, error: "Invalid request." });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
  });

  it("rejects when the request isn't found", async () => {
    signInAsCaptain();
    vi.mocked(getPromotionRequestById).mockResolvedValue(null as never);

    const res = await cancelCaptainPromotionAction("ghost");

    expect(res).toEqual({ ok: false, error: "Request not found." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses cancelling a request another captain sent", async () => {
    signInAsCaptain();
    vi.mocked(getPromotionRequestById).mockResolvedValue({
      id: "req-1",
      status: "sent",
      targetUserId: "member-1",
      requestedByUserId: "other-captain",
    } as never);

    const res = await cancelCaptainPromotionAction("req-1");

    expect(res).toEqual({
      ok: false,
      error: "Only the captain who sent it can cancel it.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses cancelling a request that is no longer open", async () => {
    signInAsCaptain();
    vi.mocked(getPromotionRequestById).mockResolvedValue({
      id: "req-1",
      status: "accepted",
      targetUserId: "member-1",
      requestedByUserId: CAPTAIN,
    } as never);

    const res = await cancelCaptainPromotionAction("req-1");

    expect(res).toEqual({
      ok: false,
      error: "This request is no longer open.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });
});
