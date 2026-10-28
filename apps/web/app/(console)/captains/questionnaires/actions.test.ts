import { beforeEach, describe, expect, it, vi } from "vitest";

// The lifecycle actions gate to captains and validate the Send form before
// touching the DB. The DB behaviour itself is covered by the PGlite suite in
// packages/db; here we lock the gate + Zod validation by mocking the server-only
// auth + db modules (the real @camp404/core clearance maths is left intact).

vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));
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
  setDefinitionAnonymousResults: vi.fn(),
  setDefinitionCarryOver: vi.fn(),
}));
vi.mock("@camp404/db/activations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@camp404/db/activations")>()),
  getActivationById: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  getOpenActivationForKey: vi.fn(),
  publishDefinition: vi.fn(),
  unpublishDefinition: vi.fn(),
  sendActivation: vi.fn(),
  sendReminder: vi.fn(),
  closeActivation: vi.fn(),
}));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/questionnaire-definitions", () => ({
  createAttendanceCheck: vi.fn(),
  createDraftFromTemplate: vi.fn(),
  getBuilderDefinition: vi.fn(),
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  duplicateDefinition: vi.fn(),
  updateDefinition: vi.fn(),
}));

import { attendanceQuestionnaire } from "@camp404/types";
import { canSendQuestionnaireTo } from "@camp404/core";
import { computeAudience, type AudienceData } from "@camp404/db/audience";
import {
  closeActivationAction,
  setCarryOverAction,
  createAttendanceCheckAction,
  createDraftAction,
  createFromTemplateAction,
  mealPlanRowsAction,
  deleteDraftAction,
  duplicateDraftAction,
  previewAudienceCount,
  publishAction,
  remindPendingAction,
  sendAction,
  setAnonymousResultsAction,
  unpublishAction,
  updateDefinitionAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getLeadTeams, isTeamLead } from "@/lib/users";
import { getCampManagementRoster } from "@/lib/roster";
import {
  getDefinitionMetaRow,
  setDefinitionAnonymousResults,
  setDefinitionCarryOver,
} from "@camp404/db/questionnaire-definitions";
import { getMealPlan } from "@/lib/meal-plan";
import {
  createAttendanceCheck,
  createDraftFromTemplate,
  getBuilderDefinition,
  createDraft,
  deleteDraft,
  duplicateDefinition,
  updateDefinition,
} from "@/lib/questionnaire-definitions";
import {
  closeActivation,
  publishDefinition,
  sendActivation,
  sendReminder,
  unpublishDefinition,
  getOpenActivationForKey,
} from "@camp404/db/questionnaire-lifecycle";
import { deliverAfterResponse } from "@/lib/background-work";
import { getActivationById } from "@camp404/db/activations";

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
  const leadTeams = Array.isArray(isLead) ? isLead : isLead ? ["kitchen"] : [];
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
  vi.mocked(deleteDraft).mockResolvedValue(true);
  // By default the questionnaire is online and someone else wrote it, so a
  // send is not also a publish unless a test says so.
  vi.mocked(getDefinitionMetaRow).mockResolvedValue({
    key: "feedback",
    status: "published",
    version: "feedback-v1",
    createdBy: "someone-else",
    anonymousResults: false,
  });
  vi.mocked(publishDefinition).mockResolvedValue({
    ok: true,
    version: "feedback-v1",
    change: "cosmetic",
  });
  vi.mocked(getActivationById).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    questionnaireKey: "feedback",
  } as Awaited<ReturnType<typeof getActivationById>>);
  // ...and a send of it is out.
  vi.mocked(getOpenActivationForKey).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  } as Awaited<ReturnType<typeof getOpenActivationForKey>>);
});

describe("publishAction (Send changes) — its author or a captain", () => {
  it("refuses a team lead who did not write it", async () => {
    asViewer("member", true); // derives to team_lead
    const res = await publishAction("feedback");
    expect(res).toEqual({
      ok: false,
      errors: ["You can only edit your own questionnaires."],
      issues: [],
    });
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("puts its author's changes online when the author is a team lead", async () => {
    asViewer("member", true);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    expect(await publishAction("feedback")).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "cosmetic",
    });
    expect(publishDefinition).toHaveBeenCalledWith("feedback", "u1");
  });

  it("refuses a plain member, even its author", async () => {
    asViewer("member");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    expect((await publishAction("feedback")).ok).toBe(false);
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("publishes for a captain when the definition exists", async () => {
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    vi.mocked(publishDefinition).mockResolvedValue({
      ok: true,
      version: "feedback-v1",
      change: "initial",
    });
    const res = await publishAction("feedback");
    expect(res).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "initial",
    });
    expect(publishDefinition).toHaveBeenCalledWith("feedback", "u1");
  });

  it("returns not-found for a missing definition", async () => {
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(null);
    expect(await publishAction("nope")).toEqual({
      ok: false,
      errors: ["Questionnaire not found."],
      issues: [],
    });
  });

  it("passes the located publish issues through", async () => {
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    const refused = {
      ok: false as const,
      errors: ["Page 1 needs a title."],
      issues: [
        {
          path: "pages[0].title",
          code: "missing_page_title" as const,
          message: "Page 1 needs a title.",
          pageId: "p1",
        },
      ],
    };
    vi.mocked(publishDefinition).mockResolvedValue(refused);
    expect(await publishAction("feedback")).toEqual(refused);
  });

  it("refuses a draft, or one with no open send: Send asks people first", async () => {
    const noSend = {
      ok: false,
      errors: [
        "This questionnaire has no open send. Use Send to choose who to ask.",
      ],
      issues: [],
    };
    asViewer("captain");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "u1",
      anonymousResults: false,
    });
    expect(await publishAction("feedback")).toEqual(noSend);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    vi.mocked(getOpenActivationForKey).mockResolvedValue(null);
    expect(await publishAction("feedback")).toEqual(noSend);
    expect(publishDefinition).not.toHaveBeenCalled();
  });
});

describe("createAttendanceCheckAction", () => {
  /** The stored row behind the fixed key: absent until the first create. */
  let stored: "draft" | "published" | null;

  beforeEach(() => {
    stored = null;
    vi.mocked(createAttendanceCheck).mockImplementation(async () => {
      stored ??= "draft";
      return "coming-this-year";
    });
    vi.mocked(getDefinitionMetaRow).mockImplementation(async (key) =>
      stored
        ? {
            key,
            status: stored,
            version: null,
            createdBy: "u1",
            anonymousResults: false,
          }
        : null,
    );
    vi.mocked(publishDefinition).mockImplementation(async () => {
      stored = "published";
      return { ok: true, version: "coming-this-year-v1", change: "initial" };
    });
    vi.mocked(getBuilderDefinition).mockResolvedValue(
      attendanceQuestionnaire(),
    );
  });

  it("refuses to publish a check whose Yes / Maybe / No question was deleted", async () => {
    asViewer("captain");
    const edited = attendanceQuestionnaire();
    for (const page of edited.pages) {
      if (page.kind === "questions") page.questions = [];
    }
    vi.mocked(getBuilderDefinition).mockResolvedValue(edited);
    const result = await createAttendanceCheckAction();
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatch(/lost its Yes \/ Maybe \/ No question/);
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("refuses a team lead: the yearly check is the captains'", async () => {
    asViewer("member", ["kitchen", "structures"]);
    expect(await createAttendanceCheckAction()).toEqual({
      ok: false,
      error: "Only captains can do this.",
    });
    expect(createAttendanceCheck).not.toHaveBeenCalled();
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("creates and publishes it for a captain, and a second click returns the same key", async () => {
    asViewer("captain");
    expect(await createAttendanceCheckAction()).toEqual({
      ok: true,
      key: "coming-this-year",
    });
    expect(createAttendanceCheck).toHaveBeenCalledWith("u1");
    expect(publishDefinition).toHaveBeenCalledWith("coming-this-year", "u1");

    expect(await createAttendanceCheckAction()).toEqual({
      ok: true,
      key: "coming-this-year",
    });
    // Already live: not published again.
    expect(publishDefinition).toHaveBeenCalledTimes(1);
  });

  it("reports a publish refusal as its first reason", async () => {
    asViewer("captain");
    vi.mocked(publishDefinition).mockResolvedValue({
      ok: false,
      errors: ["Its options must be exactly yes, maybe and no."],
      issues: [],
    });
    expect(await createAttendanceCheckAction()).toEqual({
      ok: false,
      error: "Its options must be exactly yes, maybe and no.",
    });
  });
});

describe("sendAction — validation", () => {
  beforeEach(() => asViewer("captain"));

  it("rejects scope=team without a team", async () => {
    const res = await sendAction("feedback", {
      scope: "team",
      blocking: false,
    });
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
    // No cron: the notices the send wrote go out after this response.
    expect(deliverAfterResponse).toHaveBeenCalledOnce();
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
// Two moves: `gateAuthor()` for the rank, then `canSendQuestionnaireTo` for
// the audience. A team lead sends to any questionnaire audience a captain may,
// blocking included (owner, 2026-10-23); a plain member is refused at the rank
// gate. Each verdict is checked against the pure rule as well as the action.

describe("sendAction — the audience gate", () => {
  beforeEach(() => {
    vi.mocked(sendActivation).mockResolvedValue({
      ok: true,
      activationId: "act1",
      created: 2,
    });
  });

  it("lets a team lead send to the whole camp, blocking, and to any team", async () => {
    asViewer("member", ["kitchen"]);
    expect(
      canSendQuestionnaireTo({ rank: "team_lead" }, { scope: "everyone" }),
    ).toBe(true);

    for (const input of [
      { scope: "everyone", blocking: true },
      { scope: "team", team: "structures", blocking: false },
      { scope: "team_leads", blocking: false },
      { scope: "individual", blocking: false, targetUserIds: [ADA] },
    ]) {
      expect(await sendAction("feedback", input)).toEqual({
        ok: true,
        activationId: "act1",
      });
    }
    expect(sendActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "everyone",
        blocking: true,
        activatedByUserId: "u1",
      }),
    );
  });

  it("does not put someone else's changes online when a lead sends it", async () => {
    asViewer("member", ["kitchen"]);
    await sendAction("feedback", { scope: "everyone", blocking: false });
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it("refuses a lead sending someone else's questionnaire that is not online", async () => {
    asViewer("member", ["kitchen"]);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "someone-else",
      anonymousResults: false,
    });
    expect(
      await sendAction("feedback", { scope: "everyone", blocking: false }),
    ).toEqual({
      ok: false,
      error:
        "Only its author or a captain can send this questionnaire for the first time.",
    });
    expect(sendActivation).not.toHaveBeenCalled();
  });

  it("puts its author's draft online and sends it in one press", async () => {
    asViewer("member", ["kitchen"]);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "u1",
      anonymousResults: false,
    });
    expect(
      await sendAction("feedback", { scope: "everyone", blocking: false }),
    ).toEqual({ ok: true, activationId: "act1" });
    expect(publishDefinition).toHaveBeenCalledWith("feedback", "u1");
    expect(
      vi.mocked(publishDefinition).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(sendActivation).mock.invocationCallOrder[0]!);
  });

  it("sends nothing when the draft cannot go online, and says why", async () => {
    asViewer("captain");
    vi.mocked(publishDefinition).mockResolvedValue({
      ok: false,
      errors: ["Every question needs its words."],
      issues: [],
    });
    expect(
      await sendAction("feedback", { scope: "everyone", blocking: false }),
    ).toEqual({ ok: false, error: "Every question needs its words." });
    expect(sendActivation).not.toHaveBeenCalled();
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
    expect(publishDefinition).not.toHaveBeenCalled();
  });
});

// --- sendAction: optional questionnaires (#313) ------------------------------
// "Anyone may answer (optional)" puts a questionnaire in every camp member's
// My forms. Team leads and captains (owner, 2026-10-23); whatever the request
// says, an optional send is never blocking, has no deadline and names nobody.

describe("sendAction — optional questionnaires (opt_in)", () => {
  beforeEach(() => {
    vi.mocked(sendActivation).mockResolvedValue({
      ok: true,
      activationId: "act1",
      created: 0,
    });
  });

  it("lets a captain put one in My forms, never blocking and with no deadline", async () => {
    asViewer("captain");
    expect(
      await sendAction("feedback", {
        scope: "opt_in",
        blocking: true,
        dueAt: "2026-07-01T12:00:00.000Z",
        team: "kitchen",
        targetUserIds: [ADA],
        announce: true,
      }),
    ).toEqual({ ok: true, activationId: "act1" });
    expect(sendActivation).toHaveBeenCalledWith({
      questionnaireKey: "feedback",
      scope: "opt_in",
      team: null,
      blocking: false,
      dueAt: null,
      activatedByUserId: "u1",
      targetUserIds: undefined,
      announce: true,
    });
  });

  it("tells nobody unless the captain switched it on", async () => {
    asViewer("captain");
    await sendAction("feedback", { scope: "opt_in", blocking: false });
    expect(vi.mocked(sendActivation).mock.calls[0]![0].announce).toBe(false);
  });

  it("lets a team lead put one in My forms", async () => {
    asViewer("member", ["kitchen"]);
    expect(
      await sendAction("feedback", { scope: "opt_in", blocking: false }),
    ).toEqual({ ok: true, activationId: "act1" });
  });

  it("refuses a plain member at the rank gate", async () => {
    asViewer("member");
    expect(
      await sendAction("feedback", { scope: "opt_in", blocking: false }),
    ).toEqual({ ok: false, error: "Team-lead access only." });
    expect(sendActivation).not.toHaveBeenCalled();
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
      anonymousResults: false,
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
      anonymousResults: false,
    });
    vi.mocked(unpublishDefinition).mockResolvedValue({
      ok: true,
      closedActivations: 1,
    });
    expect(await unpublishAction("feedback")).toEqual({ ok: true });
    // The audit row names who unpublished it.
    expect(unpublishDefinition).toHaveBeenCalledWith("feedback", "u1");
  });
});

describe("closeActivationAction", () => {
  it("refuses a team lead who did not write the questionnaire", async () => {
    asViewer("member", true);
    expect(
      await closeActivationAction("00000000-0000-0000-0000-000000000000"),
    ).toEqual({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    expect(closeActivation).not.toHaveBeenCalled();
  });

  it("lets its author, a team lead, close the send", async () => {
    asViewer("member", true);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "published",
      version: "feedback-v1",
      createdBy: "u1",
      anonymousResults: false,
    });
    vi.mocked(closeActivation).mockResolvedValue({ ok: true });
    expect(
      await closeActivationAction("00000000-0000-0000-0000-000000000000"),
    ).toEqual({ ok: true });
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
  return {
    id,
    teams,
    isLead,
    approvalStatus: "approved",
  } as unknown as RosterRow;
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
    approvalStatus: m.approvalStatus,
  })),
  memberships: ROSTER.flatMap((m) =>
    m.teams.map((team) => ({ userId: m.id, team, isLead: m.isLead })),
  ),
  driverUserIds: [],
  targetUserIds: [],
  notComingUserIds: [],
};

/** Nobody in ROSTER said Not coming. */
const NONE_LEFT_OUT = { count: 0, names: [] };

describe("previewAudienceCount — refusals cost nothing", () => {
  beforeEach(() => {
    asViewer("captain");
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
  });

  it("rejects a scope the send cannot use at all with ZERO database round-trips", async () => {
    const res = await previewAudienceCount({ scope: "drivers" });
    expect(res.ok).toBe(false);
    // Not even the auth/gate reads ran: the scope check is pure and comes first,
    // so a debounced client typing through an audience cannot fan out queries.
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
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
  it("gives a team lead a count for the whole camp, like a captain", async () => {
    asViewer("member", ["kitchen"]);
    vi.mocked(getCampManagementRoster).mockResolvedValue(ROSTER);
    const expected = computeAudience(
      { scope: "everyone", team: null },
      AUDIENCE_DATA,
      null,
    ).length;
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: true,
      count: expected,
      notComing: NONE_LEFT_OUT,
    });
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
    ).toEqual({ ok: true, count: expected, notComing: NONE_LEFT_OUT });
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
      notComing: NONE_LEFT_OUT,
    });
  });

  it("counts the whole camp for an optional questionnaire (#313)", async () => {
    const expected = computeAudience(
      { scope: "everyone", team: null },
      AUDIENCE_DATA,
      null,
    ).length;
    expect(await previewAudienceCount({ scope: "opt_in" })).toEqual({
      ok: true,
      count: expected,
      notComing: NONE_LEFT_OUT,
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
    ).toEqual({ ok: true, count: expected, notComing: NONE_LEFT_OUT });
  });

  it("reports 0 — not a refusal — for a team nobody is on", async () => {
    // The whole point of the item: a send that would reach nobody says so.
    expect(
      await previewAudienceCount({
        scope: "team",
        team: "ministry_of_memes",
      }),
    ).toEqual({ ok: true, count: 0, notComing: NONE_LEFT_OUT });
  });

  it("reports 0 for team_leads when the camp has no leads", async () => {
    vi.mocked(getCampManagementRoster).mockResolvedValue([
      rosterRow(GRACE, ["kitchen"]),
    ]);
    expect(await previewAudienceCount({ scope: "team_leads" })).toEqual({
      ok: true,
      count: 0,
      notComing: NONE_LEFT_OUT,
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
    ).toEqual({ ok: true, count: expected, notComing: NONE_LEFT_OUT });
  });
});

describe("previewAudienceCount — who said Not coming (owner, 2026-10-27)", () => {
  const AWAY = "55555555-5555-4555-8555-555555555555";
  const away = {
    ...rosterRow(AWAY, ["kitchen"]),
    displayName: "Tash",
    participation: "not_attending",
  } as unknown as RosterRow;

  beforeEach(() => {
    vi.mocked(getCampManagementRoster).mockResolvedValue([...ROSTER, away]);
  });

  it("leaves them out of the count and names them to a captain", async () => {
    asViewer("captain");
    expect(await previewAudienceCount({ scope: "everyone" })).toEqual({
      ok: true,
      count: 3,
      notComing: { count: 1, names: ["Tash"] },
    });
    expect(
      await previewAudienceCount({ scope: "team", team: "kitchen" }),
    ).toEqual({
      ok: true,
      count: 2,
      notComing: { count: 1, names: ["Tash"] },
    });
  });

  it("names them to a team lead too, who reads participation", async () => {
    asViewer("member", true);
    expect(
      await previewAudienceCount({ scope: "team", team: "kitchen" }),
    ).toMatchObject({ notComing: { count: 1, names: ["Tash"] } });
  });

  it("still counts someone picked by name", async () => {
    asViewer("captain");
    expect(
      await previewAudienceCount({
        scope: "individual",
        targetUserIds: [AWAY],
      }),
    ).toEqual({ ok: true, count: 1, notComing: NONE_LEFT_OUT });
  });
});

// --- remindPendingAction (§7.4) ---------------------------------------------
// The DB behaviour — who is outstanding, and the 24-hour window itself — is
// pinned by the PGlite suite in packages/db. What is locked here is the gate
// and the SENTENCE: every "nothing was sent" arm has to come back ok:true with
// a reason, because a captain who taps a button and gets silence taps again.

const ACT = "44444444-4444-4444-8444-444444444444";

describe("remindPendingAction — the gate", () => {
  it("refuses a team lead who did not write the questionnaire", async () => {
    asViewer("member", true); // derives to team_lead
    expect(await remindPendingAction(ACT)).toEqual({
      ok: false,
      error: "You can only edit your own questionnaires.",
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
    // The captain is told WHEN, not just that nothing happened, and in camp
    // time: 09:00Z is 11:00 in South Africa whatever zone the server runs in.
    expect(res.message).toMatch(/You can nudge again from .+\./);
    expect(res.message).toContain("11:00");
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

// --- Draft authoring: create / update / delete / duplicate -----------------
// A team lead authors their OWN drafts; a captain may touch any. Every refusal
// is asserted to reach no writer, because these actions take any POST.

// A draft as the unified model, which is what a save stores.
const BLANK = {
  version: "1",
  title: "Kitchen rota",
  pages: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "questions",
      title: "Kitchen rota",
      questions: [],
    },
  ],
};

function definitionRow(
  status: "draft" | "published" | "unpublished",
  createdBy: string | null,
) {
  vi.mocked(getDefinitionMetaRow).mockResolvedValue({
    key: "kitchen-rota",
    status,
    version: "1",
    createdBy,
  } as Awaited<ReturnType<typeof getDefinitionMetaRow>>);
}

describe("draft authoring — a plain member is refused at the rank gate", () => {
  it("writes nothing for any draft action", async () => {
    asViewer("member", false);
    definitionRow("draft", "u1");

    const refused = { ok: false, error: "Team-lead access only." };
    expect(await createDraftAction("Kitchen rota")).toEqual(refused);
    expect(await updateDefinitionAction("kitchen-rota", BLANK)).toEqual(
      refused,
    );
    expect(await deleteDraftAction("kitchen-rota")).toEqual(refused);
    expect(await duplicateDraftAction("kitchen-rota")).toEqual(refused);

    expect(createDraft).not.toHaveBeenCalled();
    expect(updateDefinition).not.toHaveBeenCalled();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(duplicateDefinition).not.toHaveBeenCalled();
    expect(getDefinitionMetaRow).not.toHaveBeenCalled();
  });
});

describe("draft authoring — a team lead and another author's draft", () => {
  it("cannot edit it", async () => {
    asViewer("member", true);
    definitionRow("draft", "someone-else");

    expect(await updateDefinitionAction("kitchen-rota", BLANK)).toEqual({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    expect(updateDefinition).not.toHaveBeenCalled();
  });

  it("cannot delete it", async () => {
    asViewer("member", true);
    definitionRow("draft", "someone-else");

    expect(await deleteDraftAction("kitchen-rota")).toEqual({
      ok: false,
      error: "You can only delete your own drafts.",
    });
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  it("may copy it: every member reads every draft (owner, 2026-10-23)", async () => {
    asViewer("member", true);
    definitionRow("draft", "someone-else");
    vi.mocked(duplicateDefinition).mockResolvedValue("kitchen-rota-2");

    expect(await duplicateDraftAction("kitchen-rota")).toEqual({
      ok: true,
      key: "kitchen-rota-2",
    });
  });

  it("may copy another author's published questionnaire", async () => {
    asViewer("member", true);
    definitionRow("published", "someone-else");
    vi.mocked(duplicateDefinition).mockResolvedValue("kitchen-rota-2");

    expect(await duplicateDraftAction("kitchen-rota")).toEqual({
      ok: true,
      key: "kitchen-rota-2",
    });
    expect(duplicateDefinition).toHaveBeenCalledWith({
      key: "kitchen-rota",
      createdBy: "u1",
    });
  });

  it("creates, edits and deletes their own draft", async () => {
    asViewer("member", true);
    definitionRow("draft", "u1");
    vi.mocked(createDraft).mockResolvedValue("kitchen-rota");

    expect(await createDraftAction("Kitchen rota")).toEqual({
      ok: true,
      key: "kitchen-rota",
    });
    expect(createDraft).toHaveBeenCalledWith({
      title: "Kitchen rota",
      createdBy: "u1",
    });
    expect(await updateDefinitionAction("kitchen-rota", BLANK)).toEqual({
      ok: true,
    });
    expect(await deleteDraftAction("kitchen-rota")).toEqual({ ok: true });
    expect(deleteDraft).toHaveBeenCalledWith("kitchen-rota");
  });
});

describe("draft authoring — a publish that lands first", () => {
  it("says so when the draft was published between the read and the delete", async () => {
    asViewer("captain");
    definitionRow("draft", "u1");
    // The delete's compare-and-set on `draft` found nothing to delete.
    vi.mocked(deleteDraft).mockResolvedValueOnce(false);

    expect(await deleteDraftAction("kitchen-rota")).toEqual({
      ok: false,
      error:
        "This questionnaire is no longer a draft: someone published or deleted it. The list is up to date now.",
    });
  });
});

describe("draft authoring — a captain", () => {
  it("may edit, copy and delete another author's draft", async () => {
    asViewer("captain");
    definitionRow("draft", "someone-else");
    vi.mocked(duplicateDefinition).mockResolvedValue("kitchen-rota-2");

    expect(await updateDefinitionAction("kitchen-rota", BLANK)).toEqual({
      ok: true,
    });
    expect(updateDefinition).toHaveBeenCalledWith("kitchen-rota", BLANK);
    expect((await duplicateDraftAction("kitchen-rota")).ok).toBe(true);
    expect(await deleteDraftAction("kitchen-rota")).toEqual({ ok: true });
    expect(deleteDraft).toHaveBeenCalledWith("kitchen-rota");
  });

  it("stores the parsed unified model, defaults applied", async () => {
    asViewer("captain");
    definitionRow("draft", "u1");

    expect(
      await updateDefinitionAction("kitchen-rota", {
        version: "1",
        title: "Kitchen rota",
        pages: [
          {
            id: "p1",
            kind: "questions",
            title: "",
            questions: [
              {
                id: "q",
                kind: "short_text",
                prompt: "Shift?",
                visibleIf: { fieldId: "x", op: "is_answered" },
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: true });
    expect(updateDefinition).toHaveBeenCalledWith("kitchen-rota", {
      version: "1",
      title: "Kitchen rota",
      pages: [
        {
          id: "p1",
          kind: "questions",
          title: "",
          questions: [
            {
              id: "q",
              kind: "short_text",
              prompt: "Shift?",
              maxLength: 120,
              required: true,
              visibleIf: { fieldId: "x", op: "is_answered" },
            },
          ],
        },
      ],
    });
  });

  it("refuses the old canvas's builder shape now the builder saves the unified model", async () => {
    asViewer("captain");
    definitionRow("draft", "u1");

    expect(
      await updateDefinitionAction("kitchen-rota", {
        version: "1",
        title: "Kitchen rota",
        pages: [
          {
            id: "p1",
            type: "question",
            title: "",
            blocks: [
              {
                kind: "question",
                question: { id: "q", kind: "short_text", prompt: "Shift?" },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "The questionnaire is malformed and wasn't saved.",
    });
    expect(updateDefinition).not.toHaveBeenCalled();
  });

  it("refuses a malformed or oversized save, writing nothing", async () => {
    asViewer("captain");
    definitionRow("draft", "u1");

    expect(
      await updateDefinitionAction("kitchen-rota", { version: "1", pages: [] }),
    ).toEqual({
      ok: false,
      error: "The questionnaire is malformed and wasn't saved.",
    });
    expect(
      await updateDefinitionAction("kitchen-rota", {
        ...BLANK,
        title: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      error: "Keep the title to 200 characters or fewer.",
    });
    expect(updateDefinition).not.toHaveBeenCalled();
  });

  it("cannot delete a published questionnaire", async () => {
    asViewer("captain");
    definitionRow("published", "u1");

    expect(await deleteDraftAction("kitchen-rota")).toEqual({
      ok: false,
      error: "Only drafts can be deleted — unpublish it first.",
    });
    expect(deleteDraft).not.toHaveBeenCalled();
  });
});

describe("createFromTemplateAction (#251)", () => {
  const plan = {
    cycle: 3,
    daysOnSite: 2,
    firstDay: null,
    days: [
      { breakfast: 0, dinner: 30 },
      { breakfast: 30, dinner: 0 },
    ],
    version: 1,
    updatedAt: null,
  };

  it("refuses a plain member", async () => {
    asViewer("member");
    expect(await createFromTemplateAction("post_burn_survey")).toEqual({
      ok: false,
      error: "Team-lead access only.",
    });
    expect(createDraftFromTemplate).not.toHaveBeenCalled();
  });

  it("refuses a template that does not exist", async () => {
    asViewer("captain");
    expect(await createFromTemplateAction("gdpr_audit")).toEqual({
      ok: false,
      error: "That template doesn't exist.",
    });
    expect(createDraftFromTemplate).not.toHaveBeenCalled();
  });

  it("starts a draft for a lead, with a meal row per served meal, and sends nothing", async () => {
    asViewer("member", true);
    vi.mocked(getMealPlan).mockResolvedValue(plan);
    vi.mocked(createDraftFromTemplate).mockResolvedValue("post-burn-survey");
    expect(await createFromTemplateAction("post_burn_survey")).toEqual({
      ok: true,
      key: "post-burn-survey",
    });
    expect(createDraftFromTemplate).toHaveBeenCalledWith({
      template: "post_burn_survey",
      createdBy: "u1",
      mealRows: [
        { id: "meal_d1_dinner", label: "Day 1 dinner" },
        { id: "meal_d2_breakfast", label: "Day 2 breakfast" },
      ],
    });
    expect(publishDefinition).not.toHaveBeenCalled();
    expect(sendActivation).not.toHaveBeenCalled();
  });
});

describe("mealPlanRowsAction (#251)", () => {
  it("refuses a plain member", async () => {
    asViewer("member");
    expect((await mealPlanRowsAction()).ok).toBe(false);
    expect(getMealPlan).not.toHaveBeenCalled();
  });

  it("says so when the meal plan serves nothing yet", async () => {
    asViewer("captain");
    vi.mocked(getMealPlan).mockResolvedValue({
      cycle: 3,
      daysOnSite: 1,
      firstDay: null,
      days: [{ breakfast: 0, dinner: 0 }],
      version: 0,
      updatedAt: null,
    });
    const result = await mealPlanRowsAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no meals yet/);
  });
});

// --- The error contract -----------------------------------------------------
// A database error inside any of these actions is a sentence on the screen,
// never a throw to the error boundary (which would lose a captain's work).
describe("a database error", () => {
  const dbError = new Error("Failed query", {
    cause: new Error('duplicate key value violates unique constraint "x"'),
  });
  const generic = {
    ok: false,
    error: "Something went wrong. Please try again.",
  };

  it("comes back as a sentence from every lifecycle step", async () => {
    asViewer("captain");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDefinitionMetaRow).mockRejectedValue(dbError);
    vi.mocked(createDraft).mockRejectedValue(dbError);
    vi.mocked(closeActivation).mockRejectedValue(dbError);

    expect(await createDraftAction("Tent check")).toEqual(generic);
    expect(await unpublishAction("feedback")).toEqual(generic);
    expect(await deleteDraftAction("feedback")).toEqual(generic);
    expect(await setCarryOverAction("feedback", true)).toEqual(generic);
    expect(
      await closeActivationAction("00000000-0000-0000-0000-000000000000"),
    ).toEqual(generic);
    // publishAction keeps its own failure shape.
    expect(await publishAction("feedback")).toEqual({
      ok: false,
      errors: [generic.error],
      issues: [],
    });
    expect(setDefinitionCarryOver).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("closing a send names the captain who closed it", async () => {
    asViewer("captain");
    vi.mocked(closeActivation).mockResolvedValue({ ok: true });
    const id = "00000000-0000-0000-0000-000000000000";
    expect(await closeActivationAction(id)).toEqual({ ok: true });
    expect(closeActivation).toHaveBeenCalledWith(id, "u1");
  });
});

describe("setAnonymousResultsAction — its author or a captain", () => {
  it("refuses a team lead who did not write it, and a plain member", async () => {
    asViewer("member", true);
    expect(await setAnonymousResultsAction("feedback", true)).toEqual({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    asViewer("member");
    expect((await setAnonymousResultsAction("feedback", true)).ok).toBe(false);
    expect(setDefinitionAnonymousResults).not.toHaveBeenCalled();
  });

  it("sets it for its author, naming them on the audit row", async () => {
    asViewer("member", true);
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: "feedback",
      status: "draft",
      version: null,
      createdBy: "u1",
      anonymousResults: false,
    });
    vi.mocked(setDefinitionAnonymousResults).mockResolvedValue("ok");
    expect(await setAnonymousResultsAction("feedback", true)).toEqual({
      ok: true,
    });
    expect(setDefinitionAnonymousResults).toHaveBeenCalledWith(
      "feedback",
      true,
      "u1",
    );
  });

  it("says why names stay hidden once people answered with no names", async () => {
    asViewer("captain");
    vi.mocked(setDefinitionAnonymousResults).mockResolvedValue("answered");
    expect(await setAnonymousResultsAction("feedback", false)).toEqual({
      ok: false,
      error:
        "People already answered this with no names, so names stay hidden.",
    });
    vi.mocked(setDefinitionAnonymousResults).mockResolvedValue("open");
    expect(await setAnonymousResultsAction("feedback", false)).toEqual({
      ok: false,
      error:
        "People may be answering this now with no names. Close the send to show names.",
    });
  });
});
