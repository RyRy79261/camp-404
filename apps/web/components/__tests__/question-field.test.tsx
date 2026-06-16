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
