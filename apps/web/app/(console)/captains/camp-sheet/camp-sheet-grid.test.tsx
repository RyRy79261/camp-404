import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CampSheet } from "@/lib/camp-sheet";
import { CampSheetGrid, columnLetter } from "./camp-sheet-grid";

// The Camp sheet's grid: search over every cell, the team and This-year
// filters, a click that fills the formula bar, arrow keys that move the
// selection, and the privacy mark on the private columns.

afterEach(cleanup);

const SHEET: CampSheet = {
  columns: [
    { key: "name", header: "Name", group: "who", private: false },
    { key: "teams", header: "Teams", group: "who", private: false },
    { key: "this_year", header: "This year", group: "who", private: false },
    {
      key: "emergency_contact_1",
      header: "Emergency contact 1",
      group: "safety",
      private: true,
    },
    { key: "allergies", header: "Allergies", group: "safety", private: true },
    { key: "email", header: "Email", group: "captains", private: false },
  ],
  rows: [
    {
      id: "m1",
      cells: [
        "Aisha Patel",
        "Kitchen (lead)",
        "Accepted",
        "Raj Patel (Father), 072 555 0144",
        "Lactose",
        "aisha@example.com",
      ],
      teams: ["kitchen"],
      thisYear: "accepted",
    },
    {
      id: "m2",
      cells: [
        "Ben Carter",
        "Structures",
        "Maybe, not decided",
        "Sue Carter (Mother), +44 7700 900123",
        "",
        "ben@example.com",
      ],
      teams: ["structures"],
      thisYear: "maybe",
    },
    {
      id: "m3",
      cells: ["Cleo Ndlovu", "", "No answer yet", "", "", "cleo@example.com"],
      teams: [],
      thisYear: null,
    },
  ],
};

const TEAMS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "structures", label: "Structures" },
];

function renderGrid() {
  render(<CampSheetGrid {...SHEET} teams={TEAMS} />);
  return screen.getByRole("grid", { name: "Camp sheet" });
}

/** The names of the people the grid lists, top to bottom. */
function names(grid: HTMLElement): string[] {
  return within(grid)
    .queryAllByRole("rowheader")
    .map((cell) => cell.textContent ?? "");
}

const formulaBar = () => screen.getByRole("region", { name: "Selected cell" });

describe("CampSheetGrid", () => {
  it("lists everyone, with letters, column names and a count", () => {
    const grid = renderGrid();
    expect(names(grid)).toEqual(["Aisha Patel", "Ben Carter", "Cleo Ndlovu"]);
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Name",
      "Teams",
      "This year",
      "Emergency contact 1",
      "Allergies",
      "Email",
    ]);
    expect(screen.getByText("3 of 3 people")).toBeTruthy();
    expect(
      within(formulaBar()).getByText("Click a cell to read all of it here."),
    ).toBeTruthy();
  });

  it("searches every cell, not just the name", () => {
    const grid = renderGrid();
    fireEvent.change(screen.getByLabelText("Search the sheet"), {
      target: { value: "lactose" },
    });
    expect(names(grid)).toEqual(["Aisha Patel"]);
    expect(screen.getByText("1 of 3 people")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search the sheet"), {
      target: { value: "nobody-has-this" },
    });
    expect(names(grid)).toEqual([]);
    expect(within(grid).getByText("No one matches.")).toBeTruthy();
  });

  it("filters by team", () => {
    const grid = renderGrid();
    fireEvent.change(screen.getByLabelText("Filter by team"), {
      target: { value: "structures" },
    });
    expect(names(grid)).toEqual(["Ben Carter"]);
    fireEvent.change(screen.getByLabelText("Filter by team"), {
      target: { value: "" },
    });
    expect(names(grid)).toHaveLength(3);
  });

  it("filters by this year's standing, and by no answer", () => {
    const grid = renderGrid();
    fireEvent.change(screen.getByLabelText("This year"), {
      target: { value: "accepted" },
    });
    expect(names(grid)).toEqual(["Aisha Patel"]);
    fireEvent.change(screen.getByLabelText("This year"), {
      target: { value: "none" },
    });
    expect(names(grid)).toEqual(["Cleo Ndlovu"]);
  });

  it("fills the formula bar with the clicked cell, and marks the row", () => {
    const grid = renderGrid();
    const cell = within(grid).getByText("Sue Carter (Mother), +44 7700 900123");
    fireEvent.click(cell);

    expect(cell.getAttribute("aria-selected")).toBe("true");
    expect(
      within(formulaBar()).getByText("D2 · Emergency contact 1"),
    ).toBeTruthy();
    expect(within(formulaBar()).getByText("Ben Carter")).toBeTruthy();
    const value = within(formulaBar()).getByText(
      "Sue Carter (Mother), +44 7700 900123",
    );
    // The bar shows private words, so a background copy blanks them.
    expect(value.hasAttribute("data-os-private")).toBe(true);
    expect(grid.getAttribute("aria-activedescendant")).toBe(cell.id);
  });

  it("moves the selection with the arrow keys, inside the sheet's edges", () => {
    const grid = renderGrid();
    // The first arrow selects A1.
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(within(formulaBar()).getByText("A1 · Name")).toBeTruthy();

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(within(formulaBar()).getByText("C2 · This year")).toBeTruthy();
    expect(within(formulaBar()).getByText("Maybe, not decided")).toBeTruthy();

    // Up from the top row and left from the first column stay put.
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(within(formulaBar()).getByText("A1 · Name")).toBeTruthy();
  });

  it("drops the selection when a filter hides its row", () => {
    const grid = renderGrid();
    fireEvent.click(within(grid).getByText("ben@example.com"));
    fireEvent.change(screen.getByLabelText("Filter by team"), {
      target: { value: "kitchen" },
    });
    expect(
      within(formulaBar()).getByText("Click a cell to read all of it here."),
    ).toBeTruthy();
  });

  it("marks the private columns' cells, and only those", () => {
    const grid = renderGrid();
    expect(
      within(grid)
        .getByText("Raj Patel (Father), 072 555 0144")
        .hasAttribute("data-os-private"),
    ).toBe(true);
    expect(
      within(grid).getByText("Lactose").hasAttribute("data-os-private"),
    ).toBe(true);
    expect(
      within(grid)
        .getByText("aisha@example.com")
        .hasAttribute("data-os-private"),
    ).toBe(false);
  });

  it("keeps the full text of a cell as its tooltip", () => {
    const grid = renderGrid();
    expect(
      within(grid)
        .getByText("Raj Patel (Father), 072 555 0144")
        .getAttribute("title"),
    ).toBe("Raj Patel (Father), 072 555 0144");
  });
});

describe("columnLetter", () => {
  it("counts like a spreadsheet", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
    ]);
  });
});
