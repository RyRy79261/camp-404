import { beforeEach, describe, expect, it, vi } from "vitest";

// createInviteAction — the in-app invite minter. The page redirects a pending
// user to /pending-approval, but the action is a directly-POSTable endpoint, so
// the approval gate has to hold here too (spec 11-invite-tool: "signed-in,
// camp-active, approved"). The DB writer and the code generator are mocked; the
// gate and the captain-only knobs are what these assert.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@camp404/db/invite-codes", () => ({
  createInviteCode: vi.fn(),
  findInviteCodeByCode: vi.fn(),
}));
vi.mock("@/lib/invite-words", () => ({
  generateInviteCode: vi.fn(() => "amber-fox-7"),
  isSyntacticallyValidCode: vi.fn(() => true),
}));

import { createInviteAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { createInviteCode, findInviteCodeByCode } from "@camp404/db/invite-codes";

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
  vi.mocked(findInviteCodeByCode).mockResolvedValue(null);
});

describe("createInviteAction — approval gate", () => {
  it("refuses a member awaiting approval and mints nothing", async () => {
    signIn("member");
    vi.mocked(isApproved).mockReturnValue(false);

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
    vi.mocked(isApproved).mockReturnValue(false);

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
    vi.mocked(hasCampAccess).mockReturnValue(false);

    const res = await createInviteAction(null, form({ code: "amber-fox-7" }));

    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(createInviteCode).not.toHaveBeenCalled();
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
