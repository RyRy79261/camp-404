import { describe, expect, it } from "vitest";
import {
  KITCHEN_ALLERGENS,
  RecipeLine,
  SaveDietaryInput,
  readAllergens,
  readDiets,
  readFoodReactions,
} from "../index";

// The dietary pick-list (#245) and the allergens a recipe line holds.

describe("SaveDietaryInput", () => {
  it("takes foods with a reaction and diets, each once", () => {
    expect(
      SaveDietaryInput.parse({
        foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
        diets: ["vegan"],
      }),
    ).toEqual({
      foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      diets: ["vegan"],
    });
  });

  it("refuses a food twice, an unknown food or reaction, and a diet twice", () => {
    const twice = SaveDietaryInput.safeParse({
      foods: [
        { food: "eggs", reaction: "allergy" },
        { food: "eggs", reaction: "intolerance" },
      ],
      diets: [],
    });
    expect(twice.success).toBe(false);
    expect(
      SaveDietaryInput.safeParse({
        foods: [{ food: "bananas", reaction: "allergy" }],
        diets: [],
      }).success,
    ).toBe(false);
    expect(
      SaveDietaryInput.safeParse({
        foods: [{ food: "eggs", reaction: "dislike" }],
        diets: [],
      }).success,
    ).toBe(false);
    expect(
      SaveDietaryInput.safeParse({ foods: [], diets: ["vegan", "vegan"] })
        .success,
    ).toBe(false);
  });
});

describe("reading the stored columns", () => {
  it("keeps known foods with known reactions, the first of each", () => {
    expect(
      readFoodReactions([
        { food: "milk", reaction: "intolerance" },
        { food: "milk", reaction: "allergy" },
        { food: "dragonfruit", reaction: "allergy" },
        "peanuts",
        null,
      ]),
    ).toEqual([{ food: "milk", reaction: "intolerance" }]);
    expect(readFoodReactions(null)).toEqual([]);
    expect(readFoodReactions({ food: "milk" })).toEqual([]);
  });

  it("keeps known diets once", () => {
    expect(readDiets(["vegan", "vegan", "carnivore", 3])).toEqual(["vegan"]);
    expect(readDiets("vegan")).toEqual([]);
  });

  it("keeps known allergens once, in the list's order", () => {
    expect(readAllergens(["sesame", "milk", "milk", "lava"])).toEqual([
      "milk",
      "sesame",
    ]);
    expect(readAllergens(undefined)).toEqual([]);
    expect(KITCHEN_ALLERGENS[0]).toBe("milk");
  });
});

describe("RecipeLine allergens", () => {
  const line = { name: "Feta", category: "dairy", quantity: 1, unit: "kg" };

  it("are optional, so a version written before stays valid", () => {
    const parsed = RecipeLine.parse(line);
    expect(parsed.allergens).toBeUndefined();
  });

  it("are the fixed foods only", () => {
    expect(RecipeLine.parse({ ...line, allergens: ["milk"] }).allergens).toEqual([
      "milk",
    ]);
    expect(
      RecipeLine.safeParse({ ...line, allergens: ["cheese"] }).success,
    ).toBe(false);
  });
});
