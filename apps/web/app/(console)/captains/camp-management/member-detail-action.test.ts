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
  findCampUserById: vi.fn(async (id: string) => ({ id, rank: "member" })),
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
vi.mock("@/lib/audit", () => ({ auditReadAfterResponse: vi.fn() }));
vi.mock("@camp404/db/activations", () => ({
  listMemberQuestionnaireGates: vi.fn(async () => []),
}));
vi.mock("@camp404/db/member-notes", () => ({
  MAX_MEMBER_NOTE_LENGTH: 2000,
  addMemberNote: vi.fn(),
  listMemberNotes: vi.fn(async () => []),
}));
vi.mock("@/lib/safety-data", () => ({
  resolveSafetyDataForViewer: vi.fn(async () => ({
    allowed: true,
    basis: "captain",
    emergencyContacts: null,
  })),
}));

import { addMemberNoteAction, getMemberDetailAction } from "./actions";
import { addMemberNote, listMemberNotes } from "@camp404/db/member-notes";
import { listMemberQuestionnaireGates } from "@camp404/db/activations";
import { getAuthenticatedUser } from "@/lib/auth";
import { deriveViewerRank, hasClearance } from "@camp404/core";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getOpenPromotionForTarget } from "@/lib/promotion";
import { getCampMemberDetail } from "@camp404/db/roster";
import { decryptField } from "@camp404/db/crypto";
import { auditReadAfterResponse } from "@/lib/audit";
import { presentMemberDetail } from "@/lib/member-detail";
import { resolveSafetyDataForViewer } from "@/lib/safety-data";

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
    approvalStatus: "approved",
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
      includeEmail: true,
      includeArrival: true,
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
    expect(getCampMemberDetail).toHaveBeenCalledWith(CAPTAIN, {
      includeIdDocuments: false,
    });
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

describe("getMemberDetailAction — the ID read leaves an audit trail", () => {
  const MEMBER = "member-1";

  function idColumns(
    passport: unknown,
    saId: unknown = { state: "absent", value: null },
  ) {
    vi.mocked(decryptField)
      .mockReturnValueOnce(passport as never)
      .mockReturnValueOnce(saId as never);
  }

  it("records a captain reading another member's ID number", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    idColumns({ state: "ok", value: "P1234567" });

    const res = await getMemberDetailAction(MEMBER);

    expect(res.ok).toBe(true);
    expect(auditReadAfterResponse).toHaveBeenCalledExactlyOnceWith({
      actorId: CAPTAIN,
      action: "member.id_document.viewed",
      target: MEMBER,
      metadata: { basis: "captain", idType: "passport" },
    });
  });

  it("names the SA ID when that is the document shown", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    idColumns(
      { state: "absent", value: null },
      { state: "ok", value: "8001015009087" },
    );

    await getMemberDetailAction(MEMBER);

    expect(
      vi.mocked(auditReadAfterResponse).mock.calls[0]![0].metadata,
    ).toEqual({
      basis: "captain",
      idType: "sa_id",
    });
  });

  it("records nothing when there is no ID number to show", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    idColumns({ state: "absent", value: null });

    await getMemberDetailAction(MEMBER);

    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("records nothing when the ID cannot be decrypted", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    idColumns({ state: "unreadable", value: null });

    await getMemberDetailAction(MEMBER);

    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("records nothing when a captain reads their own", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(
      detail({ id: CAPTAIN, rank: "captain" }) as never,
    );
    idColumns({ state: "ok", value: "P1234567" });

    await getMemberDetailAction(CAPTAIN);

    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });
});

describe("getMemberDetailAction — emergency contacts", () => {
  it("reads them through the audited safety path, as the captain", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    const contacts = [
      { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
    ];
    vi.mocked(resolveSafetyDataForViewer).mockResolvedValueOnce({
      allowed: true,
      basis: "captain",
      emergencyContacts: contacts,
    });

    await getMemberDetailAction("member-1");

    expect(resolveSafetyDataForViewer).toHaveBeenCalledExactlyOnceWith(
      { userId: CAPTAIN, rank: "captain" },
      "member-1",
    );
    expect(vi.mocked(presentMemberDetail).mock.calls[0]![2]).toMatchObject({
      emergencyContacts: contacts,
    });
  });
});

describe("the member's questionnaires", () => {
  it("hands the panel where each questionnaire stands", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    const day = (d: number) => new Date(Date.UTC(2026, 8, d));
    vi.mocked(listMemberQuestionnaireGates).mockResolvedValue([
      {
        actionKey: "burner_profile",
        title: "Burner profile",
        status: "completed",
        blocking: true,
        dueAt: null,
        completedAt: day(2),
        createdAt: day(1),
      },
      {
        actionKey: "safety",
        title: "Safety",
        status: "pending",
        blocking: true,
        dueAt: day(20),
        completedAt: null,
        createdAt: day(3),
      },
    ]);

    const res = await getMemberDetailAction("member-1");

    expect(listMemberQuestionnaireGates).toHaveBeenCalledWith("member-1");
    expect(
      res.ok && res.questionnaires.map((q) => [q.key, q.status]),
    ).toEqual([
      ["burner_profile", "complete"],
      ["safety", "next-up"],
    ]);
  });
});

describe("captain notes", () => {
  const NOTE = {
    id: "n1",
    body: "Brings a generator.",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    authorId: CAPTAIN,
    authorName: "Cap",
  };

  it("hands the panel the notes and audits a read that shows any", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    vi.mocked(listMemberNotes).mockResolvedValue([NOTE]);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok && res.notes).toEqual([NOTE]);
    expect(auditReadAfterResponse).toHaveBeenCalledWith({
      actorId: CAPTAIN,
      action: "member.notes.viewed",
      target: "member-1",
      metadata: { count: 1 },
    });
  });

  it("audits nothing when there are no notes to see", async () => {
    signInAsCaptain();
    vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
    vi.mocked(listMemberNotes).mockResolvedValue([]);

    await getMemberDetailAction("member-1");

    expect(auditReadAfterResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.notes.viewed" }),
    );
  });

  it("adds a trimmed note as the captain and returns the fresh list", async () => {
    signInAsCaptain();
    vi.mocked(listMemberNotes).mockResolvedValue([NOTE]);

    const res = await addMemberNoteAction("member-1", "  Brings a generator. ");

    expect(res).toEqual({ ok: true, notes: [NOTE] });
    expect(addMemberNote).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      authorId: CAPTAIN,
      body: "Brings a generator.",
    });
  });

  it("refuses a blank or over-long note, and a non-captain", async () => {
    signInAsCaptain();
    expect(await addMemberNoteAction("member-1", "   ")).toEqual({
      ok: false,
      error: "Write the note first.",
    });
    expect(await addMemberNoteAction("member-1", "x".repeat(2001))).toEqual({
      ok: false,
      error: "Keep a note under 2000 characters.",
    });

    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "member-x",
      rank: "member",
    } as never);
    expect(await addMemberNoteAction("member-1", "Hi")).toEqual({
      ok: false,
      error: "Captain access only.",
    });
    expect(addMemberNote).not.toHaveBeenCalled();
  });
});
