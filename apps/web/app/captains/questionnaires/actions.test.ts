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
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
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

import {
  closeActivationAction,
  publishAction,
  sendAction,
  unpublishAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser } from "@/lib/users";
import { isTeamLead } from "@camp404/db/roster";
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
