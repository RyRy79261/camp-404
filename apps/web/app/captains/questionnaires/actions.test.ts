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
  isTeamLead: vi.fn(),
  getLeadTeams: vi.fn(),
}));
vi.mock("@/lib/roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
  setDefinitionCarryOver: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  publishDefinition: vi.fn(),
  unpublishDefinition: vi.fn(),
  sendActivation: vi.fn(),
  sendReminder: vi.fn(),
  closeActivation: vi.fn(),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  duplicateDefinition: vi.fn(),
  updateDefinition: vi.fn(),
}));

import { canSendToAudience } from "@camp404/core";
import { computeAudience, type AudienceData } from "@camp404/db/audience";
import {
  closeActivationAction,
  previewAudienceCount,
  publishAction,
  remindPendingAction,
  sendAction,
  unpublishAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getLeadTeams, isTeamLead } from "@/lib/users";
import { getCampManagementRoster } from "@/lib/roster";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  publishDefinition,
  sendActivation,
  sendReminder,
  unpublishDefinition,
} from "@camp404/db/questionnaire-lifecycle";

/**
 * Sign in as one viewer. `leadTeams` is the SOURCE of the team-lead facts, not
 * a second dial: `isTeamLead` is derived from it, exactly as production derives
 * the global clearance from the same year-scoped rows. Passing `true` keeps the
 * old call sites working — a lead of one unnamed team.
 */
function asViewer(
  rank: "captain" | "member",
  isLead: boolean | string[] = false,
): void {
  const leadTeams = Array.isArray(isLead)
    ? isLead
    : isLead
      ? ["kitchen"]
      : [];
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    primaryEmail: "x@example.com",
  } as unknown as Awaited<ReturnType<typeof getAuthenticatedUser>>);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "u1",
    rank,
  } as unknown as Awaited<ReturnType<typeof ensureCampUser>>);
  vi.mocked(isTeamLead).mockResolvedValue(leadTeams.length > 0);
  vi.mocked(getLeadTeams).mockResolvedValue(leadTeams);
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

// --- sendAction: the audience gate ------------------------------------------
// The widest thing a non-captain can do in the app. The gate is two moves —
// `gateAuthor()` for the rank, then `canSendToAudience` for the audience — and
// the cases that matter are the REFUSALS: dropping to `team_lead` without the
// second move would put every member one questionnaire away from the whole
// camp. Each verdict below is checked against the pure rule as well as the
// action, so the two cannot drift apart.

const REFUSED = "You can only send to a team you lead.";

describe("sendAction — the audience gate", () => {
  beforeEach(() => {
    vi.mocked(sendActivation).mockResolvedValue({
      ok: true,
      activationId: "act1",
      created: 2,
    });
  });

  it("lets a team lead send to a team they lead", async () => {
    asViewer("member", ["kitchen"]);
    expect(
      canSendToAudience(
        { rank: "team_lead", leadTeams: ["kitchen"] },
        { scope: "team", team: "kitchen" },
      ),
    ).toBe(true);

    expect(
      await sendAction("feedback", {
        scope: "team",
        team: "kitchen",
        blocking: false,
      }),
    ).toEqual({ ok: true, activationId: "act1" });
    expect(sendActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "team",
        team: "kitchen",
        activatedByUserId: "u1",
      }),
    );
  });

  it("refuses a team lead sending to a team they do NOT lead", async () => {
    asViewer("member", ["kitchen"]);
    expect(
      await sendAction("feedback", {
        scope: "team",
        team: "structures",
        blocking: false,
      }),
    ).toEqual({ ok: false, error: REFUSED });
    expect(sendActivation).not.toHaveBeenCalled();
  });

  it("refuses a team lead sending to everyone", async () => {
    asViewer("member", ["kitchen"]);
    expect(
      await sendAction("feedback", { scope: "everyone", blocking: false }),
    ).toEqual({ ok: false, error: REFUSED });
    expect(sendActivation).not.toHaveBeenCalled();
  });

  it("refuses every other scope a lead might reach for", async () => {
    // `team_leads` is a peer broadcast between leads and `individual` is a way
    // to reach the whole camp one id at a time — both are captain-only.
    asViewer("member", ["kitchen"]);
    expect(
      await sendAction("feedback", { scope: "team_leads", blocking: false }),
    ).toEqual({ ok: false, error: REFUSED });
    expect(
      await sendAction("feedback", {
        scope: "individual",
        blocking: false,
        targetUserIds: [ADA],
      }),
    ).toEqual({ ok: false, error: REFUSED });
    expect(sendActivation).not.toHaveBeenCalled();
  });

  it("leaves a captain unrestricted, without reading any membership", async () => {
    asViewer("captain");
    expect(
      await sendAction("feedback", {
        scope: "team",
        team: "structures",
        blocking: false,
      }),
    ).toEqual({ ok: true, activationId: "act1" });
    // Captains are allowed by RANK, never by membership — so the lead-teams
    // read never happens for them.
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("refuses a plain member everywhere, at the rank gate", async () => {
    asViewer("member");
    for (const input of [
      { scope: "everyone", blocking: false },
      { scope: "team", team: "kitchen", blocking: false },
    ]) {
      expect(await sendAction("feedback", input)).toEqual({
        ok: false,
        error: "Team-lead access only.",
      });
    }
    expect(sendActivation).not.toHaveBeenCalled();
    // The rank gate refuses before the audience is even consulted.
    expect(getLeadTeams).not.toHaveBeenCalled();
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
  it("gives a team-lead no count for an audience they cannot send to", async () => {
    // The preview runs the SAME gate as the send, so it refuses exactly what
    // the send would refuse — a preview that answered here would be a lie.
    asViewer("member", ["kitchen"]);
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: false,
      error: REFUSED,
    });
    expect(
      await previewAudienceCount({ scope: "team", team: "structures" }),
    ).toEqual({ ok: false, error: REFUSED });
    expect(getCampManagementRoster).not.toHaveBeenCalled();
  });

  it("counts the team a lead DOES lead, agreeing with computeAudience", async () => {
    asViewer("member", ["kitchen"]);
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
    const expected = computeAudience(
      { scope: "team", team: "kitchen" },
      AUDIENCE_DATA,
      null,
    ).length;
    expect(
      await previewAudienceCount({ scope: "team", team: "kitchen" }),
    ).toEqual({ ok: true, count: expected });
  });

  it("gives a plain member no count at all", async () => {
    asViewer("member");
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: false,
      error: "Team-lead access only.",
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

// --- remindPendingAction (§7.4) ---------------------------------------------
// The DB behaviour — who is outstanding, and the 24-hour window itself — is
// pinned by the PGlite suite in packages/db. What is locked here is the gate
// and the SENTENCE: every "nothing was sent" arm has to come back ok:true with
// a reason, because a captain who taps a button and gets silence taps again.

const ACT = "44444444-4444-4444-8444-444444444444";

describe("remindPendingAction — the gate", () => {
  it("refuses a team-lead", async () => {
    asViewer("member", true); // derives to team_lead
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "Only captains can publish or send.",
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    asViewer("member");
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "Team-lead access only.",
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it("rejects an invalid activation id before touching the database", async () => {
    asViewer("captain");
    expect(await remindPendingAction("not-a-uuid")).toEqual({
      ok: false,
      error: "Invalid activation.",
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });
});

describe("remindPendingAction — what the captain is told", () => {
  beforeEach(() => asViewer("captain"));

  it("reports the count on a successful nudge", async () => {
    vi.mocked(sendReminder).mockResolvedValue({
      ok: true,
      outcome: "sent",
      sent: 4,
      suppressed: 0,
      broadcastId: "b1",
    });
    const res = await remindPendingAction(ACT);
    expect(res).toEqual({ ok: true, sent: 4, message: "Reminded 4 members." });
    expect(sendReminder).toHaveBeenCalledWith({
      activationId: ACT,
      senderId: "u1",
    });
  });

  it("owns up to the members it skipped", async () => {
    vi.mocked(sendReminder).mockResolvedValue({
      ok: true,
      outcome: "sent",
      sent: 1,
      suppressed: 2,
      broadcastId: "b1",
    });
    const res = await remindPendingAction(ACT);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.sent).toBe(1);
    expect(res.message).toContain("Reminded 1 member.");
    expect(res.message).toContain("2 more were skipped");
    expect(res.message).toContain("24 hours");
  });

  it("is a friendly no-op when everyone has already answered", async () => {
    vi.mocked(sendReminder).mockResolvedValue({
      ok: true,
      outcome: "nobody_pending",
      sent: 0,
      suppressed: 0,
    });
    const res = await remindPendingAction(ACT);
    // ok:true, not an error — nothing went wrong; there was simply nobody left.
    expect(res).toEqual({
      ok: true,
      sent: 0,
      message:
        "Everyone who was asked has already answered — there was nobody to remind.",
    });
  });

  it("explains the 24-hour window rather than failing silently", async () => {
    vi.mocked(sendReminder).mockResolvedValue({
      ok: true,
      outcome: "recently_reminded",
      sent: 0,
      suppressed: 3,
      nextAllowedAt: new Date("2026-03-02T09:00:00Z"),
    });
    const res = await remindPendingAction(ACT);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.sent).toBe(0);
    expect(res.message).toContain("All 3 members still outstanding were");
    expect(res.message).toContain("last 24 hours");
    // The captain is told WHEN, not just that nothing happened.
    expect(res.message).toMatch(/You can nudge again from .+\./);
  });

  it("passes a DB-level refusal straight through", async () => {
    vi.mocked(sendReminder).mockResolvedValue({
      ok: false,
      error: "This send is closed, so nobody is waiting on it any more.",
    });
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "This send is closed, so nobody is waiting on it any more.",
    });
  });

  it("converts a thrown DB error into the typed failure arm", async () => {
    vi.mocked(sendReminder).mockRejectedValue(new Error("connection reset"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    spy.mockRestore();
  });
});
