import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateQuestionnaireDefinition,
  type DefinitionIssue,
} from "@camp404/core";
import type { Questionnaire } from "@camp404/types";
import {
  DefinitionIssuePanel,
  IssueNote,
  blockIssues,
  issueLocation,
  issueMessage,
  locateIssues,
  optionIssues,
  questionnaireIssues,
  sectionIssues,
} from "../definition-issues";

// An issue hangs on the section, block or option it is about: by the page and
// block ids when it carries them (they survive a reorder), else by its path.

afterEach(cleanup);

const DEF: Questionnaire = {
  version: "1",
  title: "Food",
  pages: [
    {
      id: "s1",
      kind: "questions",
      title: "About you",
      questions: [
        {
          id: "name",
          kind: "short_text",
          prompt: "Name",
          maxLength: 80,
          required: false,
        },
        {
          id: "diet",
          kind: "single_select",
          prompt: "Diet",
          required: false,
          options: [
            { value: "veg", label: "Vegetarian" },
            { value: "veg", label: "Vegan" },
          ],
        },
      ],
    },
    { id: "s2", kind: "questions", title: "", questions: [] },
  ],
};

function issue(partial: Partial<DefinitionIssue>): DefinitionIssue {
  return { path: "", code: "empty_page", message: "m", ...partial };
}

describe("issueLocation", () => {
  it("reads both path dialects", () => {
    expect(
      issueLocation(issue({ path: "pages[1].questions[0].options[2].goTo" })),
    ).toEqual({ pageIndex: 1, blockIndex: 0, optionIndex: 2 });
    expect(
      issueLocation(issue({ path: "pages.0.questions.1.prompt" })),
    ).toEqual({ pageIndex: 0, blockIndex: 1, optionIndex: null });
    expect(issueLocation(issue({ path: "title" }))).toEqual({
      pageIndex: null,
      blockIndex: null,
      optionIndex: null,
    });
  });

  it("follows the ids when the path is stale (the author reordered since)", () => {
    // The server checked a draft where diet was block 0 on page 1.
    const stale = issue({
      path: "pages[1].questions[0].role",
      pageId: "s1",
      blockId: "diet",
    });
    expect(issueLocation(stale, DEF)).toEqual({
      pageIndex: 0,
      blockIndex: 1,
      optionIndex: null,
    });
  });

  it("falls back to the path for an id the draft no longer has", () => {
    expect(
      issueLocation(issue({ path: "pages[1].title", pageId: "gone" }), DEF),
    ).toEqual({ pageIndex: 1, blockIndex: null, optionIndex: null });
  });
});

describe("locateIssues on the real validator's output", () => {
  const result = validateQuestionnaireDefinition(DEF);
  const issues = locateIssues(result.ok ? [] : result.issues, DEF);

  it("puts each issue on its option, block, section or the questionnaire", () => {
    expect(optionIssues(issues, 0, 1, 1).map((i) => i.code)).toEqual([
      "duplicate_option_value",
    ]);
    expect(blockIssues(issues, 0, 1)).toHaveLength(1);
    expect(
      sectionIssues(issues, 1)
        .map((i) => i.code)
        .sort(),
    ).toEqual(["empty_page", "missing_page_title"]);
    expect(questionnaireIssues(issues)).toEqual([]);
  });

  it("says an empty box plainly instead of Zod's words", () => {
    const shape = validateQuestionnaireDefinition({
      ...DEF,
      pages: [
        {
          ...DEF.pages[0]!,
          questions: [
            { id: "q", kind: "short_text", prompt: "", maxLength: 80 },
          ],
        },
      ],
    });
    expect(shape.ok).toBe(false);
    const located = locateIssues(shape.ok ? [] : shape.issues, DEF);
    expect(located.map((i) => i.message)).toEqual(["Write the question."]);
    expect(located[0]!.location).toMatchObject({ pageIndex: 0, blockIndex: 0 });
    expect(
      issueMessage(issue({ code: "empty_page", message: "Kept as it is." })),
    ).toBe("Kept as it is.");
  });
});

describe("DefinitionIssuePanel and IssueNote", () => {
  it("counts the problems, names where each one is, and links to it", () => {
    const result = validateQuestionnaireDefinition(DEF);
    const issues = locateIssues(result.ok ? [] : result.issues, DEF);
    render(
      <DefinitionIssuePanel
        issues={issues}
        sectionTitles={["About you", ""]}
        blocking="publish"
        anchorFor={(i) => (i.location.pageIndex === 1 ? "section-s2" : null)}
      />,
    );
    expect(screen.getByText("3 problems are blocking publishing")).toBeTruthy();
    expect(screen.getByText("About you · Block 2 · Option 2")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Section 2" });
    expect(links[0]!.getAttribute("href")).toBe("#section-s2");
  });

  it("says a draft save is what is blocked, and draws nothing with no issues", () => {
    const { container, rerender } = render(
      <DefinitionIssuePanel issues={[]} sectionTitles={[]} blocking="save" />,
    );
    expect(container.textContent).toBe("");
    rerender(
      <DefinitionIssuePanel
        issues={locateIssues(
          [issue({ path: "pages.0.questions.0.prompt", code: "shape" })],
          DEF,
        )}
        sectionTitles={["About you"]}
        blocking="save"
      />,
    );
    expect(screen.getByText("1 problem is blocking this save")).toBeTruthy();
  });

  it("lists an inline note's messages", () => {
    render(<IssueNote issues={[issue({ message: "Write the question." })]} />);
    expect(screen.getByText("Write the question.")).toBeTruthy();
  });
});
