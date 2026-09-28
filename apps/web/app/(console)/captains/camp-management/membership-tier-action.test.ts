import { beforeEach, describe, expect, it, vi } from "vitest";

// setMembershipTierAction: a captain sets how long a member stays (#129).
// Covers the captain gate (a team lead is refused: the bar is captain), the
// Zod boundary (only the two stored values, and a real change), and the
// compare-and-set: a value that changed while the captain was looking is not
// overwritten, and the captain is told so by name.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  isTeamLead: vi.fn(async () => false),
  decideUserApproval: vi.fn(),
  findCampUserById: vi.fn(),
}));
vi.mock("@/lib/roster", () => ({ setMembershipTier: vi.fn() }));
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

import { setMembershipTierAction } from "./actions";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { setMembershipTier } from "@/lib/roster";
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
  vi.mocked(setMembershipTier).mockResolvedValue(true);
  vi.mocked(findCampUserById).mockImplementation(
    async (id: string) =>
      ({ id, rank: "member", displayName: "Nova Reyes" }) as never,
  );
});

describe("setMembershipTierAction", () => {
  it("sets a tier that was not set, as the acting captain", async () => {
    signIn("captain");

    const res = await setMembershipTierAction({
      userId: "member-1",
      from: null,
      to: "build_week_only",
    });

    expect(res).toEqual({ ok: true });
    expect(setMembershipTier).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      from: null,
      to: "build_week_only",
      actorId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("refuses a team lead", async () => {
    signIn("member");
    vi.mocked(isTeamLead).mockResolvedValue(true);

    const res = await setMembershipTierAction({
      userId: "member-1",
      from: null,
      to: "full",
    });

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(setMembershipTier).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    signIn("member");

    const res = await setMembershipTierAction({
      userId: "member-1",
      from: null,
      to: "full",
    });

    expect(res.ok).toBe(false);
    expect(setMembershipTier).not.toHaveBeenCalled();
  });

  it("refuses a value that is not a tier, and a change to the same value", async () => {
    signIn("captain");

    for (const input of [
      { userId: "member-1", from: null, to: "gold" },
      { userId: "member-1", from: "platinum", to: "full" },
      { userId: "member-1", from: "full", to: "full" },
      { userId: "", from: null, to: "full" },
    ]) {
      expect(await setMembershipTierAction(input)).toEqual({
        ok: false,
        error: "Unknown choice.",
      });
    }
    expect(setMembershipTier).not.toHaveBeenCalled();
  });

  it("tells the captain by name when the value moved first (lost race)", async () => {
    signIn("captain");
    vi.mocked(setMembershipTier).mockResolvedValue(false);

    const res = await setMembershipTierAction({
      userId: "member-1",
      from: "full",
      to: "build_week_only",
    });

    expect(res).toEqual({
      ok: false,
      error:
        "Nova Reyes's stay changed while you were looking. Refresh to see it.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("refuses a member who is not there", async () => {
    signIn("captain");
    vi.mocked(findCampUserById).mockResolvedValue(null as never);

    const res = await setMembershipTierAction({
      userId: "ghost",
      from: null,
      to: "full",
    });

    expect(res).toEqual({ ok: false, error: "Member not found." });
    expect(setMembershipTier).not.toHaveBeenCalled();
  });
});
