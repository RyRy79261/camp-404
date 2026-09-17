import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckboxCardGroup } from "../option-card-group";

afterEach(cleanup);

const options = [
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
];

describe("CheckboxCardGroup", () => {
  it("is a group of checkbox cards that toggle on a tap", () => {
    const onValuesChange = vi.fn();
    render(
      <CheckboxCardGroup
        aria-label="Which crews can you help with?"
        options={options}
        values={["structures"]}
        onValuesChange={onValuesChange}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Which crews can you help with?" }),
    ).toBeTruthy();
    const kitchen = screen.getByRole("checkbox", { name: "Kitchen" });
    expect(kitchen.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(kitchen);
    expect(onValuesChange).toHaveBeenLastCalledWith(["structures", "kitchen"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Structures" }));
    expect(onValuesChange).toHaveBeenLastCalledWith([]);
  });

  it("marks a picked card the way the board draws it", () => {
    render(
      <CheckboxCardGroup
        options={options}
        values={["kitchen"]}
        onValuesChange={() => {}}
      />,
    );
    const kitchen = screen.getByRole("checkbox", { name: "Kitchen" });
    expect(kitchen.getAttribute("aria-checked")).toBe("true");
    expect(kitchen.className).toContain("border-primary");
    expect(
      screen.getByRole("checkbox", { name: "Structures" }).className,
    ).toContain("bg-muted");
  });
});
