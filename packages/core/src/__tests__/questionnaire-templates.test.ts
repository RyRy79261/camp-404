import { describe, expect, it } from "vitest";
import { flattenQuestions, type RatingGridQuestion } from "@camp404/types";
import {
  FALLBACK_MEAL_ROWS,
  leadsOnlyQuestionIds,
  mealPlanRatingRows,
  postBurnSurveyTemplate,
  questionnaireForViewer,
  regenerateQuestionnaireIds,
  validateQuestionnaireDefinition,
} from "../index";

// The post-burn survey template (#251).

function mealBlock(def = postBurnSurveyTemplate()): RatingGridQuestion {
  const block = flattenQuestions(def).find(
    (q) => q.kind === "rating_grid" && q.display === "stars",
  );
  if (!block || block.kind !== "rating_grid") throw new Error("no meal block");
  return block;
}

describe("postBurnSurveyTemplate", () => {
  it("is publishable as it stands", () => {
    const result = validateQuestionnaireDefinition(postBurnSurveyTemplate());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("stays publishable once its ids are made fresh", () => {
    let n = 0;
    const fresh = regenerateQuestionnaireIds(
      postBurnSurveyTemplate(),
      () => `id_${(n += 1)}`,
    );
    expect(validateQuestionnaireDefinition(fresh).ok).toBe(true);
  });

  it("has the camp's five sections", () => {
    expect(postBurnSurveyTemplate().pages.map((p) => p.id)).toEqual([
      "shifts",
      "kitchen",
      "water",
      "communication",
      "general",
    ]);
  });

  it("holds questions only team leads see, hidden from members", () => {
    const def = postBurnSurveyTemplate();
    const leadsOnly = leadsOnlyQuestionIds(def);
    expect(leadsOnly.size).toBeGreaterThan(0);
    const memberIds = flattenQuestions(
      questionnaireForViewer(def, { seesLeadsOnly: false }),
    ).map((q) => q.id);
    for (const id of leadsOnly) expect(memberIds).not.toContain(id);
  });

  it("requires nothing, so a member can skip what they did not see", () => {
    for (const q of flattenQuestions(postBurnSurveyTemplate())) {
      expect("required" in q && q.required).toBe(false);
    }
  });

  it("rates the meals the plan serves, or meals as a whole without one", () => {
    expect(mealBlock().rows).toEqual(FALLBACK_MEAL_ROWS);
    const rows = [{ id: "meal_d1_dinner", label: "Day 1 dinner" }];
    expect(mealBlock(postBurnSurveyTemplate(rows)).rows).toEqual(rows);
  });
});

describe("mealPlanRatingRows", () => {
  it("makes one row per served meal, in day order, dated when day 1 is set", () => {
    const rows = mealPlanRatingRows({
      firstDay: "2027-04-26",
      days: [
        { breakfast: 0, dinner: 40 },
        { breakfast: 40, dinner: 0 },
      ],
    });
    expect(rows).toEqual([
      { id: "meal_d1_dinner", label: "Day 1 dinner (Mon 26 Apr)" },
      { id: "meal_d2_breakfast", label: "Day 2 breakfast (Tue 27 Apr)" },
    ]);
  });

  it("leaves the date off when day 1 has none, and skips empty meals", () => {
    expect(
      mealPlanRatingRows({
        firstDay: null,
        days: [{ breakfast: 0, dinner: 12 }],
      }),
    ).toEqual([{ id: "meal_d1_dinner", label: "Day 1 dinner" }]);
  });

  it("gives the same row ids when filled again from the same plan", () => {
    const plan = {
      firstDay: null,
      days: [{ breakfast: 1, dinner: 1 }],
    };
    expect(mealPlanRatingRows(plan).map((r) => r.id)).toEqual(
      mealPlanRatingRows(plan).map((r) => r.id),
    );
  });
});
