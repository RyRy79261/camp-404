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
  isApproved: vi.fn(() => true),
  setCampUserRank: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  acceptCaptainPromotion: vi.fn(),
  getPromotionRequestById: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  listInbox: vi.fn(),
  markRead: vi.fn(),
}));

import {
  acceptCaptainPromotionAction,
  declineCaptainPromotionAction,
  loadOlderNotificationsAction,
} from "./actions";
import { listInbox, markRead } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  isApproved,
  setCampUserRank,
} from "@/lib/users";
import {
  acceptCaptainPromotion,
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
  vi.mocked(isApproved).mockReturnValue(true);
  // Default: the decide write succeeds and returns the flipped row.
  vi.mocked(decideCaptainPromotion).mockImplementation(
    async ({ requestId, status }) =>
      sentRow({ id: requestId, status }) as never,
  );
  vi.mocked(acceptCaptainPromotion).mockImplementation(
    async ({ requestId }) =>
      sentRow({ id: requestId, status: "accepted" }) as never,
  );
});

describe("acceptCaptainPromotionAction", () => {
  it("accepts as the target, in one step that also makes them captain", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: true });
    expect(acceptCaptainPromotion).toHaveBeenCalledExactlyOnceWith({
      requestId: REQUEST_ID,
      actorUserId: TARGET,
    });
    // The rank write is inside acceptCaptainPromotion's transaction now.
    expect(setCampUserRank).not.toHaveBeenCalled();
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
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
    expect(acceptCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses a pending applicant, so a rank change never lands on them", async () => {
    signInAs(TARGET);
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(acceptCaptainPromotion).not.toHaveBeenCalled();
  });

  it("refuses a non-target actor and never accepts", async () => {
    signInAs("stranger");
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "Only the recipient can respond to this request.",
    });
    expect(acceptCaptainPromotion).not.toHaveBeenCalled();
  });

  it("says the request is closed when the accept loses a race", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(acceptCaptainPromotion).mockResolvedValue(null);

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "This request is no longer open.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses accept on an already-decided request (request_not_open)", async () => {
    signInAs(TARGET);
    for (const status of ["accepted", "declined", "cancelled"]) {
      vi.mocked(getPromotionRequestById).mockResolvedValue(
        sentRow({ status }) as never,
      );
      expect(await acceptCaptainPromotionAction(REQUEST_ID)).toEqual({
        ok: false,
        error: "This request is no longer open.",
      });
    }
    expect(acceptCaptainPromotion).not.toHaveBeenCalled();
  });

  it("treats an orphaned (audit-null) row as gone, before the guard", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(
      sentRow({ targetUserId: null }) as never,
    );

    const res = await acceptCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({ ok: false, error: "Request no longer available." });
    expect(acceptCaptainPromotion).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await acceptCaptainPromotionAction(REQUEST_ID);
    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(getPromotionRequestById).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) request id at the boundary, before any work", async () => {
    signInAs(TARGET);
    const res = await acceptCaptainPromotionAction("");
    expect(res).toEqual({ ok: false, error: "Invalid request." });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
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
      actorUserId: TARGET,
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

    expect(res).toEqual({
      ok: false,
      error: "This request is no longer open.",
    });
    expect(decideCaptainPromotion).not.toHaveBeenCalled();
  });

  it("is a no-op on a lost race (decide returns null)", async () => {
    signInAs(TARGET);
    vi.mocked(getPromotionRequestById).mockResolvedValue(sentRow() as never);
    vi.mocked(decideCaptainPromotion).mockResolvedValue(null);

    const res = await declineCaptainPromotionAction(REQUEST_ID);

    expect(res).toEqual({
      ok: false,
      error: "This request is no longer open.",
    });
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

describe("loadOlderNotificationsAction", () => {
  const CURSOR =
    "2026-09-16T09:00:00.500000~7f5e2f7a-6f50-4c89-8df9-2f7b8f3dc31e";

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "m@example.com",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(listInbox).mockReset();
    vi.mocked(markRead).mockReset();
  });

  it("returns the older page and marks exactly its rows read", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [{ id: "d1" }, { id: "d2" }] as never,
      nextCursor: null,
    });
    const result = await loadOlderNotificationsAction(CURSOR);
    expect(result).toEqual({
      ok: true,
      data: { items: [{ id: "d1" }, { id: "d2" }], nextCursor: null },
    });
    expect(listInbox).toHaveBeenCalledWith("user-1", { before: CURSOR });
    expect(markRead).toHaveBeenCalledWith("user-1", ["d1", "d2"]);
  });

  it("reads nothing for a signed-out caller, no camp access, or a junk cursor", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await loadOlderNotificationsAction(CURSOR)).ok).toBe(false);

    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "a" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect((await loadOlderNotificationsAction(CURSOR)).ok).toBe(false);

    vi.mocked(hasCampAccess).mockReturnValue(true);
    expect((await loadOlderNotificationsAction("")).ok).toBe(false);
    expect((await loadOlderNotificationsAction("x".repeat(101))).ok).toBe(
      false,
    );

    expect(listInbox).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
  });
});
