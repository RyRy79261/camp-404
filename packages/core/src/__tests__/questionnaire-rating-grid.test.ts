import { describe, expect, it } from "vitest";
import {
  starScaleLabels,
  type Questionnaire,
  type RatingGridQuestion,
} from "@camp404/types";
import {
  aggregateResponses,
  classifyChange,
  buildQuestionnaireCsvRows,
  validateQuestionnaireDefinition,
  type RatingGridAggregate,
} from "../index";

// The rating grid (#251) through the results engine, the CSV export and the
// publish check.

const MEALS: RatingGridQuestion = {
  id: "meals",
  kind: "rating_grid",
  prompt: "Rate the meals",
  display: "stars",
  rows: [
    { id: "d1_dinner", label: "Day 1 dinner" },
    { id: "d2_lunch", label: "Day 2 lunch" },
  ],
  scale: starScaleLabels(5),
  allowNa: true,
  naLabel: "Didn't eat it",
  required: false,
};

const DEF: Questionnaire = {
  version: "1",
  title: "Survey",
  pages: [{ id: "p1", kind: "questions", title: "Food", questions: [MEALS] }],
};

function gridAggregate(responses: Record<string, unknown>[]) {
  const result = aggregateResponses(DEF, responses as never);
  return result.questions[0] as RatingGridAggregate;
}

describe("aggregateResponses — rating_grid", () => {
  it("averages each row over the people who rated it, N/A kept apart", () => {
    const agg = gridAggregate([
      { meals: { d1_dinner: 5, d2_lunch: 2 } },
      { meals: { d1_dinner: 4, d2_lunch: "na" } },
      { meals: { d1_dinner: "na" } },
      {},
    ]);
    expect(agg.shape).toBe("rating_grid");
    expect(agg.display).toBe("stars");
    expect(agg.respondents).toBe(4);
    expect(agg.answered).toBe(3);
    const [dinner, lunch] = agg.rows;
    expect(dinner).toMatchObject({
      id: "d1_dinner",
      rated: 2,
      na: 1,
      mean: 4.5,
      counts: [0, 0, 0, 1, 1],
      known: true,
    });
    expect(lunch).toMatchObject({ rated: 1, na: 1, mean: 2 });
  });

  it("reports no average for a row nobody rated", () => {
    const agg = gridAggregate([{ meals: { d1_dinner: 3 } }]);
    expect(agg.rows[1]).toMatchObject({ rated: 0, na: 0, mean: null });
  });

  it("keeps a removed row, and never clamps a point past the scale", () => {
    const agg = gridAggregate([
      { meals: { d1_dinner: 7, gone_row: 2 } },
      { meals: { d1_dinner: 3 } },
    ]);
    expect(agg.rows[0]).toMatchObject({ rated: 2, mean: 5 });
    expect(agg.rows[0]?.counts).toEqual([0, 0, 1, 0, 0]);
    expect(agg.rows[2]).toMatchObject({
      id: "gone_row",
      label: "gone_row",
      known: false,
      rated: 1,
    });
  });

  it("names no respondent anywhere in the aggregate", () => {
    const agg = gridAggregate([{ meals: { d1_dinner: 5 } }]);
    expect(JSON.stringify(agg)).not.toMatch(/user|name|email/i);
  });
});

describe("buildQuestionnaireCsvRows — rating_grid", () => {
  it("spreads a rating grid over one column per row", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [MEALS],
      respondents: [
        {
          name: "Nova",
          cycle: 2027,
          definitionVersion: "1",
          submittedAt: null,
          responses: { meals: { d1_dinner: 4, d2_lunch: "na" } },
        },
        {
          name: "Rex",
          cycle: 2027,
          definitionVersion: "1",
          submittedAt: null,
          responses: {},
        },
      ],
    });
    expect(rows[0]?.slice(4)).toEqual([
      "Rate the meals: Day 1 dinner",
      "Rate the meals: Day 2 lunch",
    ]);
    expect(rows[1]?.slice(4)).toEqual(["4 stars", "Didn't eat it"]);
    expect(rows[2]?.slice(4)).toEqual(["—", "—"]);
  });
});

describe("validateQuestionnaireDefinition — rating_grid", () => {
  it("publishes a well-formed rating grid", () => {
    expect(validateQuestionnaireDefinition(DEF).ok).toBe(true);
  });

  it("refuses two rows with one id", () => {
    const bad = {
      ...DEF,
      pages: [
        {
          ...DEF.pages[0],
          questions: [
            {
              ...MEALS,
              rows: [
                { id: "same", label: "One" },
                { id: "same", label: "Two" },
              ],
            },
          ],
        },
      ],
    };
    const result = validateQuestionnaireDefinition(bad);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.code)).toContain(
      "duplicate_id",
    );
  });
});

describe("classifyChange — rating_grid and leads only", () => {
  const withGrid = (grid: Partial<RatingGridQuestion>): Questionnaire => ({
    ...DEF,
    pages: [
      {
        id: "p1",
        kind: "questions",
        title: "Food",
        questions: [{ ...MEALS, ...grid }],
      },
    ],
  });

  it("calls a reworded row cosmetic", () => {
    expect(
      classifyChange(
        DEF,
        withGrid({
          rows: [
            { id: "d1_dinner", label: "Monday dinner" },
            { id: "d2_lunch", label: "Day 2 lunch" },
          ],
        }),
      ),
    ).toBe("cosmetic");
  });

  it("calls a removed row, a shorter scale or N/A turned off breaking", () => {
    expect(classifyChange(DEF, withGrid({ rows: [MEALS.rows[0]!] }))).toBe(
      "breaking",
    );
    expect(classifyChange(DEF, withGrid({ scale: starScaleLabels(4) }))).toBe(
      "breaking",
    );
    expect(classifyChange(DEF, withGrid({ allowNa: false }))).toBe("breaking");
  });

  it("calls a question moved to team leads only breaking", () => {
    expect(classifyChange(DEF, withGrid({ leadsOnly: true }))).toBe("breaking");
  });
});
