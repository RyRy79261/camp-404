import { describe, expect, it } from "vitest";
import {
  AddMenuItemInput,
  AddSnackInput,
  SNACK_AMOUNT_MAX,
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
