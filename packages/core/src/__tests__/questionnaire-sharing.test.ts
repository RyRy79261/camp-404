import { describe, expect, it } from "vitest";
import type { Question } from "@camp404/types";
import {
  type SharedRespondent,
  canReadQuestionnaireResults,
  canSendQuestionnaireTo,
  isSharedResultQuestion,
  sharedResults,
} from "../questionnaire-sharing";

const pick = {
  id: "size",
  kind: "single_select",
  prompt: "How many sleep in your tent?",
  options: [
    { value: "one", label: "1" },
    { value: "two", label: "2" },
  ],
  allowOther: true,
  required: true,
} as Question;

const note = {
  id: "note",
  kind: "short_text",
  prompt: "Anything else?",
  required: false,
} as Question;

const email = {
  id: "mail",
  kind: "email",
  prompt: "Your email",
  required: false,
} as Question;

const allergies = {
  id: "allergies",
  kind: "short_text",
  prompt: "Allergies",
  role: "dietary_allergies",
  required: false,
} as Question;

const coming = {
  id: "coming",
  kind: "single_select",
  prompt: "Coming this year?",
  role: "participation_intent",
  options: [{ value: "yes", label: "Yes" }],
  required: true,
} as Question;

describe("canSendQuestionnaireTo", () => {
  it("lets a team lead send to the whole camp, like a captain", () => {
    for (const rank of ["team_lead", "captain"] as const) {
      for (const scope of [
        "everyone",
        "team_leads",
        "individual",
        "opt_in",
      ] as const) {
        expect(canSendQuestionnaireTo({ rank }, { scope })).toBe(true);
      }
      expect(
        canSendQuestionnaireTo({ rank }, { scope: "team", team: "kitchen" }),
      ).toBe(true);
    }
  });

  it("refuses a plain member, a team scope with no team and other scopes", () => {
    expect(
      canSendQuestionnaireTo({ rank: "camp_member" }, { scope: "everyone" }),
    ).toBe(false);
    expect(canSendQuestionnaireTo({ rank: "captain" }, { scope: "team" })).toBe(
      false,
    );
    expect(canSendQuestionnaireTo({ rank: "captain" }, { scope: "car" })).toBe(
      false,
    );
    expect(
      canSendQuestionnaireTo({ rank: "captain" }, { scope: "drivers" }),
    ).toBe(false);
  });
});

describe("canReadQuestionnaireResults", () => {
  it("opens results to captains, the author and anyone who answered", () => {
    const base = { rank: "camp_member" as const, isAuthor: false };
    expect(canReadQuestionnaireResults({ ...base, answered: false })).toBe(
      false,
    );
    expect(canReadQuestionnaireResults({ ...base, answered: true })).toBe(true);
    expect(
      canReadQuestionnaireResults({ ...base, isAuthor: true, answered: false }),
    ).toBe(true);
    expect(
      canReadQuestionnaireResults({
        rank: "captain",
        isAuthor: false,
        answered: false,
      }),
    ).toBe(true);
    expect(
      canReadQuestionnaireResults({
        rank: "team_lead",
        isAuthor: false,
        answered: false,
      }),
    ).toBe(false);
  });
});

describe("isSharedResultQuestion", () => {
  it("shares opinions, never a role, a contact detail or an upload", () => {
    expect(isSharedResultQuestion(pick)).toBe(true);
    expect(isSharedResultQuestion(note)).toBe(true);
    expect(isSharedResultQuestion(email)).toBe(false);
    expect(isSharedResultQuestion(allergies)).toBe(false);
    expect(isSharedResultQuestion(coming)).toBe(false);
  });
});

describe("sharedResults", () => {
  const respondents: SharedRespondent[] = [
    {
      name: "Caitlin",
      responses: {
        size: "one",
        note: "Near the kitchen",
        mail: "c@example.com",
        allergies: "Peanuts",
        coming: "yes",
        removed: "old answer",
      },
    },
    {
      name: "Lee",
      responses: { size: "other:I have a severe nut allergy", note: "Gazebo" },
    },
  ];

  it("counts and names only the shared questions", () => {
    const result = sharedResults({
      questions: [pick, note, email, allergies, coming],
      respondents,
      anonymous: false,
    });
    expect(result.questions.map((q) => q.id)).toEqual(["size", "note"]);
    expect(result.aggregate.questions.map((q) => q.questionId)).toEqual([
      "size",
      "note",
    ]);
    // A hidden or removed question leaves not even a count.
    expect(result.aggregate.orphans).toEqual([]);
    expect(result.answers.size).toEqual([
      { name: "Caitlin", text: "1" },
      { name: "Lee", text: "Other" },
    ]);
    expect(result.answers.note).toEqual([
      { name: "Caitlin", text: "Near the kitchen" },
      { name: "Lee", text: "Gazebo" },
    ]);
    const all = JSON.stringify(result);
    for (const secret of ["Peanuts", "c@example.com", "nut allergy", "old"]) {
      expect(all).not.toContain(secret);
    }
  });

  it("names nobody when anonymous, and lists only written answers", () => {
    const result = sharedResults({
      questions: [pick, note],
      respondents,
      anonymous: true,
    });
    expect(result.answers.size).toEqual([]);
    expect(result.answers.note).toEqual([
      { name: null, text: "Gazebo" },
      { name: null, text: "Near the kitchen" },
    ]);
    const all = JSON.stringify(result);
    expect(all).not.toContain("Caitlin");
    expect(all).not.toContain("Lee");
  });
});
