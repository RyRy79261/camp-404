import { describe, expect, it } from "vitest";
import {
  Questionnaire,
  flattenQuestions,
  parseStoredDefinition,
} from "@camp404/types";
import {
  BURNER_PROFILE_TEMPLATE,
  DEFAULT_TEAM_OPTIONS,
  TEAM_INTERESTS_PAGE_ID,
  buildQuestionnaire,
} from "@/lib/questionnaire";

// The code-defined burner_profile questionnaire is a legacy-shape definition,
// and the unified questionnaire model (AB's shape, extended) must read it with
// nothing added and nothing lost — it is also what sits in stored
// questionnaire_definitions rows for it.

describe("the burner_profile definition under the unified model", () => {
  it("parses to identical JSON", () => {
    const parsed = Questionnaire.parse(BURNER_PROFILE_TEMPLATE);
    expect(parsed).toStrictEqual(BURNER_PROFILE_TEMPLATE);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(
      JSON.parse(JSON.stringify(BURNER_PROFILE_TEMPLATE)),
    );
  });

  it("parses when built from the default team set, as stored JSON", () => {
    const stored: unknown = JSON.parse(
      JSON.stringify(buildQuestionnaire(DEFAULT_TEAM_OPTIONS)),
    );
    expect(parseStoredDefinition(stored)).toEqual(stored);
  });

  it("keeps every question answerable (no question reads as a content block)", () => {
    const pages = BURNER_PROFILE_TEMPLATE.pages.filter(
      (page) => page.kind === "questions",
    );
    const blockCount = pages.reduce(
      (n, page) => n + (page.kind === "questions" ? page.questions.length : 0),
      0,
    );
    expect(flattenQuestions(BURNER_PROFILE_TEMPLATE)).toHaveLength(blockCount);
  });
});

describe("the team-interest page's promise", () => {
  // Audit #134: the page promised a team's follow-up questionnaire for any
  // team rated above zero, but nothing sends one (an optional `opt_in` send,
  // #313, is open to everyone, not addressed by these ratings).
  // It may only say what happens: captains read the answers.
  const text = BURNER_PROFILE_TEMPLATE.pages
    .filter((page) => page.id.startsWith(TEAM_INTERESTS_PAGE_ID))
    .map((page) => JSON.stringify(page))
    .join(" ");

  it("promises no follow-up questionnaire", () => {
    expect(text).not.toMatch(/questionnaire/i);
    expect(text).not.toMatch(/send you/i);
  });

  it("says who reads the answers", () => {
    expect(text).toContain("Captains see your answers");
  });
});
