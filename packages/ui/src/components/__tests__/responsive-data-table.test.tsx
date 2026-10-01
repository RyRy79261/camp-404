import type * as React from "react";
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

describe("ResponsiveDataTable inside a window", () => {
  function renderTable(
    extra: Partial<React.ComponentProps<typeof ResponsiveDataTable<Row>>> = {},
  ) {
    return render(
      <ResponsiveDataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        label="Answers"
        {...extra}
      />,
    );
  }

  it("switches on the table's own width, not the screen's", () => {
    const { container } = renderTable();
    const root = container.querySelector(
      '[data-slot="responsive-data-table"]',
    )!;
    expect(root.className).toContain("@container/rdt");
    const table = root.querySelector('[data-rdt-layout="table"]')!;
    const cards = root.querySelector('[data-rdt-layout="cards"]')!;
    expect(table.className).toContain("@min-[48rem]/rdt:block");
    expect(cards.className).toContain("@min-[48rem]/rdt:hidden");
    // Never the screen's (md:) or the page's (page-md:) breakpoints.
    expect(table.className).not.toMatch(/(^|\s)(page-)?md:/);
    expect(cards.className).not.toMatch(/(^|\s)(page-)?md:/);
  });

  it("asks for a wider box when told to", () => {
    const { container } = renderTable({ stackBelow: "lg" });
    const table = container.querySelector('[data-rdt-layout="table"]')!;
    expect(table.className).toContain("@min-[64rem]/rdt:block");
  });

  it("frames only the table, never the cards", () => {
    const { container } = renderTable({ framed: true });
    const table = container.querySelector('[data-rdt-layout="table"]')!;
    const cards = container.querySelector('[data-rdt-layout="cards"]')!;
    expect(table.className).toContain("rounded-xl");
    expect(table.className).toContain("border");
    expect(cards.className).not.toContain("border");
  });

  it("keeps the actions column narrow and lets text wrap", () => {
    renderTable();
    const table = screen.getByRole("table", { name: "Answers" });
    const cells = within(within(table).getAllByRole("row")[1]!).getAllByRole(
      "cell",
    );
    const diet = cells[2]!;
    const open = cells[4]!;
    expect(diet.className).toContain("whitespace-normal");
    expect(diet.className).not.toContain("whitespace-nowrap");
    expect(open.className).toContain("w-px");
    expect(open.className).toContain("whitespace-nowrap");
  });

  it("cuts a truncated column with its full text as the tooltip", () => {
    const long = "Bringing my two igloos and a spare lid";
    render(
      <ResponsiveDataTable
        columns={[
          { id: "name", header: "Member", role: "title", cell: (r) => r.name },
          {
            id: "note",
            header: "Note",
            cell: () => long,
            truncate: () => long,
          },
        ]}
        data={rows}
        getRowKey={(r) => r.id}
        label="Notes"
      />,
    );
    const table = screen.getByRole("table", { name: "Notes" });
    const note = within(table).getAllByText(long)[0]!;
    expect(note.className).toContain("truncate");
    expect(note.getAttribute("title")).toBe(long);
  });

  it("lets an actions column span the card's footer", () => {
    const { container } = render(
      <ResponsiveDataTable
        columns={[
          { id: "name", header: "Member", role: "title", cell: (r) => r.name },
          {
            id: "decide",
            header: "Decision",
            role: "actions",
            cardClassName: "w-full",
            cell: (r) => <button type="button">Decide {r.name}</button>,
          },
        ]}
        data={rows}
        getRowKey={(r) => r.id}
        label="Decisions"
      />,
    );
    const cards = container.querySelector('[data-rdt-layout="cards"]')!;
    const button = within(cards as HTMLElement).getByRole("button", {
      name: "Decide Ada",
    });
    expect(button.parentElement!.className).toBe("w-full");
  });
});
