import { describe, expect, it } from "vitest";
import {
  Questionnaire,
  QuestionnaireResponseValue,
  RATING_GRID_NA,
  diffResponses,
  displayResponseValue,
  starScaleLabels,
  validateOne,
  type Questionnaire as QuestionnaireType,
  type RatingGridQuestion,
} from "../index";
import { safeParseStoredDefinition } from "../questionnaire-legacy";

// The rating grid (#251): statements rated on one shared scale, stored as
// `{ rowId: position | "na" }`.

const LIKERT: RatingGridQuestion = {
  id: "shifts",
  kind: "rating_grid",
  prompt: "About the shifts",
  rows: [
    { id: "fair", label: "The shifts were fair" },
    { id: "clear", label: "I knew when my shift was" },
  ],
  scale: [
    "Definitely false",
    "Mostly false",
    "Not sure",
    "Mostly true",
    "Definitely true",
  ],
  allowNa: true,
  required: true,
};

const STARS: RatingGridQuestion = {
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

describe("validateOne — rating_grid", () => {
  it("accepts a position on the scale for every row, and N/A where offered", () => {
    expect(validateOne(LIKERT, { fair: 5, clear: RATING_GRID_NA })).toEqual({
      ok: true,
      value: { fair: 5, clear: "na" },
    });
  });

  it("drops a row the grid does not have", () => {
    expect(validateOne(LIKERT, { fair: 1, clear: 2, ghost: 3 })).toEqual({
      ok: true,
      value: { fair: 1, clear: 2 },
    });
  });

  it("refuses a position past either end of the scale", () => {
    expect(validateOne(LIKERT, { fair: 6, clear: 1 })).toEqual({
      ok: false,
      error: 'Pick a rating for "The shifts were fair"',
    });
    expect(validateOne(LIKERT, { fair: 0, clear: 1 })).toMatchObject({
      ok: false,
    });
    expect(validateOne(LIKERT, { fair: 2.5, clear: 1 })).toMatchObject({
      ok: false,
    });
  });

  it("refuses N/A when the grid does not offer it", () => {
    const noNa = { ...LIKERT, allowNa: false };
    expect(validateOne(noNa, { fair: "na", clear: 1 })).toEqual({
      ok: false,
      error: 'Pick a rating for "The shifts were fair"',
    });
  });

  it("refuses a text answer that is not N/A", () => {
    expect(validateOne(LIKERT, { fair: "5", clear: 1 })).toMatchObject({
      ok: false,
    });
  });

  it("requires every row of a required grid", () => {
    expect(validateOne(LIKERT, { fair: 3 })).toEqual({
      ok: false,
      error: 'Answer every row. "I knew when my shift was" is missing',
    });
  });

  it("lets an optional grid be skipped, or answered in part", () => {
    expect(validateOne(STARS, {})).toEqual({ ok: true, value: undefined });
    expect(validateOne(STARS, { d2_lunch: 4 })).toEqual({
      ok: true,
      value: { d2_lunch: 4 },
    });
  });

  it("refuses a list or a scalar in place of the row map", () => {
    expect(validateOne(STARS, [1, 2])).toMatchObject({ ok: false });
    expect(validateOne(STARS, 4)).toMatchObject({ ok: false });
  });
});

describe("the response map", () => {
  it("parses a rating grid answer beside the older grid answer", () => {
    expect(
      QuestionnaireResponseValue.safeParse({ fair: 3, clear: "na" }).success,
    ).toBe(true);
    // A grid answer stored before the rating grid existed parses as before.
    expect(
      QuestionnaireResponseValue.safeParse({ mon: ["am"], tue: [] }).success,
    ).toBe(true);
  });

  it("refuses a map that mixes the two shapes, or holds other text", () => {
    expect(
      QuestionnaireResponseValue.safeParse({ fair: 3, mon: ["am"] }).success,
    ).toBe(false);
    expect(QuestionnaireResponseValue.safeParse({ fair: "5" }).success).toBe(
      false,
    );
  });
});

describe("displayResponseValue — rating_grid", () => {
  it("names each answered row with its point's label", () => {
    expect(displayResponseValue(LIKERT, { fair: 5, clear: "na" })).toBe(
      "The shifts were fair: Definitely true; I knew when my shift was: N/A",
    );
  });

  it("uses the question's own N/A label, and star labels", () => {
    expect(displayResponseValue(STARS, { d1_dinner: 1, d2_lunch: "na" })).toBe(
      "Day 1 dinner: 1 star; Day 2 lunch: Didn't eat it",
    );
  });

  it("shows a dash for an empty map", () => {
    expect(displayResponseValue(STARS, {})).toBe("—");
  });
});

describe("diffResponses — rating_grid", () => {
  const def: QuestionnaireType = {
    version: "1",
    pages: [{ id: "p1", kind: "questions", title: "P", questions: [LIKERT] }],
  };

  it("sees a changed row, and not a re-ordered map", () => {
    expect(
      diffResponses(
        def,
        { shifts: { fair: 1, clear: 2 } },
        {
          shifts: { clear: 2, fair: 1 },
        },
      ),
    ).toEqual([]);
    const changes = diffResponses(
      def,
      { shifts: { fair: 1, clear: 2 } },
      { shifts: { fair: 4, clear: 2 } },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.to).toContain("Mostly true");
  });
});

describe("backward compatibility", () => {
  // A definition as it was stored before the rating grid and leadsOnly
  // existed: builder shape, with an older grid, a rating and a condition.
  const STORED_BEFORE = {
    version: "3",
    title: "Gear check",
    pages: [
      {
        id: "p1",
        type: "question",
        title: "Gear",
        blocks: [
          {
            kind: "question",
            question: {
              id: "tent",
              kind: "single_select",
              prompt: "Tent?",
              options: [
                { value: "dome", label: "Dome" },
                { value: "bell", label: "Bell" },
              ],
              required: true,
            },
          },
          {
            kind: "question",
            question: {
              id: "pegs",
              kind: "short_text",
              prompt: "How many pegs?",
              maxLength: 20,
              required: false,
            },
            visibleIf: { fieldId: "tent", op: "eq", value: "bell" },
          },
        ],
      },
    ],
  };

  const UNIFIED_BEFORE = {
    version: "2",
    title: "Survey",
    pages: [
      {
        id: "p1",
        kind: "questions",
        title: "Grid",
        questions: [
          {
            id: "g",
            kind: "multi_choice_grid",
            prompt: "Days",
            rows: [{ id: "mon", label: "Monday" }],
            columns: [{ value: "am", label: "Morning" }],
            required: true,
          },
          {
            id: "r",
            kind: "rating",
            prompt: "Rate it",
            steps: 5,
            required: false,
          },
        ],
      },
    ],
  };

  it("still parses a stored builder definition without the new kinds", () => {
    const parsed = safeParseStoredDefinition(STORED_BEFORE);
    expect(parsed).not.toBeNull();
    expect(parsed?.pages[0]?.kind).toBe("questions");
  });

  it("still parses a unified definition without the new kinds, unchanged", () => {
    const parsed = Questionnaire.parse(UNIFIED_BEFORE);
    expect(parsed).toEqual(UNIFIED_BEFORE);
  });
});

describe("the schema", () => {
  it("needs at least two points and at most ten", () => {
    const base = { ...LIKERT };
    expect(
      Questionnaire.safeParse({
        version: "1",
        pages: [
          {
            id: "p",
            kind: "questions",
            title: "P",
            questions: [{ ...base, scale: ["Only"] }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      Questionnaire.safeParse({
        version: "1",
        pages: [
          {
            id: "p",
            kind: "questions",
            title: "P",
            questions: [{ ...base, scale: starScaleLabels(11) }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("carries leadsOnly on a question and a page", () => {
    const parsed = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "Leads",
          leadsOnly: true,
          questions: [{ ...STARS, leadsOnly: true }],
        },
      ],
    });
    const page = parsed.pages[0];
    expect(page?.kind === "questions" && page.leadsOnly).toBe(true);
    expect(
      page?.kind === "questions" &&
        "leadsOnly" in page.questions[0]! &&
        page.questions[0].leadsOnly,
    ).toBe(true);
  });
});
