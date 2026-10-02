import { describe, expect, it } from "vitest";
import {
  AddMenuItemInput,
  AddPrepStepInput,
  AddSnackInput,
  CorrectRecipeAllergensInput,
  RecordAllergenPlanInput,
  RemovePrepStepInput,
  SNACK_AMOUNT_MAX,
  SetShoppingPriceInput,
} from "../kitchen-menu";

// The Kitchen menu's and snack list's input shapes (#244, #245): a recipe
// goes on a breakfast or a dinner (the camp does no lunch), and a snack's
// amount is optional, an empty box meaning "not known".

const RECIPE = "0b7c3d2e-1f4a-4b5c-8d9e-0a1b2c3d4e5f";

describe("AddMenuItemInput", () => {
  it("takes breakfast and dinner, and no lunch", () => {
    expect(
      AddMenuItemInput.safeParse({ day: 1, meal: "dinner", recipeId: RECIPE })
        .success,
    ).toBe(true);
    expect(
      AddMenuItemInput.safeParse({ day: 1, meal: "lunch", recipeId: RECIPE })
        .success,
    ).toBe(false);
  });

  it("refuses a day before the first", () => {
    const parsed = AddMenuItemInput.safeParse({
      day: 0,
      meal: "breakfast",
      recipeId: RECIPE,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("AddSnackInput", () => {
  it("reads an empty amount as not known", () => {
    expect(AddSnackInput.parse({ name: " Rusks ", amount: "  " })).toEqual({
      name: "Rusks",
      amount: null,
    });
  });

  it("keeps an amount and trims it", () => {
    expect(
      AddSnackInput.parse({ name: "Crisps", amount: " 10 bags " }),
    ).toEqual({ name: "Crisps", amount: "10 bags" });
  });

  it("refuses a snack with no name or a long amount", () => {
    expect(AddSnackInput.safeParse({ name: "  ", amount: null }).success).toBe(
      false,
    );
    expect(
      AddSnackInput.safeParse({
        name: "Biltong",
        amount: "x".repeat(SNACK_AMOUNT_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("#245 inputs: prices, allergen plans and corrections, prep steps", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("takes a price in rand cents, a blank shop as none, and refuses other money", () => {
    const ok = SetShoppingPriceInput.parse({
      key: "onions|g",
      shop: "  ",
      amountCents: 4950,
      kind: "paid",
      currency: "ZAR",
      expectedVersion: 0,
    });
    expect(ok.shop).toBeNull();
    expect(
      SetShoppingPriceInput.safeParse({ ...ok, currency: "USD" }).success,
    ).toBe(false);
    expect(
      SetShoppingPriceInput.safeParse({ ...ok, amountCents: 10.5 }).success,
    ).toBe(false);
    expect(
      SetShoppingPriceInput.safeParse({ ...ok, amountCents: -1 }).success,
    ).toBe(false);
  });

  it("needs a plan's words and the foods it covers", () => {
    const plan = {
      itemId: id,
      kind: "portion",
      details: "One bowl first.",
      allergens: ["peanuts"],
      expectedVersion: 0,
    };
    expect(RecordAllergenPlanInput.safeParse(plan).success).toBe(true);
    expect(
      RecordAllergenPlanInput.safeParse({ ...plan, details: " " }).success,
    ).toBe(false);
    expect(
      RecordAllergenPlanInput.safeParse({ ...plan, allergens: [] }).success,
    ).toBe(false);
  });

  it("corrects allergens with each food once", () => {
    const fix = {
      recipeId: id,
      versionId: id,
      allergens: ["milk"],
      expectedRevision: 0,
    };
    expect(CorrectRecipeAllergensInput.safeParse(fix).success).toBe(true);
    expect(
      CorrectRecipeAllergensInput.safeParse({
        ...fix,
        allergens: ["milk", "milk"],
      }).success,
    ).toBe(false);
  });

  it("needs a date for a prep step before we leave, and only then", () => {
    const step = {
      itemId: id,
      what: "Soak the oats",
      when: "day_before",
      date: "",
    };
    expect(AddPrepStepInput.parse(step).date).toBeNull();
    const leaving = { ...step, when: "before_leaving" };
    expect(AddPrepStepInput.safeParse(leaving).success).toBe(false);
    expect(
      AddPrepStepInput.safeParse({ ...leaving, date: "2027-02-30x" }).success,
    ).toBe(false);
    expect(
      AddPrepStepInput.safeParse({ ...leaving, date: "2027-04-20" }).success,
    ).toBe(true);
    expect(RemovePrepStepInput.safeParse({ stepId: id }).success).toBe(true);
  });
});
