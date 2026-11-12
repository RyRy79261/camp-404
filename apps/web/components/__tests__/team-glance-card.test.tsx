import { cleanup, render, screen, within } from "@testing-library/react";
import { ChefHat } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { TeamGlanceCard } from "@/components/teams/team-glance-card";
import type { TeamGlance } from "@/lib/team-glance";

// The shared card of a team's "at a glance" panel: its tiles, bar rows,
// "Needs attention" list, links and note, drawn from what the team's own
// function decided.

afterEach(cleanup);

const GLANCE: TeamGlance = {
  title: "Kitchen at a glance",
  tiles: [
    {
      key: "meals",
      label: "Meals with a recipe",
      value: "12 of 14",
      hint: "2 meals still empty",
      progress: { value: 12, max: 14 },
    },
    {
      key: "allergy",
      label: "Allergy plans",
      value: "1 missing",
      hint: "a meal someone coming can't eat",
      tone: "bad",
    },
  ],
  bars: [
    {
      heading: "Who helps on which day",
      rows: [
        {
          key: "build",
          label: "Build",
          value: "9 going",
          segments: [
            { label: "Going", count: 9, tone: "ok" },
            { label: "Not answered", count: 3, tone: "none" },
          ],
        },
      ],
      legend: [{ label: "Going", tone: "ok" }],
    },
  ],
  attention: [
    {
      key: "d4",
      tone: "warn",
      text: "Day 4 dinner has no recipe yet.",
      link: { href: "/kitchen/meal-plan", label: "Meal plan" },
    },
  ],
  links: [{ href: "/kitchen/shopping", label: "Shopping list" }],
  note: "Allergy plans are for the Kitchen leads and captains.",
};

describe("TeamGlanceCard", () => {
  it("draws the tiles, bars, attention lines, links and note", () => {
    render(<TeamGlanceCard glance={GLANCE} icon={ChefHat} id="kitchen" />);
    const tiles = screen.getByRole("region", { name: "Kitchen at a glance" });
    const meals = within(tiles).getByRole("article", {
      name: "Meals with a recipe",
    });
    expect(meals.textContent).toContain("12 of 14");
    expect(
      within(meals)
        .getByRole("progressbar", { name: "Meals with a recipe" })
        .getAttribute("aria-valuenow"),
    ).toBe("86");
    // A tone is said in words too, never by colour alone.
    expect(
      within(tiles).getByRole("img", { name: "Needs action" }),
    ).toBeTruthy();

    expect(
      screen.getByRole("img", { name: "Build: 9 Going, 3 Not answered" }),
    ).toBeTruthy();

    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(attention.textContent).toContain("Day 4 dinner has no recipe yet.");
    expect(
      within(attention)
        .getByRole("link", { name: "Meal plan" })
        .getAttribute("href"),
    ).toBe("/kitchen/meal-plan");

    expect(
      screen.getByRole("link", { name: "Shopping list" }).getAttribute("href"),
    ).toBe("/kitchen/shopping");
    expect(
      screen.getByText("Allergy plans are for the Kitchen leads and captains."),
    ).toBeTruthy();
  });

  it("leaves out an empty attention list and a missing note", () => {
    render(
      <TeamGlanceCard
        glance={{ ...GLANCE, bars: undefined, attention: [], note: undefined }}
        icon={ChefHat}
        id="kitchen"
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).toBeNull();
    expect(screen.queryByText(/Allergy plans are for/)).toBeNull();
    // Present first, so the absence above is not an empty render.
    expect(screen.getByText("Kitchen at a glance")).toBeTruthy();
  });
});
