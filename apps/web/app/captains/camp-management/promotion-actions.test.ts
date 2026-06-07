import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for sendCaptainPromotionAction (captain/roster side). The pure
// canSendPromotion guard is left REAL (exhaustively tested in @camp404/core);
// here we assert the orchestration: captain-gating, guard→copy mapping, the
// idempotent send call, and that NO rank flip happens on send.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  sendCaptainPromotion: vi.fn(),
  getPromotionRequestById: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({ decryptOrNull: vi.fn() }));
vi.mock("@camp404/db/id-documents", () => ({ mergeIdNumber: vi.fn() }));
vi.mock("@/lib/member-detail", () => ({ presentMemberDetail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cancelCaptainPromotionAction,
  sendCaptainPromotionAction,
} from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
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
