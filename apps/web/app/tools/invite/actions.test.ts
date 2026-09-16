import { beforeEach, describe, expect, it, vi } from "vitest";

// createInviteAction — the in-app invite minter. The page redirects a pending
// user to /pending-approval, but the action is a directly-POSTable endpoint, so
// the approval gate has to hold here too (spec 11-invite-tool: "signed-in,
// camp-active, approved"). The DB writer and the code generator are mocked; the
// gate and the captain-only knobs are what these assert.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/member-gate", () => ({ memberBlock: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@camp404/db/invite-codes", () => ({
  createInviteCode: vi.fn(),
  findInviteCodeByCode: vi.fn(),
  revokeInviteCode: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/invite-words", () => ({
  generateInviteCode: vi.fn(() => "amber-fox-7"),
  isSyntacticallyValidCode: vi.fn(() => true),
  normalizeInviteCode: (raw: string) => raw.trim().toLowerCase(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })) },
}));

import { createInviteAction, revokeInviteAction } from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { memberBlock } from "@/lib/member-gate";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  createInviteCode,
  findInviteCodeByCode,
  revokeInviteCode,
} from "@camp404/db/invite-codes";
import { rateLimiter } from "@/lib/rate-limit";

function signIn(rank: "captain" | "member", id = "user-1") {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "u@example.com",
    displayName: "U",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id, rank } as never);
}

function form(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(memberBlock).mockResolvedValue(null);
  vi.mocked(findInviteCodeByCode).mockResolvedValue(null);
  vi.mocked(rateLimiter.limit).mockReturnValue({
    ok: true,
    retryAfterSeconds: 0,
  });
});

describe("createInviteAction — approval gate", () => {
  it("refuses a member awaiting approval and mints nothing", async () => {
    signIn("member");
    vi.mocked(memberBlock).mockResolvedValue({
      reason: "approval",
      href: "/pending-approval",
    });

    const res = await createInviteAction(null, form({ code: "amber-fox-7" }));

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    // The refusal precedes every write — no row, and not even a lookup.
    expect(createInviteCode).not.toHaveBeenCalled();
    expect(findInviteCodeByCode).not.toHaveBeenCalled();
  });

  it("refuses a pending CAPTAIN minting a pre-approved multi-use code", async () => {
    signIn("captain");
    vi.mocked(memberBlock).mockResolvedValue({
      reason: "approval",
      href: "/pending-approval",
    });

    const res = await createInviteAction(
      null,
      form({ code: "amber-fox-7", preApprove: "on", maxUses: "100" }),
    );

    // The escalation this closes: `isCaptain` is rank-only, so without the gate
    // a captain held behind vetting could mint 100 codes whose redeemers skip
    // vetting entirely.
    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(createInviteCode).not.toHaveBeenCalled();
  });

  it("refuses a caller who isn't camp-active yet", async () => {
    signIn("member");
    vi.mocked(memberBlock).mockResolvedValue({
      reason: "invite",
      href: "/signup/required",
    });

    const res = await createInviteAction(null, form({ code: "amber-fox-7" }));

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(createInviteCode).not.toHaveBeenCalled();
  });

  it("refuses a member with a blocking questionnaire still to answer", async () => {
    signIn("member");
    vi.mocked(memberBlock).mockResolvedValue({
      reason: "questionnaire",
      href: "/questionnaires/act-1",
    });

    const res = await createInviteAction(null, form({ code: "amber-fox-7" }));

    expect(res).toEqual({
      ok: false,
      error: "Finish the questionnaire you've been asked to answer first.",
    });
    expect(createInviteCode).not.toHaveBeenCalled();
    expect(findInviteCodeByCode).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await createInviteAction(null, form({ code: "amber-fox-7" }));

    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(ensureCampUser).not.toHaveBeenCalled();
    expect(createInviteCode).not.toHaveBeenCalled();
  });

  it("still mints for an approved member (the gate refuses only the unapproved)", async () => {
    signIn("member", "member-9");

    const res = await createInviteAction(
      null,
      form({ code: "amber-fox-7", note: "Sam" }),
    );

    expect(res).toEqual({
      ok: true,
      code: "amber-fox-7",
      recipientName: "Sam",
      maxUses: 1,
      requiresApproval: true,
    });
    expect(createInviteCode).toHaveBeenCalledExactlyOnceWith({
      code: "amber-fox-7",
      createdByUserId: "member-9",
      note: "Sam",
      maxUses: 1,
      assignedRank: null,
      requiresApproval: true,
    });
  });

  it("still lets an approved captain pre-approve a multi-use code", async () => {
    signIn("captain", "captain-9");

    const res = await createInviteAction(
      null,
      form({ code: "amber-fox-7", preApprove: "on", maxUses: "12" }),
    );

    expect(res).toEqual({
      ok: true,
      code: "amber-fox-7",
      recipientName: null,
      maxUses: 12,
      requiresApproval: false,
    });
    expect(createInviteCode).toHaveBeenCalledExactlyOnceWith({
      code: "amber-fox-7",
      createdByUserId: "captain-9",
      note: null,
      maxUses: 12,
      assignedRank: null,
      requiresApproval: false,
    });
  });
});

describe("createInviteAction — throttling", () => {
  it("throttles minting per member and says when to try again", async () => {
    signIn("member", "user-9");
    vi.mocked(rateLimiter.limit).mockReturnValue({
      ok: false,
      retryAfterSeconds: 130,
    });

    const res = await createInviteAction(null, form());

    expect(rateLimiter.limit).toHaveBeenCalledWith("invite-create:user-9", {
      limit: 10,
      windowMs: 600_000,
    });
    expect(res).toEqual({
      ok: false,
      error: "You've made a lot of invites just now. Try again in 3 minutes.",
    });
    expect(createInviteCode).not.toHaveBeenCalled();
  });

  it("stores a typed code in lowercase", async () => {
    signIn("captain");
    vi.mocked(createInviteCode).mockResolvedValue({
      code: "berlin-crew",
    } as never);
    await createInviteAction(null, form({ code: "  Berlin-Crew " }));
    expect(findInviteCodeByCode).toHaveBeenCalledWith("berlin-crew");
    expect(createInviteCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "berlin-crew" }),
    );
  });
});

describe("revokeInviteAction", () => {
  it("lets a member revoke only codes they made, scoped in the write", async () => {
    signIn("member", "member-1");
    vi.mocked(revokeInviteCode).mockResolvedValue(true);

    expect(await revokeInviteAction(" Amber-Fox-7 ")).toEqual({ ok: true });
    expect(revokeInviteCode).toHaveBeenCalledWith({
      code: "amber-fox-7",
      actorUserId: "member-1",
      createdByUserId: "member-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tools/invite");
  });

  it("lets a captain revoke any code", async () => {
    signIn("captain", "captain-1");
    vi.mocked(revokeInviteCode).mockResolvedValue(true);

    expect(await revokeInviteAction("meowzit")).toEqual({ ok: true });
    expect(revokeInviteCode).toHaveBeenCalledWith({
      code: "meowzit",
      actorUserId: "captain-1",
      createdByUserId: undefined,
    });
  });

  it("says why a revoke wrote nothing", async () => {
    signIn("member", "member-1");
    vi.mocked(revokeInviteCode).mockResolvedValue(false);

    vi.mocked(findInviteCodeByCode).mockResolvedValue(null);
    expect(await revokeInviteAction("amber-fox-7")).toEqual({
      ok: false,
      error: "That code doesn't exist.",
    });

    vi.mocked(findInviteCodeByCode).mockResolvedValue({
      revokedAt: new Date(),
    } as never);
    expect(await revokeInviteAction("amber-fox-7")).toEqual({
      ok: false,
      error: "That code is already revoked.",
    });

    vi.mocked(findInviteCodeByCode).mockResolvedValue({
      revokedAt: null,
      createdByUserId: "someone-else",
    } as never);
    expect(await revokeInviteAction("amber-fox-7")).toEqual({
      ok: false,
      error: "Only the person who made this code, or a captain, can revoke it.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("holds the same gate as the page: signed in, camp-active, approved", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await revokeInviteAction("amber-fox-7")).ok).toBe(false);

    signIn("captain");
    vi.mocked(isApproved).mockReturnValue(false);
    expect(await revokeInviteAction("amber-fox-7")).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(revokeInviteCode).not.toHaveBeenCalled();
  });
});
