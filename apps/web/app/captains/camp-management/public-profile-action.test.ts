import { beforeEach, describe, expect, it, vi } from "vitest";

// getPublicMemberProfileAction — the member-facing public card. Gated to approved
// camp members (NOT captains); returns an allowlisted projection. The pure
// `presentPublicMember` is left REAL so the bio/contribution allowlist (and the
// rejection of every private answer) is exercised end to end.

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
vi.mock("@camp404/db/crypto", () => ({ decryptOrNull: vi.fn(() => null) }));
vi.mock("@camp404/db/id-documents", () => ({ mergeIdNumber: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPublicMemberProfileAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getCampMemberDetail } from "@camp404/db/roster";

function signInAsMember() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-m",
    primaryEmail: "m@example.com",
    displayName: "M",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "member-1",
    rank: "member",
    approvalStatus: "approved",
    inviteCode: "code",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
});

describe("getPublicMemberProfileAction", () => {
  it("returns ONLY bio + contribution, dropping every private answer", async () => {
    signInAsMember();
    vi.mocked(getCampMemberDetail).mockResolvedValue({
      responses: {
        "bio.statement": "Darkroom in Cape Town.",
        "ideas.this_year": "Analog photo lab.",
        "id.number": "A0148822",
        email: "secret@example.com",
        "dietary.needs": "vegan",
      },
    } as never);

    const res = await getPublicMemberProfileAction("target-1");

    expect(res).toEqual({
      ok: true,
      bio: "Darkroom in Cape Town.",
      contribution: "Analog photo lab.",
    });
  });

  it("refuses an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await getPublicMemberProfileAction("target-1");
    expect(res).toEqual({ ok: false, error: "Not signed in." });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
  });

  it("refuses a caller who isn't camp-active", async () => {
    signInAsMember();
    vi.mocked(hasCampAccess).mockReturnValue(false);
    const res = await getPublicMemberProfileAction("target-1");
    expect(res).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
  });

  it("refuses an unapproved caller", async () => {
    signInAsMember();
    vi.mocked(isApproved).mockReturnValue(false);
    const res = await getPublicMemberProfileAction("target-1");
    expect(res).toEqual({
      ok: false,
      error: "Your account isn't approved yet.",
    });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
  });

  it("rejects a malformed (empty) id at the boundary", async () => {
    signInAsMember();
    const res = await getPublicMemberProfileAction("");
    expect(res).toEqual({ ok: false, error: "Invalid member." });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
  });

  it("returns not-found when the member is missing", async () => {
    signInAsMember();
    vi.mocked(getCampMemberDetail).mockResolvedValue(null as never);
    const res = await getPublicMemberProfileAction("ghost");
    expect(res).toEqual({ ok: false, error: "Member not found." });
  });

  it("stays an allowlist even for a captain viewer (no widening by rank)", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-c",
      primaryEmail: "c@example.com",
      displayName: "C",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "captain-1",
      rank: "captain",
      approvalStatus: "approved",
      inviteCode: "code",
    } as never);
    vi.mocked(getCampMemberDetail).mockResolvedValue({
      responses: {
        "bio.statement": "Bio.",
        "ideas.this_year": "Ideas.",
        email: "secret@example.com",
        "id.number": "A0148822",
      },
    } as never);

    const res = await getPublicMemberProfileAction("target-1");

    expect(res).toEqual({ ok: true, bio: "Bio.", contribution: "Ideas." });
  });
});
