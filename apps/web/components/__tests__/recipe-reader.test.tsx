import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KitchenRecipe, type PlateLine } from "@camp404/types";
import { RecipeReader } from "@/components/recipes/recipe-reader";

// The recipe as the kitchen reads it (#243), copied from Noble Notations'
// recipe page: ingredients grouped in shop order, the method by phase with
// each step's chips at the chosen plate count, and the practical notes after
// the steps. No food science.

const RECIPE = KitchenRecipe.parse({
  title: "Gai yang",
  plates: 50,
  ingredients: [
    // Written out of shop order on purpose: Sauces, Produce, Protein.
    { name: "Fish sauce", category: "condiment", quantity: 120, unit: "ml" },
    {
      name: "Garlic",
      category: "produce",
      quantity: 8,
      quantityMax: 10,
      unit: "clove",
      preparation: "pounded",
    },
    {
      component: "Marinade",
      name: "Chicken thighs",
      category: "protein",
      quantity: 6,
      unit: "kg",
      note: "Skin on.",
    },
    {
      name: "Coriander root",
      category: "herb",
      quantity: 4,
      unit: "bunch",
      optional: true,
    },
  ],
  steps: [
    {
      phase: "Marinate",
      instruction: "Pound the garlic and coriander root with the fish sauce.",
      uses: ["Garlic", "Coriander root", "Fish sauce"],
      note: "A blender works too.",
    },
    {
      phase: "Marinate",
      instruction: "Rub the paste into the chicken and leave it overnight.",
      uses: ["Chicken thighs"],
      durationMinutes: 480,
    },
    {
      phase: "Roast",
      instruction: "Roast skin side up until the skin crackles.",
      uses: ["Chicken thighs"],
      durationMinutes: 35,
      durationMaxMinutes: 40,
      temperatureC: 220,
      equipment: ["oven trays", "rack"],
    },
  ],
  notes: [
    { kind: "substitution", body: "Firm tofu takes the marinade well." },
    { kind: "warning", title: "Heat", body: "Keep raw chicken below 5 °C." },
  ],
});

const FOR_60: PlateLine[] = [
  {
    name: "Fish sauce",
    quantity: 140,
    quantityMax: null,
    unit: "ml",
    note: null,
  },
  { name: "Garlic", quantity: 10, quantityMax: 12, unit: "clove", note: null },
  {
    name: "Chicken thighs",
    quantity: 7.2,
    quantityMax: null,
    unit: "kg",
    note: "Two cases.",
  },
  {
    name: "Coriander root",
    quantity: 5,
    quantityMax: null,
    unit: "bunch",
    note: null,
  },
];

afterEach(cleanup);

describe("RecipeReader", () => {
  it("groups the ingredients in shop order, with Noble Notations' headings", () => {
    const { container } = render(<RecipeReader recipe={RECIPE} />);
    const groups = [...container.querySelectorAll("[data-category]")].map((g) =>
      g.getAttribute("data-category"),
    );
    expect(groups).toEqual(["produce", "protein", "herb", "condiment"]);
    const aside = screen.getByRole("region", { name: "Ingredients" });
    expect(
      within(aside)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Produce", "Protein", "Fresh herbs", "Sauces & condiments"]);
    const protein = within(aside).getByRole("list", { name: "Protein" });
    expect(protein.textContent).toContain("6 kg");
    expect(protein.textContent).toContain("Marinade:");
    expect(protein.textContent).toContain("Skin on.");
    expect(
      within(aside).getByRole("list", { name: "Produce" }).textContent,
    ).toContain("8–10 cloves");
    expect(within(aside).getByText("pounded")).toBeTruthy();
    expect(within(aside).getByText("optional")).toBeTruthy();
  });

  it("numbers the steps straight through the phases, with each phase's letter and count", () => {
    render(<RecipeReader recipe={RECIPE} />);
    const method = screen.getByRole("region", { name: "Method" });
    expect(
      within(method)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Marinate", "Roast"]);
    expect(within(method).getByText("2 steps")).toBeTruthy();
    expect(within(method).getByText("1 step")).toBeTruthy();
    const lists = within(method).getAllByRole("list", {
      name: /^Step \d uses$/,
    });
    expect(lists).toHaveLength(3);
    expect(method.querySelectorAll("ol")[1]?.getAttribute("start")).toBe("3");
    expect(within(method).getByText("A blender works too.")).toBeTruthy();
    expect(within(method).getByText("8 h")).toBeTruthy();
    expect(within(method).getByText("35–40 min")).toBeTruthy();
    expect(within(method).getByText("220 °C")).toBeTruthy();
    expect(within(method).getByText("oven trays, rack")).toBeTruthy();
  });

  it("shows the chosen count's amounts in the list and in each step's chips", () => {
    render(<RecipeReader recipe={RECIPE} amounts={FOR_60} />);
    const step1 = screen.getByRole("list", { name: "Step 1 uses" });
    expect(
      within(step1)
        .getAllByRole("listitem")
        .map((chip) => chip.textContent),
    ).toEqual([
      "10–12 clovesGarlic",
      "5 bunchesCoriander root",
      "140 mlFish sauce",
    ]);
    expect(screen.getByRole("list", { name: "Step 3 uses" }).textContent).toBe(
      "7.2 kgChicken thighs",
    );
    const aside = screen.getByRole("region", { name: "Ingredients" });
    expect(aside.textContent).toContain("7.2 kg");
    expect(aside.textContent).not.toContain("6 kg");
    expect(within(aside).getByText("Two cases.")).toBeTruthy();

    cleanup();
    render(<RecipeReader recipe={RECIPE} />);
    expect(screen.getByRole("list", { name: "Step 3 uses" }).textContent).toBe(
      "6 kgChicken thighs",
    );
  });

  it("puts the cook notes after the steps, warnings first, with the count's notes and pots", () => {
    const { container } = render(
      <RecipeReader
        recipe={RECIPE}
        amounts={FOR_60}
        count={{ plates: 60, notes: ["Roast in two batches."], pots: 2 }}
      />,
    );
    const method = screen.getByRole("region", { name: "Method" });
    const notes = screen.getByRole("region", { name: "Cook notes" });
    expect(
      method.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(notes).getByText("For 60 plates")).toBeTruthy();
    expect(within(notes).getByText("Cook in 2 pots.")).toBeTruthy();
    expect(within(notes).getByText("Roast in two batches.")).toBeTruthy();
    const kinds = [...container.querySelectorAll("[data-kind]")].map((n) =>
      n.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["warning", "substitution"]);
    expect(
      within(notes).getByText("Keep raw chicken below 5 °C."),
    ).toBeTruthy();
  });

  it("leaves the cook notes out when there are none", () => {
    render(<RecipeReader recipe={{ ...RECIPE, notes: [] }} />);
    expect(screen.queryByRole("region", { name: "Cook notes" })).toBeNull();
  });

  it("shows nothing of food science: no science, mass flow or taxonomy", () => {
    const { container } = render(
      <RecipeReader
        recipe={RECIPE}
        amounts={FOR_60}
        count={{ plates: 60, notes: ["Roast in two batches."], pots: 2 }}
      />,
    );
    const text = container.textContent ?? "";
    for (const word of [
      /science/i,
      /mass flow/i,
      /taxonomy/i,
      /mechanism/i,
      /literature/i,
      /citation/i,
    ]) {
      expect(text).not.toMatch(word);
    }
  });
});
