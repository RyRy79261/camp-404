import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for getMemberDetailAction's promotion surfacing (canAssignCaptain +
// promotionStep). The pure guard/step-state come from @camp404/core (left REAL);
// the DB + presenter collaborators are mocked.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getOpenPromotionForTarget: vi.fn(),
  sendCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({ decryptOrNull: vi.fn(() => null) }));
vi.mock("@camp404/db/id-documents", () => ({ mergeIdNumber: vi.fn(() => ({})) }));
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

import { getMemberDetailAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { getOpenPromotionForTarget } from "@/lib/promotion";
import { getCampMemberDetail } from "@camp404/db/roster";

const CAPTAIN = "cap-1";

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

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    rank: "member",
    responses: {},
    passportEncrypted: null,
    saIdEncrypted: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(getOpenPromotionForTarget).mockResolvedValue(null);
});

describe("getMemberDetailAction — promotion surfacing", () => {
  it("allows assigning captain to a non-captain member with no open request", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.canAssignCaptain).toBe(true);
    expect(res.promotionStep).toEqual({ sent: false, accepted: false });
  });

  it("surfaces an in-flight request as the sent step", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    vi.mocked(getOpenPromotionForTarget).mockResolvedValue({
      status: "sent",
    } as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.promotionStep).toEqual({ sent: true, accepted: false });
  });

  it("hides assign-captain for a member who is already a captain", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(
      detail({ rank: "captain" }) as never,
    );

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.canAssignCaptain).toBe(false);
  });

  it("hides assign-captain when the captain views their own row", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(
      detail({ id: CAPTAIN, rank: "captain" }) as never,
    );

    const res = await getMemberDetailAction(CAPTAIN);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.canAssignCaptain).toBe(false);
  });

  it("refuses a non-captain viewer", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-m",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "m-1",
      rank: "member",
    } as never);

    const res = await getMemberDetailAction("member-1");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(getOpenPromotionForTarget).not.toHaveBeenCalled();
  });

  it("rejects when the member isn't found", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(null as never);

    const res = await getMemberDetailAction("ghost");

    expect(res).toEqual({ ok: false, error: "Member not found." });
  });
});

describe("getMemberDetailAction — open request id", () => {
  it("surfaces the open request id + ownership for the dialog's cancel action", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    vi.mocked(getOpenPromotionForTarget).mockResolvedValue({
      id: "req-9",
      status: "sent",
      requestedByUserId: CAPTAIN,
    } as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.promotionRequestId).toBe("req-9");
    expect(res.promotionRequestIsMine).toBe(true);
    expect(res.promotionStep).toEqual({ sent: true, accepted: false });
  });

  it("flags a request another captain sent as not mine", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    vi.mocked(getOpenPromotionForTarget).mockResolvedValue({
      id: "req-9",
      status: "sent",
      requestedByUserId: "other-captain",
    } as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.promotionRequestIsMine).toBe(false);
  });

  it("is null / not-mine when there is no open request", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.promotionRequestId).toBeNull();
    expect(res.promotionRequestIsMine).toBe(false);
  });
});
