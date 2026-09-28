import { describe, expect, it } from "vitest";
import {
  SUBMIT_TARGET,
  flattenQuestions,
  type Questionnaire,
} from "@camp404/types";
import {
  answersLeadsOnly,
  leadsOnlyQuestionIds,
  questionnaireForViewer,
  resolvePath,
  validateSubmission,
} from "../index";

// "Team leads and up" questions and pages (#251).

const DEF: Questionnaire = {
  version: "1",
  title: "Survey",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Everyone",
      questions: [
        {
          id: "q_all",
          kind: "short_text",
          prompt: "For everyone",
          maxLength: 100,
          required: true,
        },
        {
          id: "q_leads",
          kind: "short_text",
          prompt: "For leads",
          maxLength: 100,
          required: true,
          leadsOnly: true,
        },
      ],
    },
    {
      id: "p2",
      kind: "questions",
      title: "Leads page",
      leadsOnly: true,
      questions: [
        {
          id: "q_page",
          kind: "boolean",
          prompt: "Leads page question",
          required: false,
        },
      ],
    },
    {
      id: "p3",
      kind: "questions",
      title: "Last",
      questions: [
        {
          id: "q_last",
          kind: "short_text",
          prompt: "Last",
          maxLength: 100,
          required: false,
        },
      ],
    },
  ],
};

const MEMBER = { seesLeadsOnly: false };
const LEAD = { seesLeadsOnly: true };

describe("leadsOnlyQuestionIds", () => {
  it("lists marked questions and every question on a marked page", () => {
    expect([...leadsOnlyQuestionIds(DEF)].sort()).toEqual([
      "q_leads",
      "q_page",
    ]);
  });
});

describe("questionnaireForViewer", () => {
  it("gives a lead or captain the whole definition", () => {
    expect(questionnaireForViewer(DEF, LEAD)).toBe(DEF);
  });

  it("gives a member no leads-only page or question", () => {
    const seen = questionnaireForViewer(DEF, MEMBER);
    expect(seen.pages.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(flattenQuestions(seen).map((q) => q.id)).toEqual([
      "q_all",
      "q_last",
    ]);
    expect(JSON.stringify(seen)).not.toContain("For leads");
  });

  it("walks a member past a removed page to the page after it", () => {
    expect(resolvePath(questionnaireForViewer(DEF, MEMBER), {})).toEqual([
      "p1",
      "p3",
    ]);
  });

  it("carries a branch into a removed page on to where that page went", () => {
    const branching: Questionnaire = {
      ...DEF,
      pages: [
        { ...DEF.pages[0]!, next: "p2" } as Questionnaire["pages"][number],
        {
          ...DEF.pages[1]!,
          next: SUBMIT_TARGET,
        } as Questionnaire["pages"][number],
        DEF.pages[2]!,
      ],
    };
    const seen = questionnaireForViewer(branching, MEMBER);
    // p2 ended the form; so does its stand-in for a member.
    expect(resolvePath(seen, {})).toEqual(["p1"]);
  });

  it("does not require a member to answer a required leads-only question", () => {
    const result = validateSubmission(questionnaireForViewer(DEF, MEMBER), {
      q_all: "hello",
    });
    expect(result.ok).toBe(true);
    // The whole definition would have required it.
    expect(validateSubmission(DEF, { q_all: "hello" }).ok).toBe(false);
  });
});

describe("answersLeadsOnly", () => {
  it("catches a member's answer to a leads-only question", () => {
    expect(answersLeadsOnly(DEF, MEMBER, { q_leads: "sneaky" })).toBe(true);
    expect(answersLeadsOnly(DEF, MEMBER, { q_page: false })).toBe(true);
  });

  it("lets a lead answer, and ignores an empty value", () => {
    expect(answersLeadsOnly(DEF, LEAD, { q_leads: "fine" })).toBe(false);
    expect(answersLeadsOnly(DEF, MEMBER, { q_leads: "", q_all: "x" })).toBe(
      false,
    );
  });
});
