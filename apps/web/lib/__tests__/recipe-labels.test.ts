import { describe, expect, it } from "vitest";
import { INGREDIENT_CATEGORIES } from "@camp404/types";
import {
  CATEGORY_LABEL,
  formatAmount,
  formatDuration,
  platesLabel,
} from "../recipe-labels";

// How the recipe page prints an amount and a time (#243).

describe("formatAmount", () => {
  it("prints a quantity with its unit, trimming trailing zeros", () => {
    expect(formatAmount(2.5, null, "kg")).toBe("2.5 kg");
    expect(formatAmount(1200, null, "g")).toBe("1200 g");
    expect(formatAmount(0.25, null, "tsp")).toBe("0.25 tsp");
    expect(formatAmount(2.3333, null, "l")).toBe("2.33 l");
    expect(formatAmount(3, null, null)).toBe("3");
  });

  it("prints a range, and a counted unit in the plural beyond one", () => {
    expect(formatAmount(8, 10, "clove")).toBe("8–10 cloves");
    expect(formatAmount(1, null, "clove")).toBe("1 clove");
    expect(formatAmount(4, null, "piece")).toBe("4 pieces");
    expect(formatAmount(2, null, "leaf")).toBe("2 leaves");
    expect(formatAmount(2, 2, "tbsp")).toBe("2 tbsp");
  });

  it("prints nothing for a line with no amount", () => {
    expect(formatAmount(null, null, null)).toBeNull();
    expect(formatAmount(null, null, "g")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("prints minutes, hours and days, and a range", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(20, 25)).toBe("20–25 min");
    expect(formatDuration(1_440 + 180)).toBe("1 d 3 h");
    expect(formatDuration(null)).toBeNull();
  });
});

describe("labels", () => {
  it("names every shopping category, with Noble Notations' words", () => {
    for (const category of INGREDIENT_CATEGORIES) {
      expect(CATEGORY_LABEL[category], category).toBeTruthy();
    }
    expect(CATEGORY_LABEL.fungus).toBe("Mushrooms");
    expect(CATEGORY_LABEL.condiment).toBe("Sauces & condiments");
    expect(platesLabel(1)).toBe("1 plate");
    expect(platesLabel(45)).toBe("45 plates");
  });
});
