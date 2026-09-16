import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  projectColumnsToCard,
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "../responsive-data-table";

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  status: string;
  diet: string;
  completed: string;
}

const rows: Row[] = [
  { id: "a", name: "Ada", status: "Done", diet: "Vegan", completed: "2 Sept" },
  { id: "g", name: "Grace", status: "Done", diet: "None", completed: "3 Sept" },
];

const columns: ResponsiveColumn<Row>[] = [
  { id: "name", header: "Member", role: "title", cell: (r) => r.name },
  { id: "status", header: "Status", role: "badge", cell: (r) => r.status },
  { id: "diet", header: "Any dietary needs?", cell: (r) => r.diet },
  {
    id: "completed",
    header: "Completed",
    mobileHidden: true,
    cell: (r) => r.completed,
  },
  {
    id: "open",
    header: "Open",
    role: "actions",
    hideHeader: true,
    cell: (r) => <button type="button">Open {r.name}</button>,
  },
];

describe("projectColumnsToCard", () => {
  it("puts each column in its card slot, in order", () => {
    const p = projectColumnsToCard(columns);
    expect(p.title.map((c) => c.id)).toEqual(["name"]);
    expect(p.badges.map((c) => c.id)).toEqual(["status"]);
    expect(p.pairs.map((c) => c.id)).toEqual(["diet"]);
    expect(p.actions.map((c) => c.id)).toEqual(["open"]);
    expect(p.hidden.map((c) => c.id)).toEqual(["completed"]);
  });

  it("lets mobileHidden win over a role", () => {
    const p = projectColumnsToCard<Row>([
      {
        id: "name",
        header: "Member",
        role: "title",
        mobileHidden: true,
        cell: (r) => r.name,
      },
    ]);
    expect(p.title).toHaveLength(0);
    expect(p.hidden.map((c) => c.id)).toEqual(["name"]);
  });
});

describe("ResponsiveDataTable", () => {
  it("draws every column in the table", () => {
    render(
      <ResponsiveDataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        label="Answers"
      />,
    );
    const table = screen.getByRole("table", { name: "Answers" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Member",
      "Status",
      "Any dietary needs?",
      "Completed",
      "Open",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("draws one card per row, without the hidden column", () => {
    render(
      <ResponsiveDataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        label="Answers"
      />,
    );
    const cards = within(
      screen.getByRole("list", { name: "Answers" }),
    ).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const ada = within(cards[0]!);
    expect(ada.getByText("Ada")).toBeTruthy();
    expect(ada.getByText("Any dietary needs?").tagName).toBe("DT");
    expect(ada.getByText("Vegan").tagName).toBe("DD");
    expect(ada.queryByText("2 Sept")).toBeNull();
    expect(ada.getByRole("button", { name: "Open Ada" })).toBeTruthy();
  });

  it("stacks a label above its value when asked", () => {
    render(
      <ResponsiveDataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        label="Answers"
        pairLayout="stacked"
      />,
    );
    const card = within(
      screen.getByRole("list", { name: "Answers" }),
    ).getAllByRole("listitem")[0]!;
    const pair = within(card).getByText("Any dietary needs?").parentElement!;
    expect(pair.className).toContain("flex-col");
  });
});
