import { beforeEach, describe, expect, it, vi } from "vitest";

// sendPasswordResetLinkAction (owner's mock-up, step 7): captains only, a
// rate limit per member and per captain, the audit row BEFORE the email, and
// the same Better Auth reset email "Forgot password" sends.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  isTeamLead: vi.fn(async () => false),
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
vi.mock("@/lib/password-reset", () => ({
  recordPasswordResetLink: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => false,
  isE2ETestMode: () => false,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("@camp404/auth", () => ({
  auth: { api: { requestPasswordReset: vi.fn() } },
  authMayServe: vi.fn(() => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth, authMayServe } from "@camp404/auth";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordPasswordResetLink } from "@/lib/password-reset";
import { rateLimiter } from "@/lib/rate-limit";
import { ensureCampUser } from "@/lib/users";
import { sendPasswordResetLinkAction } from "./actions";
import { RESET_COPY } from "./reset-copy";

const CAPTAIN = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

function signIn(rank: "captain" | "member") {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-x",
    primaryEmail: "x@example.com",
    displayName: "X",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: rank === "captain" ? CAPTAIN : "lead-1",
    rank,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authMayServe).mockReturnValue(true);
  vi.mocked(rateLimiter.limit).mockResolvedValue({
    ok: true,
    retryAfterSeconds: 0,
  });
  vi.mocked(recordPasswordResetLink).mockResolvedValue({
    ok: true,
    email: "lerato@example.com",
  });
  vi.mocked(auth.api.requestPasswordReset).mockResolvedValue({
    status: true,
  } as never);
});

describe("sendPasswordResetLinkAction", () => {
  it("records the send first, then asks Better Auth for its reset email", async () => {
    signIn("captain");
    const order: string[] = [];
    vi.mocked(recordPasswordResetLink).mockImplementation(async () => {
      order.push("audit");
      return { ok: true, email: "lerato@example.com" };
    });
    vi.mocked(auth.api.requestPasswordReset).mockImplementation((async () => {
      order.push("email");
      return { status: true };
    }) as never);

    const res = await sendPasswordResetLinkAction(MEMBER);
    expect(res).toMatchObject({ ok: true });
    expect(order).toEqual(["audit", "email"]);
    expect(recordPasswordResetLink).toHaveBeenCalledWith({
      actorId: CAPTAIN,
      userId: MEMBER,
    });
    expect(auth.api.requestPasswordReset).toHaveBeenCalledWith({
      body: { email: "lerato@example.com", redirectTo: "/auth/reset-password" },
    });
  });

  it("refuses anyone below captain before anything is written", async () => {
    signIn("member");
    const res = await sendPasswordResetLinkAction(MEMBER);
    expect(res.ok).toBe(false);
    expect(recordPasswordResetLink).not.toHaveBeenCalled();
    expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("stops at the rate limit, with nothing written or sent", async () => {
    signIn("captain");
    vi.mocked(rateLimiter.limit).mockResolvedValueOnce({
      ok: false,
      retryAfterSeconds: 600,
    });
    expect(await sendPasswordResetLinkAction(MEMBER)).toEqual({
      ok: false,
      error: RESET_COPY.tooMany,
    });
    expect(recordPasswordResetLink).not.toHaveBeenCalled();
    expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("sends nothing when the record refuses (an erased member)", async () => {
    signIn("captain");
    vi.mocked(recordPasswordResetLink).mockResolvedValue({
      ok: false,
      error: "They have no sign-in to reset.",
    });
    expect(await sendPasswordResetLinkAction(MEMBER)).toEqual({
      ok: false,
      error: "They have no sign-in to reset.",
    });
    expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("says so when the email fails", async () => {
    signIn("captain");
    vi.mocked(auth.api.requestPasswordReset).mockRejectedValue(
      new Error("down"),
    );
    expect(await sendPasswordResetLinkAction(MEMBER)).toEqual({
      ok: false,
      error: RESET_COPY.sendFailed,
    });
  });

  it("refuses on a deployment whose sign-in is off", async () => {
    signIn("captain");
    vi.mocked(authMayServe).mockReturnValue(false);
    expect(await sendPasswordResetLinkAction(MEMBER)).toEqual({
      ok: false,
      error: RESET_COPY.signInOff,
    });
    expect(recordPasswordResetLink).not.toHaveBeenCalled();
  });
});
