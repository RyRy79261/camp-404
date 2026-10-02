import { describe, expect, it } from "vitest";
import {
  canPriceShoppingList,
  costBar,
  costPerPersonDay,
  foodCost,
  personDays,
} from "../kitchen-costing";
import { KITCHEN_TEAM } from "../recipes";

// The food cost on the shopping list (#245, Option A of kitchen-costing.html):
// paid and estimated prices added up, the lines with no price named, against
// the Kitchen's one budget amount, and per person per day over person-days
// (each day counts its larger meal). Rands in whole cents.

describe("canPriceShoppingList", () => {
  it("is a captain or a Kitchen lead, and nobody else", () => {
    expect(canPriceShoppingList("captain", [])).toBe(true);
    expect(canPriceShoppingList("team_lead", [KITCHEN_TEAM])).toBe(true);
    expect(canPriceShoppingList("team_lead", ["power"])).toBe(false);
    expect(canPriceShoppingList("camp_member", [KITCHEN_TEAM])).toBe(false);
    expect(canPriceShoppingList("god", [KITCHEN_TEAM])).toBe(false);
  });
});

describe("foodCost", () => {
  it("adds what was paid and what is estimated apart, and names the lines with no price", () => {
    const cost = foodCost([
      { name: "Onions", amountCents: 4950, kind: "paid" },
      { name: "Tomatoes", amountCents: 9600, kind: "estimate" },
      { name: "Lemons", amountCents: null, kind: "estimate" },
      { name: "Basmati rice", amountCents: 18990, kind: "paid" },
      { name: "Salt", amountCents: null, kind: "paid" },
    ]);
    expect(cost).toEqual({
      paidCents: 23940,
      estimatedCents: 9600,
      totalCents: 33540,
      noPrice: ["Lemons", "Salt"],
    });
  });

  it("is zero for an empty list", () => {
    expect(foodCost([])).toEqual({
      paidCents: 0,
      estimatedCents: 0,
      totalCents: 0,
      noPrice: [],
    });
  });

  it("refuses an amount that is not whole cents rather than add it", () => {
    expect(() =>
      foodCost([{ name: "Odd", amountCents: 10.5, kind: "paid" }]),
    ).toThrow(RangeError);
  });
});

describe("personDays and costPerPersonDay", () => {
  it("counts each day's larger meal (the mock-up's 48 + 60 + 60 + 45 = 213)", () => {
    expect(
      personDays([
        { breakfast: 0, dinner: 48 },
        { breakfast: 60, dinner: 55 },
        { breakfast: 60, dinner: 50 },
        { breakfast: 45, dinner: 40 },
      ]),
    ).toBe(213);
  });

  it("divides the food cost over them, rounded to the cent", () => {
    expect(costPerPersonDay(280739, 213)).toBe(1318);
    expect(costPerPersonDay(100, 3)).toBe(33);
    expect(costPerPersonDay(5, 2)).toBe(3);
  });

  it("has no figure when the plan has no plates", () => {
    expect(personDays([{ breakfast: 0, dinner: 0 }])).toBe(0);
    expect(costPerPersonDay(1000, 0)).toBeNull();
  });
});

describe("costBar", () => {
  it("draws paid then estimated as parts of the budget", () => {
    expect(
      costBar(
        { paidCents: 31940, estimatedCents: 248799, totalCents: 280739 },
        350000,
      ),
    ).toEqual({
      paidPercent: (100 * 31940) / 350000,
      estimatedPercent: (100 * 248799) / 350000,
      ofBudgetPercent: 80,
    });
  });

  it("never runs past the end, and says how far over the budget is", () => {
    const bar = costBar(
      { paidCents: 300, estimatedCents: 300, totalCents: 600 },
      400,
    )!;
    expect(bar.paidPercent).toBe(75);
    expect(bar.estimatedPercent).toBe(25);
    expect(bar.ofBudgetPercent).toBe(150);
  });

  it("has no bar without a budget to measure against", () => {
    const cost = { paidCents: 1, estimatedCents: 0, totalCents: 1 };
    expect(costBar(cost, null)).toBeNull();
    expect(costBar(cost, 0)).toBeNull();
  });
});
