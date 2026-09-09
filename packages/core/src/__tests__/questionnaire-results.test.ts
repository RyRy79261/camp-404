import { describe, expect, it } from "vitest";
import {
  Question,
  type Questionnaire,
  type QuestionnaireResponses,
} from "@camp404/types";
import {
  aggregateQuestions,
  aggregateResponses,
  KIND_SHAPE,
  MAX_ENUMERATED_BUCKETS,
  OTHER_ROW_LABEL,
  OTHER_ROW_VALUE,
  type ChoiceAggregate,
  type CountAggregate,
  type NumericAggregate,
  type QuestionAggregate,
} from "../questionnaire-results";

// Every rounding and denominator decision in `aggregateResponses` is pinned
// below as its own named case, because none of them is forced by the types:
// a percentage could as easily be taken over `respondents`, a median could
// round the other way, an unknown option could be dropped. Changing one of
// those is a product decision, and it should have to walk past a test that
// says what the old answer was.

// --- helpers -------------------------------------------------------------

function page(...questions: Question[]): Questionnaire {
  return {
    version: "test",
    pages: [{ id: "p1", kind: "questions", title: "Page one", questions }],
  };
}

function only(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses[],
): QuestionAggregate {
  const result = aggregateResponses(questionnaire, responses);
  const first = result.questions[0];
  if (!first) throw new Error("expected one aggregate");
  return first;
}

function asChoice(aggregate: QuestionAggregate): ChoiceAggregate {
  if (aggregate.shape !== "choice") {
    throw new Error(`expected a choice aggregate, got ${aggregate.shape}`);
  }
  return aggregate;
}

function asNumeric(aggregate: QuestionAggregate): NumericAggregate {
  if (aggregate.shape !== "numeric") {
    throw new Error(`expected a numeric aggregate, got ${aggregate.shape}`);
  }
  return aggregate;
}

function asCount(aggregate: QuestionAggregate): CountAggregate {
  if (aggregate.shape !== "count") {
    throw new Error(`expected a count aggregate, got ${aggregate.shape}`);
  }
  return aggregate;
}

const TIER: Question = {
  id: "tier",
  kind: "single_select",
  prompt: "Which membership?",
  options: [
    { value: "full", label: "Full" },
    { value: "build_week_only", label: "Build week only" },
    { value: "strike_only", label: "Strike only" },
  ],
  required: true,
};

const TEAMS: Question = {
  id: "teams",
  kind: "multi_select",
  prompt: "Which teams interest you?",
  options: [
    { value: "kitchen", label: "Kitchen" },
    { value: "build", label: "Build" },
    { value: "power", label: "Power" },
  ],
  required: false,
};

const EXPERIENCE: Question = {
  id: "experience",
  kind: "slider",
  prompt: "How many burns?",
  min: 0,
  max: 10,
  step: 1,
  display: "segmented",
  required: true,
};

// --- the exhaustiveness link --------------------------------------------

describe("KIND_SHAPE", () => {
  // The compile-time half of this is the mapped type on KIND_SHAPE itself: a
  // fifteenth member of `Question` makes the module fail to build. This is
  // the run-time half, and it reads the kind list off the zod schema rather
  // than hand-listing it — a hand-written list is exactly the thing that
  // silently stops matching.
  const schemaKinds = Question.options
    .map((option) => option.shape.kind.value)
    .sort();

  it("routes every kind the Question schema declares", () => {
    expect(Object.keys(KIND_SHAPE).sort()).toEqual(schemaKinds);
  });

  it("routes free-text-ish kinds to a count and nothing more", () => {
    // The PII stance (docs/questionnaire-builder.md:400). If a kind moves out
    // of this list, someone decided a captain may read those answers.
    expect(KIND_SHAPE.short_text).toBe("count");
    expect(KIND_SHAPE.long_text).toBe("count");
    expect(KIND_SHAPE.email).toBe("count");
    expect(KIND_SHAPE.phone).toBe("count");
    expect(KIND_SHAPE.image).toBe("count");
    expect(KIND_SHAPE.date).toBe("count");
  });
});

// --- choice --------------------------------------------------------------

describe("aggregateResponses — choice kinds", () => {
  it("counts each option and keeps the zero-count ones", () => {
    const aggregate = asChoice(
      only(page(TIER), [
        { tier: "full" },
        { tier: "full" },
        { tier: "build_week_only" },
      ]),
    );

    expect(aggregate.rows).toEqual([
      { value: "full", label: "Full", count: 2, pct: 67, known: true },
      {
        value: "build_week_only",
        label: "Build week only",
        count: 1,
        pct: 33,
        known: true,
      },
      // Nobody picked it. It still gets a row: "no one wants strike-only" is
      // a result, and an absent row reads as a missing option.
      {
        value: "strike_only",
        label: "Strike only",
        count: 0,
        pct: 0,
        known: true,
      },
    ]);
    expect(aggregate.totalSelections).toBe(3);
    expect(aggregate.multi).toBe(false);
  });

  it("takes percentages over the people who answered, not everyone", () => {
    // 2 of 4 answered; both said "full". That is 100% of answerers and 50% of
    // respondents. The row says 100 and the header says 2 of 4 — the skip is
    // carried beside the percentage, never folded into it.
    const aggregate = asChoice(
      only(page(TIER), [{ tier: "full" }, { tier: "full" }, {}, {}]),
    );

    expect(aggregate.rows[0]?.pct).toBe(100);
    expect(aggregate.answered).toBe(2);
    expect(aggregate.skipped).toBe(2);
    expect(aggregate.answeredPct).toBe(50);
  });

  it("rounds a percentage half-up, and lets the column exceed 100", () => {
    // Thirds. 33.33 → 33 twice, 33.33 → 33; a third of three ties at .5 does
    // not arise, so pin the case that does: two of three is 66.67 → 67.
    const aggregate = asChoice(
      only(page(TIER), [
        { tier: "full" },
        { tier: "full" },
        { tier: "strike_only" },
      ]),
    );
    expect(aggregate.rows.map((row) => row.pct)).toEqual([67, 0, 33]);
    // 67 + 33 = 100 here, but the guarantee is per-row rounding, NOT a column
    // that sums to exactly 100. Do not "fix" a 101 by redistributing.
  });

  it("gives a multi-select respondent one row each, and flags itself", () => {
    const aggregate = asChoice(
      only(page(TEAMS), [
        { teams: ["kitchen", "power"] },
        { teams: ["kitchen"] },
        {},
      ]),
    );

    expect(aggregate.multi).toBe(true);
    expect(aggregate.answered).toBe(2);
    expect(aggregate.totalSelections).toBe(3);
    // Percentages are over the 2 answerers, so the column sums past 100. That
    // is correct for a multi-select and the `multi` flag is how a view knows.
    expect(
      aggregate.rows.map((row) => [row.value, row.count, row.pct]),
    ).toEqual([
      ["kitchen", 2, 100],
      ["build", 0, 0],
      ["power", 1, 50],
    ]);
  });

  it("counts a value repeated inside one respondent's list once", () => {
    const aggregate = asChoice(
      only(page(TEAMS), [{ teams: ["kitchen", "kitchen"] }]),
    );
    expect(aggregate.rows[0]?.count).toBe(1);
    expect(aggregate.totalSelections).toBe(1);
  });

  it("treats an empty list as a skip, not as an answer", () => {
    const aggregate = asChoice(only(page(TEAMS), [{ teams: [] }, {}]));
    expect(aggregate.answered).toBe(0);
    expect(aggregate.skipped).toBe(2);
    expect(aggregate.answeredPct).toBe(0);
  });

  it("breaks a boolean down as Yes/No without an options array", () => {
    const bringing: Question = {
      id: "bike",
      kind: "boolean",
      prompt: "Bringing a bike?",
      required: false,
    };
    const aggregate = asChoice(
      only(page(bringing), [{ bike: true }, { bike: false }, { bike: false }]),
    );

    expect(aggregate.rows).toEqual([
      { value: "true", label: "Yes", count: 1, pct: 33, known: true },
      { value: "false", label: "No", count: 2, pct: 67, known: true },
    ]);
  });

  it("counts a boolean `false` as an answer, not as a skip", () => {
    // The whole reason `isAnswered` is written against the empty shapes and
    // not as a falsy test. `false` is somebody saying no.
    const bringing: Question = {
      id: "bike",
      kind: "boolean",
      prompt: "Bringing a bike?",
      required: false,
    };
    const aggregate = asChoice(only(page(bringing), [{ bike: false }]));
    expect(aggregate.answered).toBe(1);
    expect(aggregate.skipped).toBe(0);
  });

  it("uses `steps` for a scale and resolves its labels", () => {
    const cooking: Question = {
      id: "cooking",
      kind: "scale",
      prompt: "Cooking?",
      steps: [
        { value: "lead", label: "I can run a meal" },
        { value: "hands", label: "A pair of hands" },
      ],
      required: true,
    };
    const aggregate = asChoice(only(page(cooking), [{ cooking: "hands" }]));
    expect(aggregate.rows.map((row) => row.label)).toEqual([
      "I can run a meal",
      "A pair of hands",
    ]);
    expect(aggregate.rows[1]?.count).toBe(1);
  });

  it("treats toggle and combobox as the same shape as single_select", () => {
    for (const kind of ["toggle", "combobox"] as const) {
      const question = { ...TIER, kind } as Question;
      const aggregate = asChoice(only(page(question), [{ tier: "full" }]));
      expect(aggregate.shape).toBe("choice");
      expect(aggregate.rows[0]).toEqual({
        value: "full",
        label: "Full",
        count: 1,
        pct: 100,
        known: true,
      });
    }
  });
});

// --- robustness property 3: a deleted option ----------------------------

describe("aggregateResponses — property 3: a deleted option", () => {
  it("still gets a row, labelled by its raw stored value and flagged", () => {
    // A captain deleted "strike_only" after two people had picked it. The two
    // answers are real and must not evaporate into the denominator.
    const shrunk: Question = {
      ...TIER,
      kind: "single_select",
      options: [
        { value: "full", label: "Full" },
        { value: "build_week_only", label: "Build week only" },
      ],
    };
    const aggregate = asChoice(
      only(page(shrunk), [
        { tier: "full" },
        { tier: "strike_only" },
        { tier: "strike_only" },
      ]),
    );

    const orphanRow = aggregate.rows.find((row) => row.value === "strike_only");
    expect(orphanRow).toEqual({
      value: "strike_only",
      // No label survives the delete, so the raw value is the honest label.
      label: "strike_only",
      count: 2,
      pct: 67,
      known: false,
    });
    // Undeclared rows come after the declared ones, so the definition's own
    // order still reads top to bottom.
    expect(aggregate.rows.at(-1)?.value).toBe("strike_only");
    expect(aggregate.totalSelections).toBe(3);
  });

  it("sorts undeclared values so output does not depend on row order", () => {
    const a = asChoice(only(page(TIER), [{ tier: "zeta" }, { tier: "alpha" }]));
    const b = asChoice(only(page(TIER), [{ tier: "alpha" }, { tier: "zeta" }]));
    expect(a.rows.map((row) => row.value)).toEqual(b.rows.map((r) => r.value));
    expect(a.rows.slice(3).map((row) => row.value)).toEqual(["alpha", "zeta"]);
  });
});

// --- the `other:` collapse ----------------------------------------------

describe("aggregateResponses — `other:` free text", () => {
  const withOther: Question = {
    ...TIER,
    kind: "single_select",
    allowOther: true,
  };

  it("collapses every typed answer into one counted row, never quoting it", () => {
    const aggregate = asChoice(
      only(page(withOther), [
        { tier: "other:day pass please" },
        { tier: "other:I want a week in the middle" },
        { tier: "full" },
      ]),
    );

    const other = aggregate.rows.find((row) => row.value === OTHER_ROW_VALUE);
    expect(other).toEqual({
      value: OTHER_ROW_VALUE,
      label: OTHER_ROW_LABEL,
      count: 2,
      pct: 67,
      known: true,
    });
    // The point of the test: no typed sentence appears anywhere in the output.
    const serialised = JSON.stringify(aggregate);
    expect(serialised).not.toContain("day pass");
    expect(serialised).not.toContain("week in the middle");
  });

  it("still collapses when the author has since turned `allowOther` off", () => {
    // `allowOther` is editable after publish, so a stored `other:` answer can
    // outlive the setting. It must not fall through to the raw-value label.
    const aggregate = asChoice(
      only(page(TIER), [{ tier: "other:day pass please" }]),
    );
    const other = aggregate.rows.find((row) => row.value === OTHER_ROW_VALUE);
    expect(other?.label).toBe(OTHER_ROW_LABEL);
    expect(other?.count).toBe(1);
    // Flagged unknown, because the definition no longer admits it.
    expect(other?.known).toBe(false);
    expect(JSON.stringify(aggregate)).not.toContain("day pass");
  });

  it("collapses `other:` inside a multi-select alongside real options", () => {
    const teamsWithOther: Question = {
      ...TEAMS,
      kind: "multi_select",
      allowOther: true,
    };
    const aggregate = asChoice(
      only(page(teamsWithOther), [
        { teams: ["kitchen", "other:lighting rig"] },
        { teams: ["other:lighting rig"] },
      ]),
    );
    expect(aggregate.rows.find((row) => row.value === "kitchen")?.count).toBe(
      1,
    );
    expect(
      aggregate.rows.find((row) => row.value === OTHER_ROW_VALUE)?.count,
    ).toBe(2);
    expect(JSON.stringify(aggregate)).not.toContain("lighting rig");
  });
});

// --- numeric -------------------------------------------------------------

describe("aggregateResponses — numeric kinds", () => {
  it("summarises min, max, mean and median", () => {
    const aggregate = asNumeric(
      only(page(EXPERIENCE), [
        { experience: 1 },
        { experience: 2 },
        { experience: 6 },
      ]),
    );
    expect(aggregate.min).toBe(1);
    expect(aggregate.max).toBe(6);
    expect(aggregate.mean).toBe(3);
    expect(aggregate.median).toBe(2);
    expect(aggregate.samples).toBe(3);
  });

  it("rounds the mean to two places rather than truncating", () => {
    // 1 + 2 + 2 = 5 over 3 = 1.6666… The pinned answer is 1.67.
    const aggregate = asNumeric(
      only(page(EXPERIENCE), [
        { experience: 1 },
        { experience: 2 },
        { experience: 2 },
      ]),
    );
    expect(aggregate.mean).toBe(1.67);
  });

  it("takes the median of an even sample as the mean of the middle pair", () => {
    const aggregate = asNumeric(
      only(page(EXPERIENCE), [
        { experience: 1 },
        { experience: 2 },
        { experience: 3 },
        { experience: 4 },
      ]),
    );
    expect(aggregate.median).toBe(2.5);
  });

  it("reports nulls, not zeroes, when nobody answered", () => {
    // A zero mean is a real answer somebody could have given. Absence is not.
    const aggregate = asNumeric(only(page(EXPERIENCE), [{}, {}]));
    expect(aggregate.min).toBeNull();
    expect(aggregate.max).toBeNull();
    expect(aggregate.mean).toBeNull();
    expect(aggregate.median).toBeNull();
    expect(aggregate.answered).toBe(0);
    expect(aggregate.answeredPct).toBe(0);
  });

  it("counts a stored 0 as an answer", () => {
    const aggregate = asNumeric(only(page(EXPERIENCE), [{ experience: 0 }]));
    expect(aggregate.answered).toBe(1);
    expect(aggregate.samples).toBe(1);
    expect(aggregate.min).toBe(0);
  });

  it("enumerates zero-count buckets across a discrete declared range", () => {
    const keenness: Question = {
      id: "keen",
      kind: "number",
      prompt: "How keen?",
      min: 0,
      max: 6,
      required: false,
    };
    const aggregate = asNumeric(only(page(keenness), [{ keen: 6 }]));
    expect(aggregate.enumerated).toBe(true);
    expect(aggregate.buckets.map((bucket) => bucket.value)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(aggregate.buckets.at(-1)).toEqual({
      value: 6,
      count: 1,
      pct: 100,
      inRange: true,
    });
  });

  it("gives a continuous slider only the values people landed on", () => {
    const continuous: Question = {
      id: "vibe",
      kind: "slider",
      prompt: "Vibe?",
      min: 0,
      max: 100,
      step: 1,
      required: true,
    };
    const aggregate = asNumeric(
      only(page(continuous), [{ vibe: 30 }, { vibe: 70 }]),
    );
    expect(aggregate.enumerated).toBe(false);
    expect(aggregate.buckets.map((bucket) => bucket.value)).toEqual([30, 70]);
  });

  it("stops enumerating past the readable-histogram cap", () => {
    const wide: Question = {
      id: "wide",
      kind: "number",
      prompt: "Pick a number",
      min: 0,
      max: MAX_ENUMERATED_BUCKETS, // one cell too many
      required: false,
    };
    const aggregate = asNumeric(only(page(wide), [{ wide: 3 }]));
    expect(aggregate.enumerated).toBe(false);
    expect(aggregate.buckets.map((bucket) => bucket.value)).toEqual([3]);
  });

  it("buckets fractional slider steps without float drift", () => {
    const half: Question = {
      id: "half",
      kind: "slider",
      prompt: "Half steps",
      min: 0,
      max: 2,
      step: 0.1,
      display: "segmented",
      required: true,
    };
    const aggregate = asNumeric(only(page(half), [{ half: 0.1 + 0.2 }]));
    expect(aggregate.enumerated).toBe(true);
    expect(aggregate.buckets).toHaveLength(21);
    const third = aggregate.buckets.find((bucket) => bucket.value === 0.3);
    // 0.1 + 0.2 is 0.30000000000000004; it lands in the 0.3 cell, not beside it.
    expect(third?.count).toBe(1);
  });

  it("surfaces a non-numeric stored answer instead of dropping it", () => {
    const aggregate = asNumeric(
      only(page(EXPERIENCE), [{ experience: "three" }, { experience: 2 }]),
    );
    expect(aggregate.answered).toBe(2);
    expect(aggregate.samples).toBe(1);
    expect(aggregate.unparsed).toBe(1);
    // The stats are over the parseable sample, and `unparsed` says how much
    // of the answer set they did not cover.
    expect(aggregate.mean).toBe(2);
  });
});

// --- robustness property 4: an out-of-range value -----------------------

describe("aggregateResponses — property 4: an out-of-range value", () => {
  it("keeps its own bucket instead of being clamped onto a neighbour", () => {
    // The slider used to run to 20; a captain narrowed it to 10. Somebody's
    // stored 15 is not a 10.
    const aggregate = asNumeric(
      only(page(EXPERIENCE), [
        { experience: 9 },
        { experience: 15 },
        { experience: -3 },
      ]),
    );

    const high = aggregate.buckets.find((bucket) => bucket.value === 15);
    const low = aggregate.buckets.find((bucket) => bucket.value === -3);
    expect(high).toEqual({ value: 15, count: 1, pct: 33, inRange: false });
    expect(low).toEqual({ value: -3, count: 1, pct: 33, inRange: false });
    // No bucket absorbed them.
    expect(aggregate.buckets.find((b) => b.value === 10)?.count).toBe(0);
    expect(aggregate.buckets.find((b) => b.value === 0)?.count).toBe(0);
    // And the summary is over what people actually stored.
    expect(aggregate.min).toBe(-3);
    expect(aggregate.max).toBe(15);
    // Buckets stay ascending with the out-of-range ones in their real places.
    expect(aggregate.buckets[0]?.value).toBe(-3);
    expect(aggregate.buckets.at(-1)?.value).toBe(15);
  });

  it("keeps an out-of-set scale value as its own row", () => {
    // The string-keyed equivalent: a step whose value is no longer offered.
    const cooking: Question = {
      id: "cooking",
      kind: "scale",
      prompt: "Cooking?",
      steps: [
        { value: "lead", label: "Can run a meal" },
        { value: "none", label: "Keep me away" },
      ],
      required: true,
    };
    const aggregate = asChoice(
      only(page(cooking), [{ cooking: "hands" }, { cooking: "lead" }]),
    );
    expect(aggregate.rows.at(-1)).toEqual({
      value: "hands",
      label: "hands",
      count: 1,
      pct: 50,
      known: false,
    });
  });
});

// --- count-only kinds ----------------------------------------------------

describe("aggregateResponses — free-text kinds", () => {
  it("returns a count and carries no answer text at all", () => {
    const notes: Question = {
      id: "notes",
      kind: "long_text",
      prompt: "Anything else?",
      maxLength: 1000,
      required: false,
    };
    const aggregate = asCount(
      only(page(notes), [
        { notes: "I am bringing a truck and two spare tents." },
        { notes: "My partner is coming on the Thursday." },
        {},
      ]),
    );

    expect(aggregate.answered).toBe(2);
    expect(aggregate.skipped).toBe(1);
    expect(aggregate.answeredPct).toBe(67);
    // A captain gets "2 people answered" and nothing else. If this assertion
    // ever fails, someone has put member sentences on a captain's screen.
    expect(JSON.stringify(aggregate)).not.toContain("truck");
    expect(JSON.stringify(aggregate)).not.toContain("Thursday");
    expect(Object.keys(aggregate).sort()).toEqual([
      "answered",
      "answeredPct",
      "kind",
      "prompt",
      "questionId",
      "respondents",
      "shape",
      "skipped",
    ]);
  });

  it("counts an email, phone, image and date the same way", () => {
    for (const kind of ["email", "phone", "image", "date"] as const) {
      const question = {
        id: "q",
        kind,
        prompt: "?",
        required: true,
      } as Question;
      const aggregate = asCount(only(page(question), [{ q: "x" }, {}]));
      expect(aggregate.answered).toBe(1);
      expect(aggregate.respondents).toBe(2);
    }
  });
});

// --- robustness properties 1 and 2 --------------------------------------

describe("aggregateResponses — property 1: a question added late", () => {
  it("reports honest skips rather than a full house", () => {
    // Two of thirty people have seen the new question since it was added.
    const responses: QuestionnaireResponses[] = [
      { tier: "full", late: "yes" },
      { tier: "full", late: "yes" },
      ...Array.from({ length: 28 }, () => ({ tier: "full" })),
    ];
    const late: Question = {
      id: "late",
      kind: "toggle",
      prompt: "Added after the send",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      required: true,
    };

    const result = aggregateResponses(page(TIER, late), responses);
    const aggregate = asChoice(result.questions[1] as QuestionAggregate);

    expect(aggregate.respondents).toBe(30);
    expect(aggregate.answered).toBe(2);
    expect(aggregate.skipped).toBe(28);
    expect(aggregate.answeredPct).toBe(7);
    // "yes" is 100% of the two who answered — and the 28 skips sit right
    // beside it, so no view can render this as "everyone said yes".
    expect(aggregate.rows[0]?.pct).toBe(100);
    expect(aggregate.rows[0]?.count).toBe(2);
    // The older question is untouched by the late one.
    expect(asChoice(result.questions[0] as QuestionAggregate).answered).toBe(
      30,
    );
  });
});

describe("aggregateResponses — property 2: an orphaned answer", () => {
  it("surfaces the count instead of letting it vanish", () => {
    // "old_question" was deleted from the definition. Three people answered it
    // and their answers are still in the response maps.
    const result = aggregateResponses(page(TIER), [
      { tier: "full", old_question: "kitchen" },
      { tier: "full", old_question: "build" },
      { tier: "full", old_question: "build" },
      { tier: "full" },
    ]);

    expect(result.orphans).toEqual([
      { questionId: "old_question", answered: 3, respondents: 4 },
    ]);
    // It is NOT folded into the live questions.
    expect(result.questions).toHaveLength(1);
  });

  it("counts an orphan but never carries its value", () => {
    // The kind is gone, so nothing can prove the answer is not a sentence.
    const result = aggregateResponses(page(TIER), [
      { deleted_long_text: "I have a serious nut allergy." },
    ]);
    expect(result.orphans[0]?.answered).toBe(1);
    expect(JSON.stringify(result)).not.toContain("nut allergy");
  });

  it("ignores an orphan key whose value is empty", () => {
    const result = aggregateResponses(page(TIER), [
      { gone: "" },
      { gone: null },
      { gone: [] },
    ]);
    expect(result.orphans).toEqual([]);
  });

  it("lists orphans id-ascending regardless of response order", () => {
    const result = aggregateResponses(page(TIER), [
      { zulu: "a" },
      { alpha: "b" },
    ]);
    expect(result.orphans.map((orphan) => orphan.questionId)).toEqual([
      "alpha",
      "zulu",
    ]);
  });
});

// --- shape of the whole result ------------------------------------------

describe("aggregateResponses — the result as a whole", () => {
  it("keeps questionnaire order and skips intro pages", () => {
    const questionnaire: Questionnaire = {
      version: "v1",
      pages: [
        { id: "welcome", kind: "intro", heading: "Hi", body: "Welcome." },
        {
          id: "one",
          kind: "questions",
          title: "One",
          questions: [TIER, EXPERIENCE],
        },
        { id: "two", kind: "questions", title: "Two", questions: [TEAMS] },
      ],
    };
    const result = aggregateResponses(questionnaire, [{ tier: "full" }]);
    expect(result.questions.map((q) => q.questionId)).toEqual([
      "tier",
      "experience",
      "teams",
    ]);
  });

  it("handles an empty response set without dividing by zero", () => {
    const result = aggregateResponses(page(TIER, EXPERIENCE), []);
    expect(result.respondents).toBe(0);
    expect(result.orphans).toEqual([]);

    const tier = asChoice(result.questions[0] as QuestionAggregate);
    expect(tier.answered).toBe(0);
    expect(tier.answeredPct).toBe(0);
    expect(tier.rows.every((row) => row.pct === 0)).toBe(true);
    expect(tier.rows).toHaveLength(3);

    const experience = asNumeric(result.questions[1] as QuestionAggregate);
    expect(experience.mean).toBeNull();
    expect(experience.buckets.every((bucket) => bucket.pct === 0)).toBe(true);
  });

  it("reads the CURRENT prompt, so an edited question is labelled honestly", () => {
    const renamed: Question = { ...TIER, prompt: "Membership tier for 2027?" };
    const aggregate = only(page(renamed), [{ tier: "full" }]);
    expect(aggregate.prompt).toBe("Membership tier for 2027?");
    expect(aggregate.kind).toBe("single_select");
  });
});

// --- the flat entry point the /metrics route uses ------------------------

describe("aggregateQuestions", () => {
  it("agrees with aggregateResponses on the same questions", () => {
    const responses: QuestionnaireResponses[] = [
      { tier: "full" },
      { tier: "strike_only" },
      {},
    ];
    expect(aggregateQuestions([TIER, TEAMS], responses)).toEqual(
      aggregateResponses(page(TIER, TEAMS), responses),
    );
  });

  it("collapses `other:` free text instead of labelling a bucket with it", () => {
    // THE REGRESSION THIS PINS. /metrics used to aggregate through its own copy
    // of this engine, which stringified an answer it did not recognise and used
    // it as the bucket's own label. An "Other…" box is free text, so the result
    // was a captain's dashboard printing members' sentences — verbatim, storage
    // prefix and all — under a question heading.
    const withOther: Question = {
      ...TIER,
      kind: "single_select",
      allowOther: true,
    };
    const result = aggregateQuestions(
      [withOther],
      [
        { tier: "other:I have a severe nut allergy" },
        { tier: "other:recovering, keep booze away from me" },
        { tier: "full" },
      ],
    );

    const rows = asChoice(result.questions[0]!).rows;
    const other = rows.find((row) => row.value === OTHER_ROW_VALUE);
    expect(other?.count).toBe(2);
    expect(other?.label).toBe(OTHER_ROW_LABEL);
    // One row for both, not one row each — and no row anywhere carrying what
    // either of them typed.
    expect(rows).toHaveLength(4);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("nut allergy");
    expect(serialised).not.toContain("recovering");
  });

  it("keeps honest skips when handed a question nobody has seen", () => {
    // Property 1 through the flat entry point: the route flattens the HEAD
    // definition, so a question added after people answered arrives here with
    // no key in any of their response maps.
    const added: Question = { ...TIER, id: "added", prompt: "Added later" };
    const result = aggregateQuestions(
      [TIER, added],
      [{ tier: "full" }, { tier: "full" }, { tier: "full", added: "full" }],
    );
    const late = result.questions[1]!;
    expect(late.answered).toBe(1);
    expect(late.skipped).toBe(2);
    expect(late.respondents).toBe(3);
    expect(late.answeredPct).toBe(33);
  });

  it("surfaces an orphaned answer without carrying its text", () => {
    // Property 2 through the flat entry point.
    const result = aggregateQuestions(
      [TIER],
      [
        {
          tier: "full",
          removed_notes: "my ex is in this camp, seat me elsewhere",
        },
      ],
    );
    expect(result.orphans).toEqual([
      { questionId: "removed_notes", answered: 1, respondents: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("seat me elsewhere");
  });
});
