import { beforeEach, describe, expect, it, vi } from "vitest";

// The lifecycle actions gate to captains and validate the Send form before
// touching the DB. The DB behaviour itself is covered by the PGlite suite in
// packages/db; here we lock the gate + Zod validation by mocking the server-only
// auth + db modules (the real @camp404/core clearance maths is left intact).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@camp404/db/roster", () => ({ isTeamLead: vi.fn() }));
vi.mock("@/lib/roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
  setDefinitionCarryOver: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  publishDefinition: vi.fn(),
  unpublishDefinition: vi.fn(),
  sendActivation: vi.fn(),
  closeActivation: vi.fn(),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  duplicateDefinition: vi.fn(),
  updateDefinition: vi.fn(),
}));

import { computeAudience, type AudienceData } from "@camp404/db/audience";
import {
  closeActivationAction,
  previewAudienceCount,
  publishAction,
  sendAction,
  unpublishAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser } from "@/lib/users";
import { isTeamLead } from "@camp404/db/roster";
import { getCampManagementRoster } from "@/lib/roster";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  publishDefinition,
  sendActivation,
  unpublishDefinition,
} from "@camp404/db/questionnaire-lifecycle";

function asViewer(rank: "captain" | "member", isLead = false): void {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    primaryEmail: "x@example.com",
  } as unknown as Awaited<ReturnType<typeof getAuthenticatedUser>>);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "u1",
    rank,
  } as unknown as Awaited<ReturnType<typeof ensureCampUser>>);
  vi.mocked(isTeamLead).mockResolvedValue(isLead);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishAction — captain gate", () => {
  it("rejects a team-lead (non-captain)", async () => {
    asViewer("member", true); // derives to team_lead
    const res = await publishAction("feedback");
    expect(res).toEqual({
      ok: false,
      errors: ["Only captains can publish or send."],
    });
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("publishes for a captain when the definition exists", async () => {
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "u1",
    });
    vi.mocked(publishDefinition).mockResolvedValue({
      ok: true,
      version: "feedback-v1",
      change: "initial",
    });
    const res = await publishAction("feedback");
    expect(res).toEqual({ ok: true, version: "feedback-v1", change: "initial" });
    expect(publishDefinition).toHaveBeenCalledWith("feedback", "u1");
  });

  it("returns not-found for a missing definition", async () => {
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(null);
    expect(await publishAction("nope")).toEqual({
      ok: false,
      errors: ["Questionnaire not found."],
    });
  });
});

describe("sendAction — validation", () => {
  beforeEach(() => asViewer("captain"));

  it("rejects scope=team without a team", async () => {
    const res = await sendAction("feedback", { scope: "team", blocking: false });
    expect(res).toEqual({ ok: false, error: "Choose a team to send to." });
    expect(sendActivation).not.toHaveBeenCalled();
  });

  it("rejects scope=individual without targets", async () => {
    const res = await sendAction("feedback", {
      scope: "individual",
      blocking: false,
      targetUserIds: [],
    });
    expect(res).toEqual({ ok: false, error: "Choose at least one member." });
  });

  it("delegates a valid everyone send", async () => {
    vi.mocked(sendActivation).mockResolvedValue({
      ok: true,
      activationId: "act1",
      created: 3,
    });
    const res = await sendAction("feedback", {
      scope: "everyone",
      blocking: true,
    });
    expect(res).toEqual({ ok: true, activationId: "act1" });
    expect(sendActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        questionnaireKey: "feedback",
        scope: "everyone",
        blocking: true,
        activatedByUserId: "u1",
      }),
    );
  });

  it("converts a dueAt ISO string into a Date", async () => {
    vi.mocked(sendActivation).mockResolvedValue({
      ok: true,
      activationId: "act1",
      created: 1,
    });
    await sendAction("feedback", {
      scope: "everyone",
      blocking: false,
      dueAt: "2026-07-01T12:00:00.000Z",
    });
    const arg = vi.mocked(sendActivation).mock.calls[0]![0];
    expect(arg.dueAt).toBeInstanceOf(Date);
  });
});

describe("unpublishAction", () => {
  beforeEach(() => asViewer("captain"));

  it("rejects a non-published definition", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "u1",
    });
    expect(await unpublishAction("feedback")).toEqual({
      ok: false,
      error: "Only a published questionnaire can be unpublished.",
    });
  });

  it("unpublishes a published definition", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: null,
      createdBy: "u1",
    });
    vi.mocked(unpublishDefinition).mockResolvedValue({
      ok: true,
      closedActivations: 1,
    });
    expect(await unpublishAction("feedback")).toEqual({ ok: true });
  });
});

describe("closeActivationAction", () => {
  it("rejects a team-lead at the captain gate", async () => {
    asViewer("member", true); // team_lead — passes the author gate, fails captain
    expect(
      await closeActivationAction("00000000-0000-0000-0000-000000000000"),
    ).toEqual({ ok: false, error: "Only captains can publish or send." });
  });

  it("rejects an invalid activation id", async () => {
    asViewer("captain");
    expect(await closeActivationAction("not-a-uuid")).toEqual({
      ok: false,
      error: "Invalid activation.",
    });
  });
});

// --- previewAudienceCount ---------------------------------------------------
// The preview exists to make a zero-recipient send VISIBLE, so the cases that
// matter most are the refusals (which must cost no database round-trip) and
// the agreement between the count and what a real send would resolve to.

const ADA = "11111111-1111-4111-8111-111111111111";
const GRACE = "22222222-2222-4222-8222-222222222222";
const LIN = "33333333-3333-4333-8333-333333333333";

type RosterRow = Awaited<ReturnType<typeof getCampManagementRoster>>[number];

function rosterRow(id: string, teams: string[], isLead = false): RosterRow {
  return { id, teams, isLead } as unknown as RosterRow;
}

const ROSTER: RosterRow[] = [
  rosterRow(ADA, ["kitchen"], true),
  rosterRow(GRACE, ["kitchen", "structures"]),
  rosterRow(LIN, []),
];

/** The same AudienceData the action builds — so the assertion is not a number
 *  someone typed, but what `computeAudience` itself says. */
const AUDIENCE_DATA: AudienceData = {
  members: ROSTER.map((m) => ({
    id: m.id,
    isSystem: false,
    sanitised: false,
  })),
  memberships: ROSTER.flatMap((m) =>
    m.teams.map((team) => ({ userId: m.id, team, isLead: m.isLead })),
  ),
  driverUserIds: [],
  targetUserIds: [],
};

describe("previewAudienceCount — refusals cost nothing", () => {
  beforeEach(() => {
    asViewer("captain");
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
  });

  it("rejects opt_in with ZERO database round-trips", async () => {
    const res = await previewAudienceCount({ scope: "opt_in" });
    expect(res).toEqual({
      ok: false,
      error: "opt_in activations are not yet supported.",
    });
    // Not even the auth/gate reads ran: the scope check is pure and comes first,
    // so a debounced client typing through an audience cannot fan out queries.
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
    expect(getCampManagementRoster).not.toHaveBeenCalled();
  });

  it("rejects a scope the send cannot use at all", async () => {
    const res = await previewAudienceCount({ scope: "drivers" });
    expect(res.ok).toBe(false);
    expect(getCampManagementRoster).not.toHaveBeenCalled();
  });

  it("refuses an incomplete audience rather than reporting 0", async () => {
    // 0 would read as "this team is empty"; the caller hides the line instead.
    expect(await previewAudienceCount({ scope: "team" })).toEqual({
      ok: false,
      error: "Choose a team to send to.",
    });
    expect(
      await previewAudienceCount({ scope: "individual", targetUserIds: [] }),
    ).toEqual({ ok: false, error: "Choose at least one member." });
    expect(getCampManagementRoster).not.toHaveBeenCalled();
  });
});

describe("previewAudienceCount — the gate", () => {
  it("gives a team-lead no count", async () => {
    asViewer("member", true); // derives to team_lead
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: false,
      error: "Only captains can publish or send.",
    });
    expect(getCampManagementRoster).not.toHaveBeenCalled();
  });

  it("gives a signed-out visitor no count", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: false,
      error: "Not signed in.",
    });
  });
});

describe("previewAudienceCount — the count agrees with the send", () => {
  beforeEach(() => {
    asViewer("captain");
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
  });

  it("matches computeAudience for everyone", async () => {
    const expected = computeAudience(
      { scope: "everyone", team: null },
      AUDIENCE_DATA,
      null,
    ).length;
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: true,
      count: expected,
    });
  });

  it("matches computeAudience for a team", async () => {
    const expected = computeAudience(
      { scope: "team", team: "kitchen" },
      AUDIENCE_DATA,
      null,
    ).length;
    expect(
      await previewAudienceCount({ scope: "team", team: "kitchen" }),
    ).toEqual({ ok: true, count: expected });
  });

  it("reports 0 — not a refusal — for a team nobody is on", async () => {
    // The whole point of the item: a send that would reach nobody says so.
    expect(
      await previewAudienceCount({
        scope: "team",
        team: "ministry_of_memes",
      }),
    ).toEqual({ ok: true, count: 0 });
  });

  it("reports 0 for team_leads when the camp has no leads", async () => {
    vi.mocked(getCampManagementRoster).mockResolvedValue([
      rosterRow(GRACE, ["kitchen"]),
    ]);
    expect(await previewAudienceCount({ scope: "team_leads" })).toEqual({
      ok: true,
      count: 0,
    });
  });

  it("counts only the chosen members for an individual send", async () => {
    const expected = computeAudience(
      { scope: "individual", team: null },
      { ...AUDIENCE_DATA, targetUserIds: [ADA, GRACE] },
      null,
    ).length;
    expect(
      await previewAudienceCount({
        scope: "individual",
        targetUserIds: [ADA, GRACE],
      }),
    ).toEqual({ ok: true, count: expected });
  });
});
