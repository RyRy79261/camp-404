import { beforeEach, describe, expect, it, vi } from "vitest";

// saveAttendanceAnswer names the answer stored with the "Coming this year?"
// questionnaire, so the db write can rewrite it with the participation row and
// the questionnaire's results never disagree with the roster.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => false }));
vi.mock("@camp404/db/cycles", () => ({
  currentCycleNumber: vi.fn(async () => 2027),
}));
vi.mock("@camp404/db/participations", () => ({
  ATTENDANCE_EDIT_KEY: "attendance",
  decideParticipation: vi.fn(),
  getParticipation: vi.fn(),
  saveParticipationIntent: vi.fn(async () => ({
    status: "applied",
    changed: true,
    answerChanged: true,
    withdrew: false,
  })),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(),
}));

import { attendanceQuestionnaire, type Questionnaire } from "@camp404/types";
import { saveParticipationIntent } from "@camp404/db/participations";
import { ATTENDANCE_CHECK_KEY } from "@/lib/attendance-check";
import { saveAttendanceAnswer } from "@/lib/participations";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

/** The ready-made questionnaire with its question's id changed. */
function withQuestionId(id: string): Questionnaire {
  const q = attendanceQuestionnaire();
  const page = q.pages[0]!;
  if (page.kind !== "questions") throw new Error("expected a questions page");
  return {
    ...q,
    pages: [
      {
        ...page,
        questions: page.questions.map((question) => ({ ...question, id })),
      },
    ],
  } as Questionnaire;
}

beforeEach(() => vi.clearAllMocks());

describe("saveAttendanceAnswer", () => {
  it("names the questionnaire's participation_intent question", async () => {
    vi.mocked(getBuilderDefinition).mockResolvedValue(withQuestionId("q-7"));

    await saveAttendanceAnswer({ userId: "u1", intent: "maybe", edit: null });

    expect(getBuilderDefinition).toHaveBeenCalledWith(ATTENDANCE_CHECK_KEY);
    expect(saveParticipationIntent).toHaveBeenCalledExactlyOnceWith({
      userId: "u1",
      intent: "maybe",
      edit: null,
      cycle: 2027,
      response: { definitionKey: ATTENDANCE_CHECK_KEY, fieldId: "q-7" },
    });
  });

  it("names none when the camp has no such questionnaire", async () => {
    vi.mocked(getBuilderDefinition).mockResolvedValue(null);

    await saveAttendanceAnswer({ userId: "u1", intent: "yes", edit: null });

    expect(saveParticipationIntent).toHaveBeenCalledWith(
      expect.objectContaining({ response: null }),
    );
  });
});
