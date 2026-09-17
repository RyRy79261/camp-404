import { describe, expect, it } from "vitest";
import {
  type CheckboxGridQuestion,
  type FileLinkQuestion,
  type LinearScaleQuestion,
  type MultiChoiceGridQuestion,
  type Question,
  type QuestionnaireResponses,
  type RatingQuestion,
  type TimeQuestion,
  type YearsQuestion,
} from "@camp404/types";
import {
  aggregateQuestion,
  aggregateQuestions,
  KIND_SHAPE,
  type GridAggregate,
  type NumericAggregate,
  type QuestionAggregate,
  type TimelineAggregate,
} from "../questionnaire-results";

// The kinds the unified model took from AB, summarised inside Camp 404's
// privacy boundary: numbers as distributions, clock times and burn years as
// timelines, grids as per-row tallies — and a pasted link as a count, because
// a URL is free text.

const SCALE: LinearScaleQuestion = {
  id: "noise",
  kind: "linear_scale",
  prompt: "How loud will you be?",
  min: 1,
  max: 5,
  required: true,
};

const RATING: RatingQuestion = {
  id: "depot",
  kind: "rating",
  prompt: "Rate the depot",
  steps: 4,
  required: true,
};

const TIME: TimeQuestion = {
  id: "quiet",
  kind: "time",
  prompt: "Quiet hours start",
  required: false,
};

const YEARS: YearsQuestion = {
  id: "attended",
  kind: "years",
  prompt: "Which burns have you been to?",
  required: false,
};

const LINK: FileLinkQuestion = {
  id: "layout",
  kind: "file_link",
  prompt: "Link to your layout",
  required: false,
};

const MC_GRID: MultiChoiceGridQuestion = {
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

const CB_GRID: CheckboxGridQuestion = {
  id: "cover",
  kind: "checkbox_grid",
  prompt: "Which slots can you cover?",
  rows: [{ id: "kitchen", label: "Kitchen" }],
  columns: [
    { value: "am", label: "Morning" },
    { value: "pm", label: "Afternoon" },
  ],
  required: false,
};

function as<S extends QuestionAggregate["shape"]>(
  aggregate: QuestionAggregate,
  shape: S,
): Extract<QuestionAggregate, { shape: S }> {
  if (aggregate.shape !== shape) {
    throw new Error(`expected ${shape}, got ${aggregate.shape}`);
  }
  return aggregate as Extract<QuestionAggregate, { shape: S }>;
}

describe("KIND_SHAPE for the unified model's kinds", () => {
  it("routes each new kind to its chart", () => {
    expect(KIND_SHAPE.linear_scale).toBe("numeric");
    expect(KIND_SHAPE.rating).toBe("numeric");
    expect(KIND_SHAPE.time).toBe("timeline");
    expect(KIND_SHAPE.years).toBe("timeline");
    expect(KIND_SHAPE.multi_choice_grid).toBe("grid");
    expect(KIND_SHAPE.checkbox_grid).toBe("grid");
  });

  it("keeps free text and dates behind a count", () => {
    // AB returns link answers verbatim and charts dates; Camp 404 does neither.
    expect(KIND_SHAPE.file_link).toBe("count");
    expect(KIND_SHAPE.date).toBe("count");
  });
});

describe("linear_scale and rating — an enumerated distribution", () => {
  it("buckets every step of a linear scale, with mean and median", () => {
    const agg: NumericAggregate = as(
      aggregateQuestion(SCALE, [{ noise: 2 }, { noise: 5 }, { noise: 5 }, {}]),
      "numeric",
    );
    expect(agg.enumerated).toBe(true);
    expect(agg.buckets.map((b) => [b.value, b.count])).toEqual([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 0],
      [5, 2],
    ]);
    expect(agg.mean).toBe(4);
    expect(agg.median).toBe(5);
    expect(agg.answered).toBe(3);
    expect(agg.skipped).toBe(1);
  });

  it("runs a rating from 1 to its step count", () => {
    const agg = as(
      aggregateQuestion(RATING, [{ depot: 4 }, { depot: 3 }]),
      "numeric",
    );
    expect(agg.buckets.map((b) => b.value)).toEqual([1, 2, 3, 4]);
    expect(agg.mean).toBe(3.5);
    expect(agg.min).toBe(3);
    expect(agg.max).toBe(4);
  });

  it("keeps an answer the scale no longer admits in its own bucket", () => {
    const agg = as(aggregateQuestion(RATING, [{ depot: 9 }]), "numeric");
    const outside = agg.buckets.find((b) => b.value === 9);
    expect(outside).toMatchObject({ count: 1, inRange: false });
  });
});

describe("time and years — a timeline", () => {
  it("sorts distinct clock times with counts and names the extremes", () => {
    const agg: TimelineAggregate = as(
      aggregateQuestion(TIME, [
        { quiet: "23:00" },
        { quiet: "21:30" },
        { quiet: "23:00" },
        { quiet: "" },
      ]),
      "timeline",
    );
    expect(agg.multi).toBe(false);
    expect(agg.buckets).toEqual([
      { value: "21:30", count: 1, pct: 33 },
      { value: "23:00", count: 2, pct: 67 },
    ]);
    expect(agg.earliest).toBe("21:30");
    expect(agg.latest).toBe("23:00");
    expect(agg.answered).toBe(3);
  });

  it("counts each attended year once per respondent", () => {
    const agg = as(
      aggregateQuestion(YEARS, [
        { attended: ["2019", "2023", "2019"] },
        { attended: ["2023"] },
        { attended: [] },
      ]),
      "timeline",
    );
    expect(agg.multi).toBe(true);
    expect(agg.buckets).toEqual([
      { value: "2019", count: 1, pct: 50 },
      { value: "2023", count: 2, pct: 100 },
    ]);
    expect(agg.answered).toBe(2);
  });

  it("reports an empty timeline when nobody answered", () => {
    const agg = as(aggregateQuestion(TIME, [{}]), "timeline");
    expect(agg.buckets).toEqual([]);
    expect(agg.earliest).toBeNull();
    expect(agg.latest).toBeNull();
  });
});

describe("file_link — a count, never the links", () => {
  it("carries no value at all", () => {
    const agg = aggregateQuestion(LINK, [
      { layout: "https://drive.example/private-plan.pdf" },
    ]);
    expect(agg).toEqual({
      questionId: "layout",
      prompt: "Link to your layout",
      kind: "file_link",
      respondents: 1,
      answered: 1,
      skipped: 0,
      answeredPct: 100,
      shape: "count",
    });
    expect(JSON.stringify(agg)).not.toContain("drive.example");
  });
});

describe("grids — per-row tallies", () => {
  it("tallies each row against that row's own respondents", () => {
    const responses: QuestionnaireResponses[] = [
      { shift: { mon: ["am"], tue: ["pm"] } },
      { shift: { mon: ["am"], tue: ["am"] } },
      { shift: { mon: ["pm"] } },
    ];
    const agg: GridAggregate = as(
      aggregateQuestion(MC_GRID, responses),
      "grid",
    );
    expect(agg.multi).toBe(false);
    expect(agg.answered).toBe(3);
    const [mon, tue] = agg.rows;
    expect(mon).toMatchObject({ id: "mon", answered: 3, known: true });
    expect(mon?.cells.map((c) => [c.value, c.count, c.pct])).toEqual([
      ["am", 2, 67],
      ["pm", 1, 33],
    ]);
    expect(tue?.answered).toBe(2);
    expect(tue?.cells.map((c) => [c.value, c.count, c.pct])).toEqual([
      ["am", 1, 50],
      ["pm", 1, 50],
    ]);
  });

  it("counts an all-empty grid as skipped", () => {
    const agg = as(
      aggregateQuestion(CB_GRID, [
        { cover: {} },
        { cover: { kitchen: [] } },
        {},
      ]),
      "grid",
    );
    expect(agg.answered).toBe(0);
    expect(agg.skipped).toBe(3);
    expect(agg.rows[0]?.cells.every((c) => c.count === 0 && c.pct === 0)).toBe(
      true,
    );
  });

  it("lets a checkbox grid count several columns per respondent", () => {
    const agg = as(
      aggregateQuestion(CB_GRID, [
        { cover: { kitchen: ["am", "pm", "am"] } },
        { cover: { kitchen: ["pm"] } },
      ]),
      "grid",
    );
    expect(agg.multi).toBe(true);
    expect(agg.rows[0]?.cells.map((c) => [c.value, c.count])).toEqual([
      ["am", 1],
      ["pm", 2],
    ]);
  });

  it("keeps a deleted row and a deleted column visible, flagged unknown", () => {
    const agg = as(
      aggregateQuestion(CB_GRID, [
        { cover: { kitchen: ["night"], gate: ["am"] } },
      ]),
      "grid",
    );
    const kitchen = agg.rows.find((r) => r.id === "kitchen");
    expect(kitchen?.cells.at(-1)).toEqual({
      value: "night",
      label: "night",
      count: 1,
      pct: 100,
      known: false,
    });
    const gate = agg.rows.find((r) => r.id === "gate");
    expect(gate).toMatchObject({ label: "gate", known: false, answered: 1 });
  });
});

describe("a value in the wrong shape for its kind", () => {
  it("contributes nothing to a choice tally instead of an [object Object] row", () => {
    const pick: Question = {
      id: "pick",
      kind: "single_select",
      prompt: "Pick",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      required: true,
    };
    const result = aggregateQuestions([pick], [{ pick: { a: ["b"] } }]);
    const agg = as(result.questions[0]!, "choice");
    expect(agg.answered).toBe(1);
    expect(agg.rows.map((r) => r.value)).toEqual(["a", "b"]);
    expect(agg.totalSelections).toBe(0);
  });

  it("gives a grid nothing from a non-grid value", () => {
    const agg = as(aggregateQuestion(MC_GRID, [{ shift: "am" }]), "grid");
    expect(agg.rows.every((row) => row.answered === 0)).toBe(true);
  });

  it("gives a timeline nothing from a non-string value", () => {
    const agg = as(aggregateQuestion(TIME, [{ quiet: 2300 }]), "timeline");
    expect(agg.buckets).toEqual([]);
  });
});
