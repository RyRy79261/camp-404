import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";

function Roster() {
  return (
    <Table>
      <TableCaption>Camp roster</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Handle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-state="selected">
          <TableCell>Ada Lovelace</TableCell>
          <TableCell>@ada</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>1 member</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

describe("Table", () => {
  it("wraps the table in a scrolling root", () => {
    const { container } = render(<Roster />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe("DIV");
    expect(root.className).toContain("overflow-x-auto"); // never clipped
    expect(root.className).toContain("relative");
    expect(root.className).toContain("w-full");
    expect(root.getAttribute("data-slot")).toBe("table-container");
  });

  it("renders the native table semantics the parts stand for", () => {
    render(<Roster />);
    const table = screen.getByRole("table");
    expect(table.tagName).toBe("TABLE");
    expect(screen.getByRole("columnheader", { name: "Member" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Ada Lovelace" })).toBeTruthy();
    expect(table.querySelector("caption")?.textContent).toBe("Camp roster");
    expect(table.querySelector("tfoot")).toBeTruthy();
  });

  it("merges className into the table itself, not the root", () => {
    const { container } = render(
      <Table className="border-collapse text-left" />,
    );
    const root = container.firstElementChild as HTMLElement;
    const table = root.querySelector("table") as HTMLElement;
    expect(root.className).not.toContain("border-collapse");
    expect(table.className).toContain("border-collapse");
    expect(table.className).toContain("text-left");
    expect(table.className).toContain("caption-bottom"); // base preserved
  });

  it("merges className and forwards attributes on every part", () => {
    render(
      <Table>
        <TableBody>
          <TableRow className="custom-row" data-testid="row">
            <TableCell className="custom-cell" data-testid="cell">
              X
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const row = screen.getByTestId("row");
    const cell = screen.getByTestId("cell");
    expect(row.tagName).toBe("TR");
    expect(row.className).toContain("custom-row");
    expect(row.className).toContain("border-b"); // base preserved
    expect(cell.tagName).toBe("TD");
    expect(cell.className).toContain("custom-cell");
    expect(cell.className).toContain("align-middle");
  });
});
