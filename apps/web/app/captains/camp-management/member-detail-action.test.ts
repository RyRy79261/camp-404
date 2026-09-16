import { beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it is erased before the vi.mock factories hoist above it.
import type * as IdDocumentsModule from "@camp404/db/id-documents";

// Unit tests for getMemberDetailAction's promotion surfacing (canAssignCaptain +
// promotionStep). The pure guard/step-state come from @camp404/core (left REAL);
// the DB + presenter collaborators are mocked.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getOpenPromotionForTarget: vi.fn(),
  sendCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({
  decryptOrNull: vi.fn(() => null),
  decryptField: vi.fn(() => ({ state: "absent", value: null })),
}));
vi.mock("@camp404/db/id-documents", async (importOriginal) => ({
  // Spread the real module: actions.ts also reads ID_UNREADABLE_LABEL from
  // here, and a factory that omits it throws the moment a test drives
  // decryptField to "unreadable".
  ...(await importOriginal<typeof IdDocumentsModule>()),
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
vi.mock("@camp404/db/team-memberships", () => ({
  assignTeam: vi.fn(),
  removeTeam: vi.fn(),
  setLead: vi.fn(),
  getTeamMemberships: vi.fn(async () => []),
}));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({ teams: [] })),
  activeTeams: () => [],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getMemberDetailAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { deriveViewerRank, hasClearance } from "@camp404/core";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getOpenPromotionForTarget } from "@/lib/promotion";
import { getCampMemberDetail } from "@camp404/db/roster";
import { decryptField } from "@camp404/db/crypto";

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
  vi.mocked(isApproved).mockReturnValue(true);
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
    // The captain modal is the ONLY read allowed to pull the ID ciphertext out
    // of Postgres; a dropped flag would silently blank the ID field instead.
    expect(getCampMemberDetail).toHaveBeenCalledExactlyOnceWith("member-1", {
      includeIdDocuments: true,
    });
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

  it("keeps a genuine team lead out of the ID decrypt path", () => {
    // A team lead is stored as `member` (lead-ness is derived from
    // team_memberships.is_lead), so the refusal above is already a real lead's
    // session. This pins the OTHER half — that requireCaptain's bar is
    // `captain` — so swapping the hardcoded `false` for the real isTeamLead
    // flag could not open the government-ID decrypt path to a lead.
    expect(deriveViewerRank("member", true)).toBe("team_lead");
    expect(hasClearance("team_lead", "captain")).toBe(false);
  });

  it("does not care whether the TARGET leads a team", async () => {
    // `targetRank: deriveViewerRank(detail.rank, false)` is bucket (c): the rank
    // of the person being acted on, not the actor. canSendPromotion asks it one
    // question — "already a captain?" — so a member who leads a team is exactly
    // as promotable as one who doesn't, and passing the real flag here would
    // change nothing but the query count.
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.canAssignCaptain).toBe(true);
    // Both derivations of a `member` row clear the guard identically.
    expect(deriveViewerRank("member", false)).not.toBe("captain");
    expect(deriveViewerRank("member", true)).not.toBe("captain");
  });

  it("rejects when the member isn't found", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(null as never);

    const res = await getMemberDetailAction("ghost");

    expect(res).toEqual({ ok: false, error: "Member not found." });
  });
});

describe("getMemberDetailAction — approval gate", () => {
  // A captain+pending row is reachable through the product UI (the roster
  // offers assign-captain on a member still in the vetting queue, and accepting
  // flips rank without touching approval status), and this action decrypts SA
  // ID / passport numbers. The refusal has to land before the read.

  it("refuses a captain still awaiting approval and never decrypts", async () => {
    signInAsCaptain();
    vi.mocked(isApproved).mockReturnValue(false);
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);

    const res = await getMemberDetailAction("member-1");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    // Not merely an error-shaped response: the government-ID ciphertext is
    // never SELECTed and never decrypted for a caller held behind vetting.
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("rejects a malformed member id before the privileged read", async () => {
    // This was the only action in the file without the opaque-id boundary
    // check its four siblings have — and the only one that passes
    // `includeIdDocuments: true`. An unvalidated id failed closed at the
    // lookup, so nothing leaked; the guard makes that the contract rather
    // than an accident of the query.
    signInAsCaptain();

    const res = await getMemberDetailAction("");

    expect(res).toEqual({ ok: false, error: "Member not found." });
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("refuses a rejected captain — isApproved is the single comparator", async () => {
    signInAsCaptain();
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: CAPTAIN,
      rank: "captain",
      approvalStatus: "rejected",
    } as never);
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await getMemberDetailAction("member-1");

    expect(res).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    // One comparator covers pending AND rejected (and exempts god emails).
    expect(isApproved).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "rejected" }),
      "cap@example.com",
    );
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(decryptField).not.toHaveBeenCalled();
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
