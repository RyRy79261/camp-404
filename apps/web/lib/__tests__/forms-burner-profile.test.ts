import { beforeEach, describe, expect, it, vi } from "vitest";

// The burner profile's replay form: its emergency contacts live on `users`,
// split out of the answers by question role, and are merged back for the
// member's own form.

vi.mock("@/lib/users", () => ({
  getBurnerProfile: vi.fn(),
  getEmergencyContacts: vi.fn(),
  getIdDocuments: vi.fn(),
  saveBurnerProfileReplay: vi.fn(),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForPicker: vi.fn(),
  getQuestionnaireForResponses: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-edits", () => ({
  listQuestionnaireEdits: vi.fn(),
  recordQuestionnaireEdit: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-responses", () => ({
  listCompletedQuestionnaireAnswers: vi.fn(),
}));

import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { getReplayableForm } from "@/lib/forms";
import { buildQuestionnaire } from "@/lib/questionnaire";
import {
  getQuestionnaireForPicker,
  getQuestionnaireForResponses,
} from "@/lib/questionnaire-config";
import {
  getBurnerProfile,
  getEmergencyContacts,
  getIdDocuments,
  saveBurnerProfileReplay,
} from "@/lib/users";

const catalogue = buildQuestionnaire(
  DEFAULT_TEAMS.map((t) => ({ value: t.key, label: t.label })),
);
const ADA = {
  name: "Ada Byron",
  phone: "+27 82 555 0199",
  relationship: "sister",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getQuestionnaireForPicker).mockResolvedValue(catalogue);
  vi.mocked(getQuestionnaireForResponses).mockResolvedValue(catalogue);
});

describe("burner profile replay", () => {
  it("merges the stored contacts back into the member's own form", async () => {
    vi.mocked(getBurnerProfile).mockResolvedValue({
      responses: { "bio.statement": "Hi" },
      completedAt: new Date("2026-09-01"),
      updatedAt: null,
    } as never);
    vi.mocked(getIdDocuments).mockResolvedValue(null);
    vi.mocked(getEmergencyContacts).mockResolvedValue([ADA]);

    const form = await getReplayableForm("burner_profile");
    const state = await form!.load("user-1");

    expect(state?.responses).toMatchObject({
      "bio.statement": "Hi",
      "emergency.1.name": "Ada Byron",
      "emergency.1.phone": "+27 82 555 0199",
      "emergency.1.relationship": "sister",
    });
  });

  it("saves answers, contacts and the change log in one write", async () => {
    const form = await getReplayableForm("burner_profile");
    const changes = [
      {
        fieldId: "bio.statement",
        label: "Tell us about yourself",
        from: "",
        to: "Hi",
      },
    ];
    await form!.save(
      "user-1",
      {
        "bio.statement": "Hi",
        "id.type": "passport",
        "id.number": "A1234567",
        "emergency.1.name": "Ada Byron",
        "emergency.1.phone": "+27 82 555 0199",
        "emergency.1.relationship": "sister",
      },
      { editedByUserId: "user-1", changes },
    );

    expect(saveBurnerProfileReplay).toHaveBeenCalledExactlyOnceWith({
      userId: "user-1",
      version: expect.any(String),
      responses: { "bio.statement": "Hi", "id.type": "passport" },
      id: { idType: "passport", idNumber: "A1234567" },
      emergencyContacts: [ADA],
      edit: {
        questionnaireKey: "burner_profile",
        editedByUserId: "user-1",
        changes,
      },
    });
  });
});
