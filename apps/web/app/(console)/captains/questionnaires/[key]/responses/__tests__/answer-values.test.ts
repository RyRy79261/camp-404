import { describe, expect, it } from "vitest";
import { Question } from "@camp404/types";
import type { Respondent } from "../../metrics/results-data";
import {
  buildQuestionnaireCsvRows,
  EMPTY_ANSWER,
  neutraliseFormula,
} from "@camp404/core";
import { answerColumns, formatAnswer } from "../answer-values";

const q = (input: unknown) => Question.parse(input);

const drives = q({
  id: "drives",
  kind: "single_select",
  prompt: "Driving?",
  options: [
    { value: "yes", label: "Yes, I'm driving" },
    { value: "no", label: "No, I need a seat" },
  ],
});
const vegan = q({
  id: "vegan",
  kind: "single_select",
  prompt: "Vegan?",
  options: [
    { value: "yes", label: "Yes, vegan" },
    { value: "no", label: "No" },
  ],
});

function respondent(
  responses: Respondent["responses"],
  over: Partial<Respondent> = {},
): Respondent {
  return {
    userId: "u1",
    name: "Ada",
    profileImageUrl: null,
    completedAt: new Date("2027-02-01T10:00:00Z"),
    definitionVersion: "1",
    responses,
    ...over,
  };
}

describe("answerColumns", () => {
  it("keeps the questionnaire's order and appends what it no longer asks", () => {
    const columns = answerColumns(
      [drives, vegan],
      [respondent({ drives: "yes", removed_field: "still here" })],
    );

    expect(columns.map((c) => c.id)).toEqual([
      "drives",
      "vegan",
      "removed_field",
    ]);
    // Marked, so a captain reading the table knows why the header looks like a
    // field id — but present, because the answer is real.
    expect(columns[2]).toMatchObject({
      label: "removed_field (removed)",
      question: null,
    });
  });

  it("ignores an orphan key whose value is empty", () => {
    const columns = answerColumns(
      [drives],
      [respondent({ drives: "yes", stale: "", alsoStale: [] })],
    );
    expect(columns.map((c) => c.id)).toEqual(["drives"]);
  });
});

describe("formatAnswer", () => {
  const columns = answerColumns([drives, vegan], []);
  const [drivesCol, veganCol] = columns;

  it("resolves each question's own option labels", () => {
    // The same stored value, two different questions, two different labels.
    expect(formatAnswer(drivesCol!, { drives: "yes" })).toBe(
      "Yes, I'm driving",
    );
    expect(formatAnswer(veganCol!, { vegan: "yes" })).toBe("Yes, vegan");
  });

  it("prints an option the questionnaire has dropped as its raw value", () => {
    expect(formatAnswer(drivesCol!, { drives: "maybe" })).toBe("maybe");
  });

  it("returns empty for no answer, so the caller decides how a blank reads", () => {
    expect(formatAnswer(drivesCol!, {})).toBe("");
    expect(formatAnswer(drivesCol!, { drives: null })).toBe("");
  });

  it("prints an orphaned answer from the raw value", () => {
    const [orphan] = answerColumns([], [respondent({ gone: ["a", "b"] })]);
    expect(formatAnswer(orphan!, { gone: ["a", "b"] })).toBe("a, b");
    expect(formatAnswer(orphan!, { gone: true })).toBe("Yes");
  });
});

// The property item 8 of the Wave 3 gate asks for: the table on screen and the
// downloaded CSV must resolve a stored value through ONE label path. They used
// to have two — the page formatted its own grid and the button escaped it with
// a private copy of the CSV rules — and the two disagreed about a negative
// number. These tests fail if a second path ever grows back.
describe("the screen and the CSV agree", () => {
  const questions = [drives, vegan];

  function csvCellsFor(people: Respondent[]): string[][] {
    return buildQuestionnaireCsvRows({
      questions,
      respondents: people.map((r) => ({
        name: r.name,
        cycle: 2027,
        definitionVersion: r.definitionVersion ?? "",
        submittedAt: r.completedAt,
        responses: r.responses,
      })),
      // `buildQuestionnaireCsvRows` returns CsvCell[][]; every questionnaire
      // column is a string by construction, so narrowing here is safe and keeps
      // the comparison below honest about what is being compared.
    }).map((row) => row.map((cell) => String(cell ?? "")));
  }

  it("prints the same string for every answered cell", () => {
    const people = [
      respondent({ drives: "yes", vegan: "no" }),
      // A value whose option the captain has since deleted (property 3), and a
      // second member so the row indexing is actually exercised.
      respondent({ drives: "maybe" }, { userId: "u2", name: "Grace" }),
    ];
    const columns = answerColumns(questions, people);
    const csv = csvCellsFor(people);

    // Four fixed columns (Member, Year, Submitted, Version) precede the
    // question columns in the CSV.
    const FIXED = 4;
    people.forEach((person, personIndex) => {
      columns.forEach((column, columnIndex) => {
        const onScreen = formatAnswer(column, person.responses);
        if (onScreen === "") return; // a skip; asserted separately below
        expect(csv[personIndex + 1]?.[FIXED + columnIndex]).toBe(onScreen);
      });
    });

    // And the deleted option really did reach both surfaces as its raw value,
    // so the loop above was not comparing two empty sets.
    expect(csv[2]?.[FIXED]).toBe("maybe");
  });

  it("spells a skip the same way on both surfaces", () => {
    const people = [respondent({ drives: "yes" })];
    const csv = csvCellsFor(people);
    // The screen renders `formatAnswer`'s empty string as the same sentinel the
    // CSV writes, so an unanswered question reads as "asked, not answered" in
    // both places rather than as a missing column in one.
    expect(
      formatAnswer(answerColumns(questions, people)[1]!, people[0]!.responses),
    ).toBe("");
    expect(csv[1]?.[5]).toBe(EMPTY_ANSWER);
  });

  it("leaves a negative number alone while still defusing a formula", () => {
    // The deleted duplicate escaped `-3` as `'-3`, mangling every numeric
    // column. The shared serialiser exempts a plain number and still defuses
    // anything a spreadsheet would execute.
    expect(neutraliseFormula("-3")).toBe("-3");
    expect(neutraliseFormula("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(neutraliseFormula("+1 555 0100")).toBe("'+1 555 0100");
  });
});
