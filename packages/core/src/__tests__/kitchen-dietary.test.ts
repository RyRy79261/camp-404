import { describe, expect, it } from "vitest";
import {
  allergenFlags,
  allergensMarked,
  canCheckMenuAllergens,
  dietaryCounts,
  foodsInWords,
  planCovers,
  recipeAllergens,
  type DietaryAnswers,
} from "../kitchen-dietary";
import { KITCHEN_TEAM } from "../recipes";

// The dietary cross-check on the meal plan (#245, Option A of
// kitchen-dietary.html): counts per food and per diet, never per person; a
// recipe holding something someone coming reacts to is flagged, red when
// anyone is anaphylactic to it until a plan names that food.

const answers: DietaryAnswers[] = [
  {
    foods: [
      { food: "peanuts", reaction: "anaphylaxis" },
      { food: "milk", reaction: "intolerance" },
    ],
    diets: ["vegetarian"],
  },
  {
    foods: [
      { food: "peanuts", reaction: "allergy" },
      { food: "eggs", reaction: "allergy" },
      { food: "milk", reaction: "intolerance" },
    ],
    diets: ["vegan", "halal"],
  },
  { foods: [{ food: "sesame", reaction: "allergy" }], diets: ["vegetarian"] },
  { foods: [], diets: [] },
];

describe("canCheckMenuAllergens", () => {
  it("is a captain or a Kitchen lead only", () => {
    expect(canCheckMenuAllergens("captain", [])).toBe(true);
    expect(canCheckMenuAllergens("team_lead", [KITCHEN_TEAM])).toBe(true);
    expect(canCheckMenuAllergens("team_lead", ["power"])).toBe(false);
    expect(canCheckMenuAllergens("camp_member", [])).toBe(false);
  });
});

describe("dietaryCounts", () => {
  const counts = dietaryCounts(answers);

  it("counts allergies with the anaphylactic ones inside them, most first", () => {
    expect(counts.members).toBe(4);
    expect(counts.allergies).toEqual([
      { food: "peanuts", label: "Peanuts", count: 2, anaphylactic: 1 },
      { food: "eggs", label: "Eggs", count: 1, anaphylactic: 0 },
      { food: "sesame", label: "Sesame", count: 1, anaphylactic: 0 },
    ]);
  });

  it("keeps intolerances and diets apart from allergies", () => {
    expect(counts.intolerances).toEqual([
      { food: "milk", label: "Milk", count: 2 },
    ]);
    expect(counts.preferences).toEqual([
      { diet: "vegetarian", label: "Vegetarian", count: 2 },
      { diet: "vegan", label: "Vegan", count: 1 },
      { diet: "halal", label: "Halal", count: 1 },
    ]);
  });

  it("carries no member's id or name: nothing but foods, diets and numbers", () => {
    const text = JSON.stringify(counts);
    expect(Object.keys(counts).sort()).toEqual([
      "allergies",
      "intolerances",
      "members",
      "preferences",
    ]);
    expect(text).not.toMatch(/user|name|id"/i);
  });

  it("counts a food listed twice by one member once", () => {
    const twice = dietaryCounts([
      {
        foods: [
          { food: "fish", reaction: "anaphylaxis" },
          { food: "fish", reaction: "allergy" },
        ],
        diets: ["vegan", "vegan"],
      },
    ]);
    expect(twice.allergies).toEqual([
      { food: "fish", label: "Fish", count: 1, anaphylactic: 1 },
    ]);
    expect(twice.preferences).toEqual([
      { diet: "vegan", label: "Vegan", count: 1 },
    ]);
  });
});

describe("recipeAllergens", () => {
  const lines = [
    { name: "Rolled oats", allergens: ["gluten"] },
    { name: "Peanut butter", allergens: ["peanuts"] },
    { name: "Milk", allergens: ["milk"] },
    { name: "Oat milk", allergens: ["gluten", "not-a-food"] },
    { name: "Honey" },
  ];

  it("gathers what Claude marked, each food once, with the lines that hold it", () => {
    expect(recipeAllergens(lines, null)).toEqual([
      { allergen: "milk", from: ["Milk"] },
      { allergen: "gluten", from: ["Rolled oats", "Oat milk"] },
      { allergen: "peanuts", from: ["Peanut butter"] },
    ]);
  });

  it("follows a lead's correction over what Claude marked", () => {
    expect(recipeAllergens(lines, ["peanuts", "sesame"])).toEqual([
      { allergen: "peanuts", from: ["Peanut butter"] },
      { allergen: "sesame", from: [] },
    ]);
    expect(recipeAllergens(lines, [])).toEqual([]);
  });

  it("knows a version Claude never marked from one with no allergens", () => {
    expect(allergensMarked([{}])).toBe(false);
    expect(allergensMarked([{ allergens: [] }])).toBe(true);
  });
});

describe("allergenFlags", () => {
  const counts = dietaryCounts(answers);

  it("turns red for anaphylaxis and amber for an allergy or an intolerance", () => {
    const flags = allergenFlags(
      [
        { allergen: "peanuts", from: ["Peanut butter"] },
        { allergen: "milk", from: ["Feta"] },
        { allergen: "eggs", from: ["Eggs"] },
        { allergen: "gluten", from: ["Bread"] },
      ],
      counts,
    );
    expect(flags.red).toEqual([
      {
        allergen: "peanuts",
        label: "Peanuts (peanut butter)",
        text: "2 allergic, 1 anaphylactic",
      },
    ]);
    expect(flags.amber).toEqual([
      { allergen: "milk", label: "Milk (feta)", text: "2 intolerant" },
      { allergen: "eggs", label: "Eggs", text: "1 allergic" },
    ]);
  });

  it("flags nothing nobody coming reacts to", () => {
    expect(
      allergenFlags([{ allergen: "celery", from: ["Celery"] }], counts),
    ).toEqual({ red: [], amber: [] });
  });
});

describe("planCovers", () => {
  const red = [{ allergen: "peanuts" as const }];

  it("needs a plan that names every anaphylaxis food", () => {
    expect(planCovers(null, red)).toBe(false);
    expect(planCovers(["peanuts"], red)).toBe(true);
    expect(
      planCovers(["peanuts"], [...red, { allergen: "sesame" as const }]),
    ).toBe(false);
  });

  it("needs no plan without a red flag", () => {
    expect(planCovers(null, [])).toBe(true);
  });
});

describe("foodsInWords", () => {
  it("names one, two or more foods plainly", () => {
    expect(foodsInWords([])).toBe("");
    expect(foodsInWords(["peanuts"])).toBe("peanuts");
    expect(foodsInWords(["peanuts", "sesame"])).toBe("peanuts and sesame");
    expect(foodsInWords(["peanuts", "sesame", "tree_nuts"])).toBe(
      "peanuts, sesame and tree nuts",
    );
  });
});
