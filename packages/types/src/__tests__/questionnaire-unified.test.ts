import { describe, expect, it } from "vitest";
import {
  BUILDER_QUESTION_KINDS,
  BuilderQuestionnaire,
  ContentBlock,
  Question,
  QUESTION_KINDS,
  Questionnaire,
  choiceValues,
  diffResponses,
  displayResponseValue,
  evalVisibleIf,
  flattenQuestions,
  isAnswerableBlock,
  numberFits,
  visibleIfOpsFor,
  visibleIfProblem,
  type CheckboxGridQuestion,
  type MultiChoiceGridQuestion,
} from "../index";
import { KIND_SAMPLES } from "./_kind-samples";

// The unified model's own additions over AB's file: Camp 404's visibility on
// every level, Camp 404's content blocks, a draft-lenient page, grid answers
// in the Camp 404 helpers, and a builder schema that still reads exactly as it
// did before the model grew.

const GRID: MultiChoiceGridQuestion = {
  id: "shift",
  kind: "multi_choice_grid",
  prompt: "Availability by day",
  rows: [
    { id: "mon", label: "Monday" },
    { id: "tue", label: "Tuesday" },
  ],
  columns: [
    { value: "am", label: "Morning" },
    { value: "pm", label: "Afternoon" },
  ],
  required: true,
};

describe("the unified schema", () => {
  it("declares Camp 404's fourteen kinds and AB's seven", () => {
    expect([...QUESTION_KINDS].sort()).toEqual(
      [
        ...BUILDER_QUESTION_KINDS,
        "years",
        "linear_scale",
        "rating",
        "time",
        "file_link",
        "multi_choice_grid",
        "checkbox_grid",
      ].sort(),
    );
  });

  it("carries visibleIf on a questions page, a question and a content block", () => {
    const def = {
      version: "1",
      title: "Everything conditional",
      pages: [
        {
          id: "p1",
          kind: "questions",
          title: "Start",
          questions: [
            {
              id: "driving",
              kind: "boolean",
              prompt: "Driving?",
              required: false,
            },
            {
              id: "plate",
              kind: "short_text",
              prompt: "Plate",
              maxLength: 20,
              required: true,
              visibleIf: { fieldId: "driving", op: "eq", value: true },
            },
            {
              id: "note",
              kind: "explainer",
              bodyText: "Park behind the kitchen.",
              style: "note",
              visibleIf: { fieldId: "driving", op: "eq", value: true },
            },
          ],
        },
        {
          id: "p2",
          kind: "questions",
          title: "Drivers only",
          requiredToContinue: true,
          pageType: "content",
          visibleIf: { fieldId: "driving", op: "is_answered" },
          questions: [
            { id: "hr", kind: "divider" },
            {
              id: "head",
              kind: "header_break",
              headingText: "Convoy",
              alignment: "center",
            },
            {
              id: "pic",
              kind: "image_block",
              url: "/maps/convoy.png",
              alt: "The convoy route",
              sizeFit: "full-width",
            },
            { id: "info", kind: "info_block", body: "Leave at dawn." },
          ],
        },
      ],
    };
    // Nothing defaulted in, nothing stripped: the stored JSON round-trips.
    expect(Questionnaire.parse(def)).toEqual(def);
  });

  it("saves a half-built draft: an untitled page, an empty page, an image with no picture", () => {
    const draft = {
      version: "1",
      pages: [
        { id: "p1", kind: "questions", title: "", questions: [] },
        {
          id: "p2",
          kind: "questions",
          title: "Pictures",
          questions: [{ id: "i", kind: "image_block", url: "", alt: "" }],
        },
      ],
    };
    expect(Questionnaire.safeParse(draft).success).toBe(true);
  });

  it("still refuses a definition with no pages", () => {
    expect(Questionnaire.safeParse({ version: "1", pages: [] }).success).toBe(
      false,
    );
  });

  it("tells content blocks from questions", () => {
    for (const block of [
      { id: "a", kind: "info_block", body: "x" },
      { id: "b", kind: "image_block", url: "", alt: "" },
      { id: "c", kind: "header_break", headingText: "x" },
      { id: "d", kind: "explainer", bodyText: "x", style: "plain" },
      { id: "e", kind: "divider" },
    ]) {
      expect(isAnswerableBlock(ContentBlock.parse(block))).toBe(false);
    }
    for (const sample of Object.values(KIND_SAMPLES)) {
      expect(isAnswerableBlock(sample.question)).toBe(true);
    }
  });

  it("keeps content blocks out of flattenQuestions", () => {
    const def = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "P",
          questions: [
            { id: "d", kind: "divider" },
            { id: "q", kind: "email", prompt: "Email" },
          ],
        },
      ],
    });
    expect(flattenQuestions(def).map((q) => q.id)).toEqual(["q"]);
  });
});

describe("displayResponseValue and diffResponses over the new kinds", () => {
  it("renders a grid by row and column labels, skipping unanswered rows", () => {
    expect(displayResponseValue(GRID, { mon: ["am"], tue: [] })).toBe(
      "Monday: Morning",
    );
    const checkbox: CheckboxGridQuestion = {
      ...GRID,
      kind: "checkbox_grid",
      required: false,
    };
    expect(
      displayResponseValue(checkbox, { mon: ["am", "pm"], tue: ["ghost"] }),
    ).toBe("Monday: Morning, Afternoon; Tuesday: ghost");
    expect(displayResponseValue(GRID, {})).toBe("—");
    // A non-grid value on a grid kind still renders as itself.
    expect(displayResponseValue(GRID, "am")).toBe("am");
  });

  it("renders a grid map under a non-grid kind without [object Object]", () => {
    const pick = Question.parse({
      id: "pick",
      kind: "single_select",
      prompt: "Pick",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(displayResponseValue(pick, { a: ["b"] })).toBe("a: b");
    const text = Question.parse({ id: "t", kind: "short_text", prompt: "T" });
    expect(displayResponseValue(text, { a: ["b", "c"] })).toBe("a: b, c");
  });

  it("renders years, scales, ratings, times and links plainly", () => {
    const years = Question.parse({ id: "y", kind: "years", prompt: "Y" });
    expect(displayResponseValue(years, ["2019", "2023"])).toBe("2019, 2023");
    expect(displayResponseValue(years, [])).toBe("—");
    expect(displayResponseValue(KIND_SAMPLES.rating.question, 4)).toBe("4");
    expect(displayResponseValue(KIND_SAMPLES.time.question, "23:00")).toBe(
      "23:00",
    );
  });

  it("diffs a grid row by row, as sets, and treats an empty grid as unanswered", () => {
    const def = Questionnaire.parse({
      version: "1",
      pages: [{ id: "p", kind: "questions", title: "P", questions: [GRID] }],
    });
    expect(
      diffResponses(
        def,
        { shift: { mon: ["am", "pm"], tue: [] } },
        { shift: { mon: ["pm", "am"] } },
      ),
    ).toEqual([]);
    expect(diffResponses(def, { shift: {} }, {})).toEqual([]);
    expect(
      diffResponses(def, { shift: { mon: ["am"] } }, { shift: { mon: ["pm"] } }),
    ).toEqual([
      {
        fieldId: "shift",
        label: "Availability by day",
        from: "Monday: Morning",
        to: "Monday: Afternoon",
      },
    ]);
  });
});

describe("the visibleIf helpers over the new kinds", () => {
  it("offers numeric comparisons on a linear scale and a rating", () => {
    expect(visibleIfOpsFor(KIND_SAMPLES.linear_scale.question)).toContain("gte");
    expect(visibleIfOpsFor(KIND_SAMPLES.rating.question)).toContain("lt");
  });

  it("offers includes on attended years, and answeredness only on a grid, a time or a link", () => {
    expect(visibleIfOpsFor(KIND_SAMPLES.years.question)).toEqual([
      "includes",
      "not_includes",
      "is_answered",
      "is_empty",
    ]);
    for (const kind of ["multi_choice_grid", "time", "file_link"] as const) {
      expect(visibleIfOpsFor(KIND_SAMPLES[kind].question)).toEqual([
        "is_answered",
        "is_empty",
      ]);
    }
  });

  it("lists a burn year as a choice value, but not a no-burn year", () => {
    const years = choiceValues(KIND_SAMPLES.years.question);
    expect(years).toContain("2019");
    expect(years).not.toContain("2020");
    expect(choiceValues(GRID)).toBeNull();
  });

  it("fits a number to a linear scale's range and a rating's steps, whole numbers only", () => {
    const scale = KIND_SAMPLES.linear_scale.question; // 1–5
    expect(numberFits(scale, 5)).toBe(true);
    expect(numberFits(scale, 6)).toBe(false);
    expect(numberFits(scale, 2.5)).toBe(false);
    const rating = KIND_SAMPLES.rating.question; // 5 steps
    expect(numberFits(rating, 1)).toBe(true);
    expect(numberFits(rating, 0)).toBe(false);
    expect(numberFits(rating, 3.5)).toBe(false);
    expect(numberFits(rating, Number.NaN)).toBe(false);
  });

  it("judges a condition's value against the new kinds", () => {
    const rating = KIND_SAMPLES.rating.question;
    expect(
      visibleIfProblem({ fieldId: rating.id, op: "gte", value: 4 }, rating),
    ).toBeNull();
    expect(
      visibleIfProblem({ fieldId: rating.id, op: "gte", value: 9 }, rating),
    ).toBe("wrong_value");
    const years = KIND_SAMPLES.years.question;
    expect(
      visibleIfProblem({ fieldId: years.id, op: "includes", value: "2020" }, years),
    ).toBe("wrong_value");
    expect(
      visibleIfProblem({ fieldId: GRID.id, op: "eq", value: "am" }, GRID),
    ).toBe("wrong_operator");
  });

  it("treats an empty grid answer as unanswered", () => {
    const cond = { fieldId: "shift", op: "is_answered" } as const;
    expect(evalVisibleIf(cond, { shift: {} })).toBe(false);
    expect(evalVisibleIf(cond, { shift: { mon: [] } })).toBe(false);
    expect(evalVisibleIf(cond, { shift: { mon: ["am"] } })).toBe(true);
  });
});

describe("the builder schema reads exactly as it did before the model grew", () => {
  function builderWith(question: unknown) {
    return {
      version: "1",
      title: "Builder",
      pages: [
        {
          id: "p",
          type: "question",
          title: "P",
          blocks: [{ kind: "question", question }],
        },
      ],
    };
  }

  it("refuses a question kind only the unified model has", () => {
    for (const kind of [
      "years",
      "linear_scale",
      "rating",
      "time",
      "file_link",
      "multi_choice_grid",
      "checkbox_grid",
    ] as const) {
      const parsed = BuilderQuestionnaire.safeParse(
        builderWith(KIND_SAMPLES[kind].question),
      );
      expect(parsed.success, kind).toBe(false);
    }
  });

  it("accepts every kind it always held", () => {
    for (const kind of BUILDER_QUESTION_KINDS) {
      const parsed = BuilderQuestionnaire.safeParse(
        builderWith(KIND_SAMPLES[kind].question),
      );
      expect(parsed.success, kind).toBe(true);
    }
  });

  it("refuses a numeric text format, as the old format enum did", () => {
    for (const format of ["number", "integer"]) {
      const parsed = BuilderQuestionnaire.safeParse(
        builderWith({ id: "t", kind: "short_text", prompt: "T", format }),
      );
      expect(parsed.success, format).toBe(false);
    }
    expect(
      BuilderQuestionnaire.safeParse(
        builderWith({ id: "t", kind: "short_text", prompt: "T", format: "url" }),
      ).success,
    ).toBe(true);
  });

  it("strips the fields only the unified model declares, as zod stripped unknown keys", () => {
    const parsed = BuilderQuestionnaire.parse({
      version: "1",
      title: "Builder",
      pages: [
        {
          id: "p",
          type: "question",
          title: "P",
          blocks: [
            {
              kind: "question",
              question: {
                id: "one",
                kind: "single_select",
                prompt: "One",
                allowOther: true,
                display: "dropdown",
                otherLabel: "Something else",
                shuffleOptions: true,
                visibleIf: { fieldId: "x", op: "is_answered" },
                options: [
                  { value: "a", label: "A", goTo: "p", imageUrl: "/a.png" },
                  { value: "b", label: "B", imageAlt: "B" },
                ],
              },
            },
            {
              kind: "question",
              question: {
                id: "many",
                kind: "multi_select",
                prompt: "Many",
                minSelections: 1,
                maxSelections: 2,
                display: "image_grid",
                options: [
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                ],
              },
            },
            {
              kind: "question",
              question: {
                id: "short",
                kind: "short_text",
                prompt: "Short",
                minLength: 2,
                min: 1,
                max: 3,
              },
            },
            {
              kind: "question",
              question: {
                id: "long",
                kind: "long_text",
                prompt: "Long",
                minLength: 2,
                enableDictation: true,
              },
            },
            {
              kind: "question",
              question: {
                id: "slide",
                kind: "slider",
                prompt: "Slide",
                min: 0,
                max: 4,
                display: "segmented",
                visibleIf: { fieldId: "x", op: "is_answered" },
              },
            },
          ],
        },
      ],
    });
    const blocks = parsed.pages[0]!.blocks;
    const questions = blocks.map((b) => (b.kind === "question" ? b.question : null));
    expect(questions).toEqual([
      {
        id: "one",
        kind: "single_select",
        prompt: "One",
        allowOther: true,
        required: true,
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      {
        id: "many",
        kind: "multi_select",
        prompt: "Many",
        required: false,
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      {
        id: "short",
        kind: "short_text",
        prompt: "Short",
        maxLength: 120,
        required: true,
      },
      {
        id: "long",
        kind: "long_text",
        prompt: "Long",
        maxLength: 1000,
        enableDictation: true,
        required: false,
      },
      {
        id: "slide",
        kind: "slider",
        prompt: "Slide",
        min: 0,
        max: 4,
        step: 1,
        display: "segmented",
        required: true,
      },
    ]);
  });
});
