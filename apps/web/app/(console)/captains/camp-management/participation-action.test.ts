import { beforeEach, describe, expect, it, vi } from "vitest";

// decideParticipationAction: a captain's one-tap Accept / Waiting list for
// this year. Covers the captain gate (a team lead is refused: the bar is
// captain), the boundary (only a move `isParticipationDecision` allows), and
// the compare-and-set: a member who changed their answer while the captain was
// looking is not overwritten, and the captain is told so by name.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  isTeamLead: vi.fn(async () => false),
  decideUserApproval: vi.fn(),
  findCampUserById: vi.fn(),
}));
vi.mock("@/lib/participations", () => ({ decideParticipation: vi.fn() }));
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

import { decideParticipationAction } from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { decideParticipation } from "@/lib/participations";
import { ensureCampUser, findCampUserById, isTeamLead } from "@/lib/users";

const CAPTAIN = "cap-1";

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
  vi.mocked(isTeamLead).mockResolvedValue(false);
  vi.mocked(decideParticipation).mockResolvedValue(true);
  vi.mocked(findCampUserById).mockImplementation(
    async (id: string) =>
      ({ id, rank: "member", displayName: "Nova Reyes" }) as never,
  );
});

describe("decideParticipationAction", () => {
  it("accepts a member who said Coming, stamping the deciding captain", async () => {
    signIn("captain");

    const res = await decideParticipationAction({
      userId: "member-1",
      from: "applied",
      to: "accepted",
    });

    expect(res).toEqual({ ok: true });
    expect(decideParticipation).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      from: "applied",
      to: "accepted",
      decidedByUserId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
    expect(revalidatePath).toHaveBeenCalledWith("/captains/overview");
  });

  it("refuses a team lead: they see the status, they do not decide it", async () => {
    signIn("member");
    vi.mocked(isTeamLead).mockResolvedValue(true);

    const res = await decideParticipationAction({
      userId: "member-1",
      from: "applied",
      to: "accepted",
    });

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(decideParticipation).not.toHaveBeenCalled();
  });

  it("refuses to accept a member who said No", async () => {
    signIn("captain");

    const res = await decideParticipationAction({
      userId: "member-1",
      from: "not_attending",
      to: "accepted",
    });

    expect(res.ok).toBe(false);
    expect(decideParticipation).not.toHaveBeenCalled();
  });

  it("refuses a status that is not one", async () => {
    signIn("captain");

    const res = await decideParticipationAction({
      userId: "member-1",
      from: "applied",
      to: "promoted",
    });

    expect(res).toEqual({ ok: false, error: "Unknown decision." });
    expect(decideParticipation).not.toHaveBeenCalled();
  });

  it("tells the captain by name when the answer moved first (lost race)", async () => {
    signIn("captain");
    vi.mocked(decideParticipation).mockResolvedValue(false);

    const res = await decideParticipationAction({
      userId: "member-1",
      from: "maybe",
      to: "waitlisted",
    });

    expect(res).toEqual({
      ok: false,
      error:
        "Nova Reyes's answer changed while you were looking. Refresh to see it.",
    });
    // The roster the captain is looking at is stale: refresh it anyway.
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });
});
