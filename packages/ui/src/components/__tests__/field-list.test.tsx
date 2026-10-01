import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorsNote, FieldList, yesNo } from "../field-list";

afterEach(cleanup);

describe("FieldList", () => {
  it("shows each label over its value as text, never as an input", () => {
    const { container } = render(
      <FieldList
        fields={[
          { label: "Generator", value: "Honda EU70is" },
          { label: "Days on site", value: 11 },
          { label: "Notes", value: "Fill up at 06:00", wide: true },
        ]}
      />,
    );
    expect(
      container.querySelector("input, select, textarea, button"),
    ).toBeNull();
    const term = screen.getByText("Generator");
    expect(term.tagName).toBe("DT");
    expect(term.nextElementSibling?.textContent).toBe("Honda EU70is");
    expect(screen.getByText("Notes").parentElement!.className).toContain(
      "page-sm:col-span-2",
    );
  });

  it("says a missing value in words", () => {
    render(
      <FieldList
        fields={[
          { label: "Phone", value: null },
          { label: "Car", value: "—" },
        ]}
        emptyText="Not given"
      />,
    );
    const list = screen.getByText("Phone").closest("dl")!;
    expect(within(list).getAllByText("Not given")).toHaveLength(2);
  });

  it("uses one column when asked", () => {
    const { container } = render(
      <FieldList columns={1} fields={[{ label: "A", value: "b" }]} />,
    );
    expect(container.querySelector("dl")!.className).not.toContain(
      "grid-cols-2",
    );
  });
});

describe("yesNo and EditorsNote", () => {
  it("words a yes/no answer", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
    expect(yesNo(null)).toBe("—");
  });

  it("is one quiet line", () => {
    render(<EditorsNote>Captains change the load list.</EditorsNote>);
    expect(screen.getByText("Captains change the load list.").tagName).toBe(
      "P",
    );
  });
});
