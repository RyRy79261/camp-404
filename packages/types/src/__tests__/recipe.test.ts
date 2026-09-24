import { describe, expect, it } from "vitest";
import {
  AcceptProofreadInput,
  AddLessonInput,
  DecideRecipeInput,
  KitchenRecipe,
  KitchenSettingsInput,
  MEAL_PLAN_DEFAULT_DAYS,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  QueuePlateProofreadInput,
  QueueProofreadInput,
  RecipeDraft,
  ResubmitRecipeInput,
  RequestRerunInput,
  RetypeRecipeTextInput,
  StartVariationInput,
  SuggestRecipeInput,
  checkPlateLines,
  resolveUse,
  titleFromText,
  useLabel,
  type KitchenRecipeInput,
} from "../recipe";

const ID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** A small recipe that passes; each test breaks one thing. */
function recipe(): KitchenRecipeInput {
  return {
    title: "Gai yang, the camp's way",
    summary: "Grilled marinated tofu with sticky rice.",
    plates: 40,
    totalTimeMinutes: 90,
    activeTimeMinutes: 40,
    ingredients: [
      {
        component: "Marinade",
        name: "Garlic",
        category: "produce",
        quantity: 10,
        quantityMax: 12,
        unit: "clove",
        preparation: "crushed",
      },
      {
        component: "Marinade",
        name: "Rice",
        category: "grain",
        quantity: 40,
        unit: "g",
        preparation: "toasted and ground",
      },
      {
        component: "To serve",
        name: "Rice",
        category: "grain",
        quantity: 4,
        unit: "kg",
      },
      { name: "Firm tofu", category: "protein", quantity: 5, unit: "kg" },
    ],
    steps: [
      {
        phase: "Marinate",
        instruction: "Crush the garlic and rub it into the tofu.",
        uses: ["Garlic", "Firm tofu", "Marinade: Rice"],
      },
      {
        phase: "Cook",
        instruction: "Steam the rice.",
        uses: ["To serve: Rice"],
        durationMinutes: 25,
        durationMaxMinutes: 30,
        equipment: ["steamer"],
      },
    ],
    notes: [
      {
        kind: "substitution",
        body: "The original uses chicken thighs; firm tofu takes the marinade well.",
      },
    ],
  };
}

const issues = (value: unknown) =>
  KitchenRecipe.safeParse(value).error?.issues ?? [];

describe("KitchenRecipe", () => {
  it("accepts a recipe in Noble Notations' shape, filling the blanks", () => {
    const parsed = KitchenRecipe.parse(recipe());
    expect(parsed.ingredients[3]).toEqual({
      component: null,
      name: "Firm tofu",
      category: "protein",
      quantity: 5,
      quantityMax: null,
      unit: "kg",
      preparation: null,
      note: null,
      optional: false,
    });
    expect(parsed.steps[0]!.equipment).toEqual([]);
    expect(parsed.steps[0]!.temperatureC).toBeNull();
  });

  it("refuses a step that uses a line the recipe does not list", () => {
    const bad = recipe();
    bad.steps[0]!.uses = ["Garlic", "Lemongrass"];
    const [issue] = issues(bad);
    expect(issue?.path).toEqual(["steps", 0, "uses", 1]);
    expect(issue?.message).toBe(
      'Step 1 uses "Lemongrass", which is not in the ingredient list. Add it to the ingredients, or take it out of the step.',
    );
  });

  it("refuses a bare name that fits two lines, and says how to name one", () => {
    const bad = recipe();
    bad.steps[1]!.uses = ["Rice"];
    const [issue] = issues(bad);
    expect(issue?.path).toEqual(["steps", 1, "uses", 0]);
    expect(issue?.message).toBe(
      'Step 2 uses "Rice", which fits two lines. Write "Marinade: Rice" or "To serve: Rice".',
    );

    // A line with no component cannot be named apart; the hint says so.
    const noHeading = recipe();
    noHeading.ingredients[1]!.component = null;
    noHeading.steps[0]!.uses = ["Garlic"];
    noHeading.steps[1]!.uses = ["Rice"];
    expect(issues(noHeading)[0]?.message).toBe(
      'Step 2 uses "Rice", which fits two lines. Write "To serve: Rice". Give the other line a component to point at it.',
    );
  });

  it("reads a qualified name as a component and a name, split on the last colon", () => {
    const ok = recipe();
    ok.steps[1]!.uses = ["to SERVE:rice"];
    expect(KitchenRecipe.safeParse(ok).success).toBe(true);

    const wrong = recipe();
    wrong.steps[1]!.uses = ["For the bowl: Rice"];
    expect(issues(wrong)[0]?.message).toBe(
      'Step 2 uses "For the bowl: Rice". No line has the component "For the bowl" with the name "Rice". The components are: Marinade, To serve. Write one of those, or the name alone.',
    );

    // A component that ends in a colon is still writable.
    const colon = recipe();
    colon.ingredients[2]!.component = "For the boil:";
    colon.steps[1]!.uses = ["For the boil:: Rice"];
    expect(KitchenRecipe.safeParse(colon).success).toBe(true);
  });

  it("refuses two lines with the same component and name", () => {
    const bad = recipe();
    bad.ingredients.push({
      component: "marinade",
      name: " garlic ",
      category: "produce",
    });
    const [issue] = issues(bad);
    expect(issue?.path).toEqual(["ingredients", 4, "name"]);
    expect(issue?.message).toMatch(/^Ingredient 5 repeats ingredient 1/);
  });

  it("refuses an upper amount below the lower one, or a range with no lower end", () => {
    const low = recipe();
    low.ingredients[0]!.quantityMax = 8;
    expect(issues(low)[0]?.path).toEqual(["ingredients", 0, "quantityMax"]);

    const open = recipe();
    open.ingredients[0]!.quantity = null;
    expect(issues(open)[0]?.path).toEqual(["ingredients", 0, "quantity"]);

    const time = recipe();
    time.steps[1]!.durationMaxMinutes = 20;
    expect(issues(time)[0]?.path).toEqual(["steps", 1, "durationMaxMinutes"]);
  });

  it("refuses science and research notes: food science is not in this contract", () => {
    for (const kind of ["science", "research"]) {
      const bad = recipe();
      (bad.notes![0]!.kind as string) = kind;
      expect(KitchenRecipe.safeParse(bad).success, kind).toBe(false);
    }
  });

  it("refuses imperial units and a category outside the list", () => {
    for (const unit of ["oz", "lb", "fl oz", "each"]) {
      const bad = recipe();
      (bad.ingredients[0]!.unit as string) = unit;
      expect(KitchenRecipe.safeParse(bad).success, unit).toBe(false);
    }
    const category = recipe();
    (category.ingredients[0]!.category as string) = "veg";
    expect(KitchenRecipe.safeParse(category).success).toBe(false);
  });

  it("holds plates to a whole number from 1 to 500 and needs a line and a step", () => {
    for (const plates of [0, 501, 2.5]) {
      expect(
        KitchenRecipe.safeParse({ ...recipe(), plates }).success,
        String(plates),
      ).toBe(false);
    }
    expect(
      KitchenRecipe.safeParse({ ...recipe(), ingredients: [], steps: [] })
        .success,
    ).toBe(false);
  });

  it("is what a draft carries, with its report", () => {
    expect(
      RecipeDraft.safeParse({
        recipe: recipe(),
        report: { changed: ["Swapped chicken for tofu."], unsure: [] },
      }).success,
    ).toBe(true);
    expect(RecipeDraft.safeParse({ recipe: recipe() }).success).toBe(false);
  });
});

describe("resolveUse and useLabel", () => {
  const lines = KitchenRecipe.parse(recipe()).ingredients;

  it("finds a bare name, a qualified one, or says why not", () => {
    expect(resolveUse(lines, "firm TOFU")).toBe(3);
    expect(resolveUse(lines, "Marinade: Rice")).toBe(1);
    expect(resolveUse(lines, "To serve: Rice")).toBe(2);
    expect(resolveUse(lines, "Rice")).toEqual({
      error:
        '"Rice", which fits two lines. Write "Marinade: Rice" or "To serve: Rice".',
    });
  });

  it("names a shared line by its component, and any other by its name", () => {
    expect(lines.map((_, i) => useLabel(lines, i))).toEqual([
      "Garlic",
      "Marinade: Rice",
      "To serve: Rice",
      "Firm tofu",
    ]);
    // Every label resolves back to its own line.
    lines.forEach((_, i) => {
      expect(resolveUse(lines, useLabel(lines, i))).toBe(i);
    });
  });
});

describe("titleFromText", () => {
  it("takes the first line with words, without its markdown", () => {
    expect(titleFromText("\n\n## **Gai yang** (Isaan)\n1 chicken")).toBe(
      "Gai yang (Isaan)",
    );
    expect(titleFromText("- [Red lentil dal](https://x.example)\nstep")).toBe(
      "Red lentil dal",
    );
    expect(titleFromText("   \n#\n> _Soup_")).toBe("Soup");
    expect(titleFromText("   ")).toBe("");
    expect(titleFromText("x".repeat(300))).toHaveLength(120);
  });
});

describe("checkPlateLines", () => {
  const base = KitchenRecipe.parse(recipe());
  const line = (name: string) => ({
    name,
    quantity: 1,
    quantityMax: null,
    unit: null,
    note: null,
  });

  it("passes the same lines in the same order, whatever their case", () => {
    expect(
      checkPlateLines(base, {
        lines: ["garlic", "Rice", "Rice", "Firm tofu"].map(line),
      }),
    ).toBeNull();
  });

  it("names a missing line and a line out of order", () => {
    expect(
      checkPlateLines(base, { lines: ["Garlic", "Rice", "Rice"].map(line) }),
    ).toBe("The answer has 3 ingredient lines, and the recipe has 4.");
    expect(
      checkPlateLines(base, {
        lines: ["Garlic", "Firm tofu", "Rice", "Rice"].map(line),
      }),
    ).toBe('Line 2 should be "Rice", not "Firm tofu".');
  });
});

describe("the version inputs", () => {
  it("accept a run's recipe, and drop one sent from the browser", () => {
    const parsed = AcceptProofreadInput.safeParse({
      recipeId: ID_A,
      runId: ID_B,
      recipe: recipe(),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("recipe");
  });

  it("a plate run takes a plate count and is not a re-run unless asked", () => {
    expect(
      QueuePlateProofreadInput.parse({
        recipeId: ID_A,
        versionId: ID_B,
        plates: 45,
      }),
    ).toEqual({ recipeId: ID_A, versionId: ID_B, plates: 45, rerun: false });
    expect(
      QueuePlateProofreadInput.safeParse({
        recipeId: ID_A,
        versionId: ID_B,
        plates: 501,
      }).error?.issues[0]?.message,
    ).toBe("Cook for at most 500 plates.");
  });
});

describe("SuggestRecipeInput", () => {
  const base = { aiConsent: true, source: "text" as const };

  it("needs the recipe's text, pasted or dictated", () => {
    for (const source of ["text", "voice"] as const) {
      expect(
        SuggestRecipeInput.safeParse({ ...base, source }).error?.issues[0]
          ?.message,
      ).toBe("Paste the recipe.");
      expect(
        SuggestRecipeInput.safeParse({ ...base, source, text: "   " }).success,
      ).toBe(false);
      expect(
        SuggestRecipeInput.safeParse({ ...base, source, text: "Boil lentils." })
          .success,
      ).toBe(true);
    }
    expect(
      SuggestRecipeInput.safeParse({ ...base, source: "url", text: "x" })
        .success,
    ).toBe(false);
  });

  it("refuses text that is only a link, because links are never opened", () => {
    expect(
      SuggestRecipeInput.safeParse({
        ...base,
        text: " https://www.noble-notations.com/recipes/gai-yang ",
      }).success,
    ).toBe(false);
    expect(
      SuggestRecipeInput.safeParse({
        ...base,
        text: "Gai yang, from https://www.noble-notations.com/recipes/gai-yang",
      }).success,
    ).toBe(true);
  });

  it("keeps an https link for reference, and nothing else", () => {
    const text = "Boil lentils.";
    expect(
      SuggestRecipeInput.safeParse({
        ...base,
        text,
        url: "https://example.com/dhal",
      }).success,
    ).toBe(true);
    for (const url of [
      "http://example.com/dhal",
      "javascript:alert(1)",
      "ftp://example.com/dhal",
      "example.com/dhal",
    ]) {
      expect(
        SuggestRecipeInput.safeParse({ ...base, text, url }).success,
        url,
      ).toBe(false);
    }
  });

  it("treats blank optional fields, the name too, as absent", () => {
    const parsed = SuggestRecipeInput.parse({
      ...base,
      title: "  ",
      text: "Boil lentils.",
      url: "",
      suitabilityNote: "  ",
    });
    expect(parsed.title).toBeUndefined();
    expect(parsed.url).toBeUndefined();
    expect(parsed.suitabilityNote).toBeUndefined();
  });

  it("caps the name and the text", () => {
    expect(
      SuggestRecipeInput.safeParse({
        ...base,
        title: "x".repeat(121),
        text: "x",
      }).success,
    ).toBe(false);
    expect(
      SuggestRecipeInput.safeParse({ ...base, text: "x".repeat(20_001) })
        .success,
    ).toBe(false);
  });
});

describe("DecideRecipeInput", () => {
  it("needs a reason to reject and a note to ask for changes", () => {
    expect(
      DecideRecipeInput.safeParse({ recipeId: ID_A, decision: "approve" })
        .success,
    ).toBe(true);
    expect(
      DecideRecipeInput.safeParse({ recipeId: ID_A, decision: "reject" })
        .success,
    ).toBe(false);
    expect(
      DecideRecipeInput.safeParse({
        recipeId: ID_A,
        decision: "request_changes",
        note: " ",
      }).success,
    ).toBe(false);
  });
});

describe("QueueProofreadInput", () => {
  it("takes one to ten different recipes and a plate count", () => {
    const plates = 40;
    expect(
      QueueProofreadInput.safeParse({ recipeIds: [], plates }).success,
    ).toBe(false);
    expect(
      QueueProofreadInput.safeParse({ recipeIds: [ID_A, ID_B], plates })
        .success,
    ).toBe(true);
    expect(
      QueueProofreadInput.safeParse({ recipeIds: [ID_A, ID_B] }).success,
    ).toBe(false);
    expect(
      QueueProofreadInput.safeParse({
        recipeIds: [ID_A, ID_A.toUpperCase()],
        plates,
      }).success,
    ).toBe(false);
    const eleven = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );
    expect(
      QueueProofreadInput.safeParse({ recipeIds: eleven, plates }).success,
    ).toBe(false);
    expect(
      QueueProofreadInput.safeParse({ recipeIds: eleven.slice(0, 10), plates })
        .success,
    ).toBe(true);
  });
});

describe("KitchenSettingsInput", () => {
  it("holds the cap to 0..50, the kitchen to real sizes and the plates to 1..500, or unknown", () => {
    const ok = {
      recipeProofreadDailyCap: 0,
      kitchenLargestPotLitres: null,
      kitchenBurnerCount: null,
      kitchenPlatesBreakfast: 60,
      kitchenPlatesLunch: null,
      kitchenPlatesDinner: 45,
    };
    expect(KitchenSettingsInput.safeParse(ok).success).toBe(true);
    // Camp settings sends no cap: it is optional, and the write keeps the
    // stored one.
    const { recipeProofreadDailyCap: _cap, ...noCap } = ok;
    const parsed = KitchenSettingsInput.safeParse(noCap);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("recipeProofreadDailyCap");
    // Nor the plates at each meal: the meal plan holds them now.
    const potOnly = KitchenSettingsInput.safeParse({
      kitchenLargestPotLitres: 50,
      kitchenBurnerCount: 3,
    });
    expect(potOnly.success).toBe(true);
    expect(potOnly.data).not.toHaveProperty("kitchenPlatesBreakfast");
    for (const bad of [
      { recipeProofreadDailyCap: 51 },
      { recipeProofreadDailyCap: -1 },
      { recipeProofreadDailyCap: 2.5 },
      { kitchenLargestPotLitres: 0 },
      { kitchenLargestPotLitres: 501 },
      { kitchenBurnerCount: 21 },
      { kitchenPlatesBreakfast: 0 },
      { kitchenPlatesLunch: 501 },
      { kitchenPlatesDinner: 40.5 },
    ]) {
      expect(
        KitchenSettingsInput.safeParse({ ...ok, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});

describe("the review inputs", () => {
  it("trims a resubmitted suggestion and treats a blank field as no answer", () => {
    expect(
      ResubmitRecipeInput.parse({
        recipeId: ID_A,
        title: "  Dhal ",
        text: " Lentils. ",
        suitabilityNote: "   ",
        aiConsent: false,
      }),
    ).toEqual({
      recipeId: ID_A,
      title: "Dhal",
      text: "Lentils.",
      aiConsent: false,
    });
    expect(
      ResubmitRecipeInput.safeParse({
        recipeId: ID_A,
        title: " ",
        aiConsent: true,
      }).success,
    ).toBe(false);
    // The tick is asked again with the new words, never assumed.
    expect(
      ResubmitRecipeInput.safeParse({ recipeId: ID_A, title: "Dhal" }).success,
    ).toBe(false);
  });

  it("needs text to retype, a name for a variation and words for a lesson", () => {
    expect(
      RetypeRecipeTextInput.safeParse({ recipeId: ID_A, text: " " }).error
        ?.issues[0]?.message,
    ).toBe("Paste the recipe text.");
    expect(
      StartVariationInput.safeParse({ recipeId: ID_A, title: "" }).error
        ?.issues[0]?.message,
    ).toBe("Give the variation a name.");
    expect(
      AddLessonInput.safeParse({ recipeId: ID_A, body: "x".repeat(2_001) })
        .success,
    ).toBe(false);
    expect(
      AddLessonInput.parse({ recipeId: ID_B, body: " Soak overnight. " }),
    ).toEqual({ recipeId: ID_B, body: "Soak overnight." });
  });

  it("needs a note to ask a captain for a re-run", () => {
    expect(
      RequestRerunInput.safeParse({ recipeId: ID_A, note: "  " }).error
        ?.issues[0]?.message,
    ).toBe("Say what Claude should do differently.");
    expect(
      RequestRerunInput.safeParse({ recipeId: ID_A, note: "x".repeat(1_001) })
        .success,
    ).toBe(false);
    expect(
      RequestRerunInput.parse({ recipeId: ID_A, note: " Use grams. " }),
    ).toEqual({ recipeId: ID_A, note: "Use grams." });
  });

  it("refuses an id that is not a row id", () => {
    expect(
      StartVariationInput.safeParse({ recipeId: "abc", title: "GF" }).success,
    ).toBe(false);
  });
});

describe("MealPlanInput", () => {
  const day = { breakfast: 20, lunch: 0, dinner: 25 };

  it("takes one row of whole plates, 0 to 500, for each day on site", () => {
    expect(
      MealPlanInput.safeParse({
        daysOnSite: 2,
        days: [day, { breakfast: 500, lunch: 0, dinner: 0 }],
        expectedVersion: 0,
      }).success,
    ).toBe(true);
    expect(MEAL_PLAN_DEFAULT_DAYS).toBe(11);
  });

  it("refuses plates outside 0 to 500, a part plate, and rows that do not match the days", () => {
    for (const bad of [
      { daysOnSite: 1, days: [{ ...day, lunch: -1 }] },
      { daysOnSite: 1, days: [{ ...day, dinner: 501 }] },
      { daysOnSite: 1, days: [{ ...day, breakfast: 2.5 }] },
      { daysOnSite: 2, days: [day] },
      { daysOnSite: 0, days: [] },
      {
        daysOnSite: MEAL_PLAN_MAX_DAYS + 1,
        days: Array.from({ length: MEAL_PLAN_MAX_DAYS + 1 }, () => day),
      },
    ]) {
      expect(
        MealPlanInput.safeParse({ ...bad, expectedVersion: 0 }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
    expect(
      MealPlanInput.safeParse({
        daysOnSite: 2,
        days: [day],
        expectedVersion: 0,
      }).error?.issues[0]?.message,
    ).toBe("Give the plates for every day on site.");
  });
});
