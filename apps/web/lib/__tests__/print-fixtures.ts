import type { ShoppingFacts } from "@camp404/db/kitchen-menu";
import type { ShoppingPrice } from "@camp404/db/kitchen-prices";

// The shopping list print's facts (#249): two days of the menu, three
// recipes, one with no checked count for its plates, a snack, and ticks.
// Shared by lib/__tests__/shopping-print.test.ts and the print page's test.

const line = (
  name: string,
  quantity: number | null,
  unit: "kg" | "g" | "l" | null,
) => ({ name, quantity, quantityMax: null, unit, note: null });

export function shoppingFacts(): ShoppingFacts {
  return {
    plan: {
      cycle: 2027,
      daysOnSite: 2,
      firstDay: "2027-04-22",
      days: [
        { breakfast: 40, dinner: 40 },
        { breakfast: 40, dinner: 50 },
      ],
      version: 1,
      updatedAt: null,
    },
    menu: {
      cycle: 2027,
      items: [
        { id: "m1", day: 1, meal: "breakfast", position: 0, recipeId: "shak" },
        { id: "m2", day: 1, meal: "dinner", position: 0, recipeId: "dal" },
        { id: "m3", day: 2, meal: "dinner", position: 0, recipeId: "salad" },
      ],
      recipes: {
        shak: {
          recipeId: "shak",
          title: "Shakshuka",
          versionId: "v1",
          categories: ["produce", "protein", "spice"],
          counts: [
            {
              plates: 40,
              lines: [
                line("Tomatoes", 2, "kg"),
                line("Eggs", 80, null),
                line("Salt", null, null),
              ],
            },
          ],
          openPlates: [],
          allergens: [],
          allergensMarked: true,
          allergenRevision: 0,
        },
        dal: {
          recipeId: "dal",
          title: "Camp dal",
          versionId: "v2",
          categories: ["produce", "legume"],
          counts: [
            {
              plates: 40,
              lines: [
                line("Tomatoes", 500, "g"),
                line("Red lentils", 1.5, "kg"),
              ],
            },
          ],
          openPlates: [],
          allergens: [],
          allergensMarked: true,
          allergenRevision: 0,
        },
        salad: {
          recipeId: "salad",
          title: "Green salad",
          versionId: "v3",
          categories: ["produce"],
          counts: [{ plates: 20, lines: [line("Lettuce", 4, null)] }],
          openPlates: [],
          allergens: [],
          allergensMarked: false,
          allergenRevision: 0,
        },
      },
    },
    snacks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Rusks",
        amount: "4 boxes",
      },
    ],
    // Eggs are bought at the amount the list needs; the lentils were ticked
    // at an old amount, so they still need buying.
    ticks: [
      { key: "eggs|", amount: "80" },
      { key: "red lentils|g", amount: "1 kg" },
    ],
  } as ShoppingFacts;
}

export const SNACK_KEY = "snack:00000000-0000-4000-8000-000000000001";

export function shoppingPrices(): ShoppingPrice[] {
  return [
    {
      key: "tomatoes|g",
      shop: "Vlei Farm Stall",
      amountCents: 9600,
      kind: "estimate",
      version: 1,
    },
    {
      key: "red lentils|g",
      shop: "Tafelberg Wholesale",
      amountCents: 11550,
      kind: "paid",
      version: 1,
    },
    {
      key: "eggs|",
      shop: "Tafelberg Wholesale",
      amountCents: 26600,
      kind: "estimate",
      version: 1,
    },
    {
      key: SNACK_KEY,
      shop: " tafelberg wholesale",
      amountCents: 19600,
      kind: "estimate",
      version: 1,
    },
  ];
}
