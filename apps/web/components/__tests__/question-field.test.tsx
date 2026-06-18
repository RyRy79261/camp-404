import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Question } from "@camp404/types";

import { QuestionField } from "../questionnaire/question";

// Redesign Divergence #4 ("boards win → RadioCardGroup"): a single_select field
// renders as stacked option cards (radio), not a <Select> dropdown.
const singleSelect: Question = {
  id: "logistics.driving",
  kind: "single_select",
  prompt: "Will you be driving a car to the burn?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "maybe", label: "Maybe — still working it out" },
  ],
  required: true,
};

describe("QuestionField — single_select", () => {
  it("renders stacked radio cards, not a dropdown", () => {
    render(
      <QuestionField
        question={singleSelect}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    // The old affordance was a Radix Select (role="combobox") — gone.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("emits the chosen option's value on select", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={singleSelect}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onChange).toHaveBeenCalledWith("yes");
  });
});

// Board OB-step-06 team interests: a 0–6 number picker rendered as a row of
// whole-number cells, NOT a slider. The stored value is the chosen integer.
const numberField: Question = {
  id: "team_interest.kitchen",
  kind: "number",
  prompt: "Kitchen",
  min: 0,
  max: 6,
  minLabel: "Not for me",
  maxLabel: "Sign me up",
  required: false,
};

describe("QuestionField — number", () => {
  it("renders a cell per whole number from min..max (0–6 ⇒ 7 cells)", () => {
    render(
      <QuestionField question={numberField} value={undefined} onChange={() => {}} />,
    );
    const cells = screen.getAllByRole("radio");
    expect(cells).toHaveLength(7);
    expect(cells.map((c) => c.textContent)).toEqual([
      "0", "1", "2", "3", "4", "5", "6",
    ]);
    // It is not a dragged slider.
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("emits the chosen cell as a number", () => {
    const onChange = vi.fn();
    render(
      <QuestionField question={numberField} value={undefined} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
