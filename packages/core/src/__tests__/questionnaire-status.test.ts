import { describe, expect, it } from "vitest";
import {
  memberQuestionnaireStatuses,
  type QuestionnaireGateRow,
} from "../questionnaire-status";

// A captain sees where each questionnaire stands for a member, in the order
// the member meets them.

const at = (day: number) => new Date(Date.UTC(2026, 8, day));

function row(
  key: string,
  day: number,
  patch: Partial<QuestionnaireGateRow> = {},
): QuestionnaireGateRow {
  return {
    actionKey: key,
    title: key,
    status: "pending",
    blocking: true,
    dueAt: null,
    completedAt: null,
    createdAt: at(day),
    ...patch,
  };
}

describe("memberQuestionnaireStatuses", () => {
  it("puts the oldest pending blocking gate up next and queues the rest", () => {
    const result = memberQuestionnaireStatuses([
      row("safety", 3),
      row("burner_profile", 1, { status: "completed", completedAt: at(2) }),
      row("dietary", 4),
      row("survey", 2, { blocking: false }),
      row("old_form", 1, { status: "expired" }),
    ]);
    expect(result.map((q) => [q.key, q.status])).toEqual([
      ["burner_profile", "complete"],
      ["old_form", "expired"],
      ["survey", "optional"],
      ["safety", "next-up"],
      ["dietary", "locked"],
    ]);
  });

  it("treats a waived gate as closed", () => {
    expect(
      memberQuestionnaireStatuses([row("x", 1, { status: "waived" })])[0]
        ?.status,
    ).toBe("expired");
  });

  it("keeps the due date and completion time for display", () => {
    const [q] = memberQuestionnaireStatuses([
      row("safety", 1, { dueAt: at(20) }),
    ]);
    expect(q).toEqual({
      key: "safety",
      title: "safety",
      status: "next-up",
      dueAt: at(20),
      completedAt: null,
    });
  });
});
