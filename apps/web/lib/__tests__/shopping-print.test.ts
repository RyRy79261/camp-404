import { describe, expect, it } from "vitest";
import { shoppingPrint } from "../shopping-print";
import { shoppingFacts, shoppingPrices } from "./print-fixtures";

// The shopping list to print (#249, Option A of design/print-shopping.html):
// only what is still to buy, by shop with totals for a captain or a Kitchen
// lead, by shop area with no shop and no price for everyone else.

describe("shoppingPrint", () => {
  it("leaves off what is bought at the amount the list needs, and keeps a line ticked at an old amount", () => {
    const sheet = shoppingPrint(shoppingFacts(), null);
    expect(sheet.bought).toBe(1);
    expect(sheet.toBuy).toBe(4);
    expect(
      sheet.areas.map((a) => [
        a.label,
        a.lines.map((l) => `${l.name} ${l.amount}`),
      ]),
    ).toEqual([
      ["Produce", ["Tomatoes 2.5 kg"]],
      ["Legumes", ["Red lentils 1.5 kg"]],
      ["Spices", ["Salt To taste"]],
      ["Snacks", ["Rusks 4 boxes"]],
    ]);
    expect(sheet.meals).toBe(2);
  });

  it("names the dishes it cannot count yet, with their day, meal and plates", () => {
    expect(shoppingPrint(shoppingFacts(), null).notCounted).toEqual([
      "Green salad (Day 2 · Fri 23 Apr, dinner, 50 plates)",
    ]);
  });

  it("gives a member's lines no shop and no price at all", () => {
    const sheet = shoppingPrint(shoppingFacts(), null);
    expect(sheet.byShop).toBeNull();
    expect(sheet.estimate).toBe(false);
    for (const line of sheet.areas.flatMap((a) => a.lines)) {
      expect(Object.keys(line).sort()).toEqual([
        "amount",
        "area",
        "key",
        "name",
      ]);
    }
    expect(JSON.stringify(sheet)).not.toMatch(
      /Vlei|Tafelberg|9600|amountCents/,
    );
  });

  it("groups a lead's lines by shop, with each shop's total and the total of all shops", () => {
    const sheet = shoppingPrint(shoppingFacts(), shoppingPrices());
    expect(
      sheet.byShop!.shops.map((s) => [
        s.shop,
        s.lines.map((l) => l.name),
        s.totalCents,
      ]),
    ).toEqual([
      // The bought eggs are not on the sheet, so their price is not counted.
      ["Tafelberg Wholesale", ["Red lentils", "Rusks"], 11550 + 19600],
      ["Vlei Farm Stall", ["Tomatoes"], 9600],
      [null, ["Salt"], 0],
    ]);
    expect(sheet.byShop!.totalCents).toBe(11550 + 19600 + 9600);
    expect(sheet.estimate).toBe(true);
    expect(sheet.byShop!.shops[0]!.lines[0]).toMatchObject({
      area: "Legumes",
      amountCents: 11550,
      kind: "paid",
    });
  });

  it("says when every price is paid, not an estimate", () => {
    const paid = shoppingPrices().map((p) => ({ ...p, kind: "paid" as const }));
    expect(shoppingPrint(shoppingFacts(), paid).estimate).toBe(false);
  });
});

describe("shoppingPrint's amounts", () => {
  it("prints what to buy rounded up, and still knows a line ticked at its exact amount", () => {
    const facts = shoppingFacts();
    const shak = facts.menu.recipes.shak!;
    shak.counts[0]!.lines[1] = {
      ...shak.counts[0]!.lines[1]!,
      quantity: 367.6,
    };
    shak.counts[0]!.lines[0] = { ...shak.counts[0]!.lines[0]!, quantity: 1.57 };
    // 1.57 kg + 500 g = 2.07 kg; the ticks name the exact amount.
    facts.ticks = [{ key: "tomatoes|g", amount: "2.07 kg" }];
    const sheet = shoppingPrint(facts, null);
    const lines = sheet.areas.flatMap((a) => a.lines);
    expect(lines.find((l) => l.name === "Eggs")?.amount).toBe("368");
    expect(lines.find((l) => l.name === "Tomatoes")).toBeUndefined();
    expect(sheet.bought).toBe(1);
    expect(lines.find((l) => l.name === "Red lentils")?.amount).toBe("1.5 kg");
    expect(lines.find((l) => l.name === "Salt")?.amount).toBe("To taste");
  });
});
