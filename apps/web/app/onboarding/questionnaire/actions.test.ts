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
  getBurnerProfile: vi.fn(),
  hasCampAccess: vi.fn(),
  upsertBurnerProfile: vi.fn(),
  setIdDocuments: vi.fn(),
  setEmergencyContacts: vi.fn(),
  setProfileImage: vi.fn(),
  setTelegramHandle: vi.fn(),
  satisfyBurnerProfileAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(),
}));

import type { Questionnaire } from "@camp404/types";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { revalidatePath } from "next/cache";
import { saveBurnerProfile } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  setEmergencyContacts,
  setIdDocuments,
  setProfileImage,
  setTelegramHandle,
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
      approvalDecisionReason: null,
    });
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(getBurnerProfile).mockResolvedValue(null);
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

  it("refuses any save once the profile is complete, and writes nothing", async () => {
    vi.mocked(getBurnerProfile).mockResolvedValue({
      completedAt: new Date("2026-09-01"),
    } as never);

    for (const final of [false, true]) {
      const result = await saveBurnerProfile({}, final);
      expect(result).toEqual({
        ok: false,
        errors: { _form: expect.stringMatching(/already complete/) },
      });
    }
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
    expect(setIdDocuments).not.toHaveBeenCalled();
    expect(setProfileImage).not.toHaveBeenCalled();
  });

  it("does not mark the profile complete when the ID write fails", async () => {
    // The ID write now comes first, so a failure leaves nothing complete and
    // the member can submit again.
    vi.mocked(setIdDocuments).mockRejectedValue(new Error("encrypt failed"));
    const result = await saveBurnerProfile(responsesWithId, false);
    expect(result.ok).toBe(false);
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
  });

  it("copies a Telegram answer to the roster, and leaves it alone on a save without one", async () => {
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);

    await saveBurnerProfile(
      { ...responsesWithId, telegram: " @Nova_Reyes " },
      false,
    );
    expect(setTelegramHandle).toHaveBeenCalledExactlyOnceWith(
      "camp-1",
      "Nova_Reyes",
    );

    vi.mocked(setTelegramHandle).mockClear();
    await saveBurnerProfile(responsesWithId, false);
    expect(setTelegramHandle).not.toHaveBeenCalled();
  });

  it("refuses a bad Telegram answer on a draft save instead of clearing the handle", async () => {
    vi.mocked(setIdDocuments).mockResolvedValue(undefined);

    const result = await saveBurnerProfile(
      { ...responsesWithId, telegram: "nova-reyes" },
      false,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.telegram).toMatch(/Telegram/);
    expect(setTelegramHandle).not.toHaveBeenCalled();
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
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
    if (!result.ok)
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
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
          {
            id: "birthday",
            kind: "date",
            prompt: "Date of birth",
            required: true,
          },
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
    vi.mocked(getBurnerProfile).mockResolvedValue(null);
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
    const result = await saveBurnerProfile(
      { birthday: { nested: true } },
      false,
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors._form).toMatch(/unreadable or too large/i);
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
    // The profile was the gate: the console layout redraws its manifest.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses a final submit with a date of birth after today, writing nothing", async () => {
    // REFUSED CASE: the wizard checks the date locally, but this action takes
    // any POST, so the server checks it again on the final submit.
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(minimal);

    const result = await saveBurnerProfile({ birthday: "2999-01-01" }, true);

    expect(result).toEqual({
      ok: false,
      errors: {
        birthday: "Date of birth can't be in the future.",
        _form: "Check your ID number and date of birth.",
      },
    });
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
    expect(setIdDocuments).not.toHaveBeenCalled();
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

describe("saveBurnerProfile emergency contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "member@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      inviteCode: "INV",
      rank: "member",
      approvalStatus: "approved",
    } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(getBurnerProfile).mockResolvedValue(null);
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(catalogue);
  });

  it("stores the contacts on the member and keeps them out of the answers", async () => {
    const result = await saveBurnerProfile(
      {
        "emergency.1.name": "Ada Byron",
        "emergency.1.phone": "+27 82 555 0199",
        "emergency.1.relationship": "sister",
        "bio.statement": "Hi",
      },
      false,
    );

    expect(result.ok).toBe(true);
    expect(setEmergencyContacts).toHaveBeenCalledExactlyOnceWith("camp-1", [
      { name: "Ada Byron", phone: "+27 82 555 0199", relationship: "sister" },
    ]);
    const { responses } = vi.mocked(upsertBurnerProfile).mock.calls[0]![0]!;
    expect(responses).toEqual({ "bio.statement": "Hi" });
  });

  it("leaves stored contacts alone on a save from another page", async () => {
    await saveBurnerProfile({ "bio.statement": "Hi" }, false);

    expect(setEmergencyContacts).not.toHaveBeenCalled();
  });

  it("refuses a final submit with a half-filled second contact", async () => {
    const minimal: Questionnaire = {
      version: "test-1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "Emergency contacts",
          questions: catalogue.pages.flatMap((page) =>
            page.kind === "questions" && page.id === "emergency_contacts"
              ? page.questions
              : [],
          ),
        },
      ],
    };
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(minimal);

    const result = await saveBurnerProfile(
      {
        "emergency.1.name": "Ada Byron",
        "emergency.1.phone": "+27 82 555 0199",
        "emergency.1.relationship": "sister",
        "emergency.2.name": "Grace",
      },
      true,
    );

    expect(result).toEqual({
      ok: false,
      errors: {
        "emergency.2.phone": expect.any(String),
        "emergency.2.relationship": expect.any(String),
        _form: "Finish or clear your second emergency contact.",
      },
    });
    expect(upsertBurnerProfile).not.toHaveBeenCalled();
    expect(setEmergencyContacts).not.toHaveBeenCalled();
  });
});
