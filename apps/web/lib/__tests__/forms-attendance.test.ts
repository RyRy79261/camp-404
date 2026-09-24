import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTENT_IMPLIED_BY_STATUS } from "@camp404/core";
import type { ParticipationIntent, ParticipationStatus } from "@camp404/types";

// The "Coming this year?" entry on My forms: it reads back the Yes / Maybe /
// No the member gave this year (not the captain's decision), shows no card
// until they have answered, and is the only place My forms shows that answer.

vi.mock("@/lib/users", () => ({
  getBurnerProfile: vi.fn(async () => null),
  getEmergencyContacts: vi.fn(),
  getIdDocuments: vi.fn(),
  saveBurnerProfileReplay: vi.fn(),
}));
vi.mock("@/lib/participations", () => ({
  getMyParticipation: vi.fn(),
  saveAttendanceAnswer: vi.fn(),
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

import { attendanceQuestionnaire } from "@camp404/types";
import {
  getReplayableForm,
  listAnsweredQuestionnaires,
  listCompletedForms,
} from "@/lib/forms";
import { listCompletedQuestionnaireAnswers } from "@camp404/db/questionnaire-responses";
import { ATTENDANCE_CHECK_KEY } from "@/lib/attendance-check";
import { getMyParticipation, saveAttendanceAnswer } from "@/lib/participations";
import { getQuestionnaireForPicker } from "@/lib/questionnaire-config";

const CREATED = new Date("2026-09-01T10:00:00Z");
const UPDATED = new Date("2026-09-05T10:00:00Z");

function row(
  status: ParticipationStatus,
  intent: ParticipationIntent = INTENT_IMPLIED_BY_STATUS[status],
) {
  return {
    cycle: 2027,
    status,
    intent,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("attendance form", () => {
  it("asks the fixed Yes / Maybe / No question, not the burner catalogue", async () => {
    const form = await getReplayableForm("attendance");

    expect(form).toMatchObject({
      key: "attendance",
      title: "Coming this year?",
      description:
        "Whether you're coming to AfrikaBurn with Camp 404 this year. Change it any time.",
    });
    expect(form!.questionnaire).toEqual(attendanceQuestionnaire());
    expect(getQuestionnaireForPicker).not.toHaveBeenCalled();
  });

  it.each<[ParticipationStatus, ParticipationIntent, string | undefined]>([
    ["applied", "yes", undefined],
    [
      "accepted",
      "yes",
      "You have a place this year. Choosing No gives it up; Maybe keeps it.",
    ],
    [
      "accepted",
      "maybe",
      "You have a place this year. Choosing No gives it up; Maybe keeps it.",
    ],
    [
      "waitlisted",
      "maybe",
      "You're on the waiting list. Choosing No takes you off it; Maybe keeps you on it.",
    ],
    ["maybe", "maybe", undefined],
    ["not_attending", "no", undefined],
  ])(
    "reads %s, answered %s, back as that answer",
    async (status, answer, notice) => {
      vi.mocked(getMyParticipation).mockResolvedValue(row(status, answer));
      const form = await getReplayableForm("attendance");

      const state = await form!.load("u1");

      expect(state).toEqual({
        responses: { coming: answer },
        completedAt: CREATED,
        updatedAt: UPDATED,
        ...(notice ? { notice } : {}),
      });
      expect(getMyParticipation).toHaveBeenCalledWith("u1");
    },
  );

  it("shows a card once the member has answered this year, and none before", async () => {
    vi.mocked(getMyParticipation).mockResolvedValue(null);
    expect(await listCompletedForms("u1")).toEqual([]);

    vi.mocked(getMyParticipation).mockResolvedValue(row("maybe"));
    expect(await listCompletedForms("u1")).toEqual([
      {
        key: "attendance",
        title: "Coming this year?",
        description:
          "Whether you're coming to AfrikaBurn with Camp 404 this year. Change it any time.",
        completedAt: CREATED,
        updatedAt: UPDATED,
      },
    ]);
  });

  it("saves the answer with its change-log entry under the form's version", async () => {
    const form = await getReplayableForm("attendance");
    const changes = [
      { fieldId: "coming", label: "Coming?", from: "Maybe", to: "No" },
    ];

    await form!.save("u1", { coming: "no" }, { editedByUserId: "u1", changes });

    expect(saveAttendanceAnswer).toHaveBeenCalledExactlyOnceWith({
      userId: "u1",
      intent: "no",
      edit: { version: "1", editedByUserId: "u1", changes },
    });
  });

  it("leaves the attendance questionnaire out of the read-only answers", async () => {
    // Its answer is the editable form above; a second, fixed copy would go
    // stale the moment the member changed it there.
    vi.mocked(listCompletedQuestionnaireAnswers).mockResolvedValue([
      { definitionKey: ATTENDANCE_CHECK_KEY },
      { definitionKey: "feedback" },
    ] as never);

    const answered = await listAnsweredQuestionnaires("u1");

    expect(answered.map((a) => a.definitionKey)).toEqual(["feedback"]);
  });
});
