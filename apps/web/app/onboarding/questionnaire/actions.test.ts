import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server-side half of the stage 2→3 fix: when persistence throws (e.g.
// encrypt() with no PGCRYPTO_KEY), saveBurnerProfile must RETURN a typed
// {ok:false, errors:{_form}} rather than throw. The e2e can't reach this branch
// (E2E_TEST_MODE bypasses encryption), so it's guarded here by mocking the
// persistence layer — which also keeps the real server-only / DB modules out.

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserOrRedirect: vi.fn(),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  upsertBurnerProfile: vi.fn(),
  setIdDocuments: vi.fn(),
  setProfileImage: vi.fn(),
  satisfyBurnerProfileAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(),
}));

import type { Questionnaire } from "@camp404/types";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { saveBurnerProfile } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  setIdDocuments,
  setProfileImage,
  upsertBurnerProfile,
} from "@/lib/users";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";
import { buildQuestionnaire } from "@/lib/questionnaire";

const responsesWithId = {
  "id.type": "passport",
  "id.number": "A1234567",
  birthday: "1990-04-12",
};

// The config-built catalogue the action validates a final submit against.
const catalogue = buildQuestionnaire(
  DEFAULT_TEAMS.map((t) => ({ value: t.key, label: t.label })),
);

describe("saveBurnerProfile persistence error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "member@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      authUserId: "auth-1",
      displayName: "Member",
      profileImageUrl: null,
      inviteCode: "INV",
      rank: "member",
      approvalStatus: "approved",
    });
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(upsertBurnerProfile).mockResolvedValue(undefined);
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(catalogue);
    // Silence the intentional console.error in the catch.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a typed _form error (not a throw) when ID encryption fails", async () => {
    vi.mocked(setIdDocuments).mockRejectedValue(
      new Error("PGCRYPTO_KEY env var is required"),
    );

    const result = await saveBurnerProfile(responsesWithId, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._form).toMatch(/couldn't save/i);
    }
  });

  it("returns ok on a successful non-final save", async () => {
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);

    const result = await saveBurnerProfile(responsesWithId, false);

    expect(result.ok).toBe(true);
  });

  it("validates a final submit against the config-built catalogue", async () => {
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);

    // A final submit missing required answers must be rejected by
    // validateResponses(getQuestionnaireForResponses()) before any persistence.
    const result = await saveBurnerProfile(responsesWithId, true);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
  });
});

describe("saveBurnerProfile response bounds", () => {
  // A one-question catalogue, so a FINAL submit can actually succeed here and
  // we can inspect what got persisted. The full catalogue is used for the
  // allow-list case below, where the real question ids are the point.
  const minimal: Questionnaire = {
    version: "test-1",
    pages: [
      {
        id: "p1",
        kind: "questions",
        title: "Basics",
        questions: [
          { id: "birthday", kind: "date", prompt: "Date of birth", required: true },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "member@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      authUserId: "auth-1",
      displayName: "Member",
      profileImageUrl: null,
      inviteCode: "INV",
      rank: "member",
      approvalStatus: "approved",
    } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(upsertBurnerProfile).mockResolvedValue(undefined);
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);
    vi.mocked(setProfileImage).mockResolvedValue(undefined);
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(catalogue);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists only catalogue keys on a non-final save", async () => {
    // REFUSED CASE: `smuggled` is not a question id, so it must never reach
    // burner_profiles.responses — a draft save used to store the raw cast.
    const result = await saveBurnerProfile(
      { birthday: "1990-04-12", smuggled: "x" },
      false,
    );

    expect(result.ok).toBe(true);
    expect(upsertBurnerProfile).toHaveBeenCalledTimes(1);
    const { responses } = vi.mocked(upsertBurnerProfile).mock.calls[0]![0]!;
    expect(responses).toEqual({ birthday: "1990-04-12" });
    expect("smuggled" in responses).toBe(false);
  });

  it("rejects a structurally malformed draft without persisting", async () => {
    // REFUSED CASE: nested objects aren't a legal response value; the draft
    // path had no Zod parse at all before this.
    const result = await saveBurnerProfile({ birthday: { nested: true } }, false);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors._form).toMatch(/unreadable or too large/i);
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
  });

  it("persists the validator's normalised output on a final save, not the raw payload", async () => {
    // REGRESSION GUARD: the action used to compute result.responses and then
    // persist the raw client cast instead, so unknown keys survived a FINAL
    // submit too.
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(minimal);

    const result = await saveBurnerProfile(
      { birthday: "1990-04-12", smuggled: "x" },
      true,
    );

    expect(result.ok).toBe(true);
    expect(upsertBurnerProfile).toHaveBeenCalledTimes(1);
    const { responses } = vi.mocked(upsertBurnerProfile).mock.calls[0]![0]!;
    expect(responses).toEqual({ birthday: "1990-04-12" });
  });

  it("still captures id.number and profile.image on a non-final save", async () => {
    // The over-eager-allow-list guard: both ids ARE catalogue questions, so
    // splitIdNumber and setProfileImage must still see them on a draft save.
    const result = await saveBurnerProfile(
      {
        "id.type": "passport",
        "id.number": "A1234567",
        "profile.image": "https://blob.example/avatar.png",
      },
      false,
    );

    expect(result.ok).toBe(true);
    expect(setIdDocuments).toHaveBeenCalledWith("camp-1", {
      idType: "passport",
      idNumber: "A1234567",
    });
    expect(setProfileImage).toHaveBeenCalledWith(
      "camp-1",
      "https://blob.example/avatar.png",
    );
  });
});
