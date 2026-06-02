import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for the acceptance-side promotion actions. The pure guard/state
// machine is exhaustively tested in @camp404/core; here we assert the
// ORCHESTRATION — correct collaborator calls, the rank-flip discipline (only on
// accept, only after a successful decide), and the audit-null bridge — by
// mocking the data collaborators and leaving @camp404/core REAL.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  setCampUserRank: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getPromotionRequestById: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  acceptCaptainPromotionAction,
  cancelCaptainPromotionAction,
  declineCaptainPromotionAction,
} from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, setCampUserRank } from "@/lib/users";
import {
  decideCaptainPromotion,
  getPromotionRequestById,
} from "@/lib/promotion";

const TARGET = "target-camp-id";
const REQUESTER = "captain-camp-id";
const REQUEST_ID = "req-1";

function sentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    targetUserId: TARGET,
    requestedByUserId: REQUESTER,
    status: "sent" as const,
    createdAt: new Date("2026-01-01"),
    decidedAt: null,
    ...overrides,
  };
}

// Sign in as a given camp user id.
function signInAs(campUserId: string) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: `auth-${campUserId}`,
    primaryEmail: "u@example.com",
    displayName: "U",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: campUserId } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  // Default: the decide write succeeds and returns the flipped row.
  vi.mocked(decideCaptainPromotion).mockImplementation(
    async ({ requestId, status }) => sentRow({ id: requestId, status }) as never,
  );
});

describe("acceptCaptainPromotionAction", () => {
  it("flips the target's rank to captain — only on accept, only after decide succeeds", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: true });
    expect(decideCaptainPromotion).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      status: "accepted",
    });
    expect(setCampUserRank).toHaveBeenCalledExactlyOnceWith(TARGET, "captain");
    // Home (rank-grouped IA), the acceptance surface, and the roster all reflect it.
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("rejects when the actor isn't camp-active yet (the shared gate)", async () => {
    signInAs(TARGET);
    vi.mocked(hasCampAccess).mockReturnValue(false);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("treats an orphaned (audit-null) REQUESTER as gone, before the guard", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ requestedByUserId: null }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("refuses a non-target actor and never decides or flips rank", async () => {
    signInAs(REQUESTER); // the requester can't accept their own outgoing request
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Only the recipient can respond to this request.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("is a no-op on double-accept (decide returns null) — no rank flip", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(decideCaptainPromotion).mockResolvedValue(null);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("refuses accept on a declined/cancelled request (request_not_open)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ status: "declined" }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("self-heals: the target re-accepting an already-accepted request re-applies rank (idempotent), no re-flip", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ status: "accepted" }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: true });
    // No second flip — the row is already accepted...
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
    // ...but the rank write is (re)applied, recovering a prior partial failure.
    expect(setCampUserRank).toHaveBeenCalledExactlyOnceWith(TARGET, "captain");
  });

  it("does NOT self-heal for a non-target on an accepted row (no rank write)", async () => {
    signInAs("stranger");
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ status: "accepted" }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
    expect(setCampUserRank).not.toHaveBeenCalled();
  });

  it("surfaces a post-flip rank-write failure (recoverable via the self-heal retry)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(setCampUserRank).mockRejectedValueOnce(new Error("db down"));

    await expect(acceptCaptainPromotionAction(REQUEST_ID)).rejects.toThrow();
    // The row flipped (decide ran) and the rank write was attempted; the
    // accepted-but-not-promoted state is recovered by re-accepting (self-heal).
    expect(decideCaptainPromotion).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      status: "accepted",
    });
    expect(setCampUserRank).toHaveBeenCalledWith(TARGET, "captain");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an orphaned (audit-null) row as gone, before the guard", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ targetUserId: null }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await acceptCaptainPromotionAction(REQUEST_ID);
    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
  });

  it("rejects when the request id doesn't resolve", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(null);
    const res = await acceptCaptainPromotionAction(REQUEST_ID);
    expect(res).toEqual({ ok: false, error: "Request not found." });
  });
});

describe("declineCaptainPromotionAction", () => {
  it("lets the target decline — terminal, never flips rank", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: true });
    expect(decideCaptainPromotion).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      status: "declined",
    });
    expect(setCampUserRank).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("refuses a non-target decline", async () => {
    signInAs("stranger");
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Only the recipient can respond to this request.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses an already-terminal request (request_not_open)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ status: "declined" }) as never,
    );

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("is a no-op on a lost race (decide returns null)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(decideCaptainPromotion).mockResolvedValue(null);

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
  });

  it("treats an orphaned (audit-null) requester as gone", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ requestedByUserId: null }) as never,
    );

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("treats an orphaned (audit-null) target as gone", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ targetUserId: null }) as never,
    );

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });
});

describe("cancelCaptainPromotionAction", () => {
  it("lets the requester cancel — terminal, never flips rank", async () => {
    signInAs(REQUESTER);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await cancelCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: true });
    expect(decideCaptainPromotion).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      status: "cancelled",
    });
    expect(setCampUserRank).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
  });

  it("refuses cancel by the target (cancel is the requester's)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await cancelCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Only the requester can cancel this request.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses an already-terminal request (request_not_open)", async () => {
    signInAs(REQUESTER);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ status: "cancelled" }) as never,
    );

    const res = await cancelCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("is a no-op on a lost race (decide returns null)", async () => {
    signInAs(REQUESTER);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(decideCaptainPromotion).mockResolvedValue(null);

    const res = await cancelCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "This request is no longer open." });
  });

  it("treats an orphaned (audit-null) requester as gone", async () => {
    signInAs(REQUESTER);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ requestedByUserId: null }) as never,
    );

    const res = await cancelCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });
});
