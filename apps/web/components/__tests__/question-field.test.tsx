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

// boolean — an on/off Switch. Stores a real boolean, and only once toggled (an
// untouched required boolean stays "missing").
const booleanField: Question = {
  id: "lead",
  kind: "boolean",
  prompt: "Want to lead a team?",
  required: false,
};

describe("QuestionField — boolean", () => {
  it("renders a switch defaulting to off", () => {
    render(
      <QuestionField question={booleanField} value={undefined} onChange={() => {}} />,
    );
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("emits a real boolean when toggled on", () => {
    const onChange = vi.fn();
    render(
      <QuestionField question={booleanField} value={undefined} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("QuestionField — email & phone", () => {
  it("email uses the email input type and emits the typed string", () => {
    const onChange = vi.fn();
    const q: Question = { id: "e", kind: "email", prompt: "Email", required: true };
    render(<QuestionField question={q} value={undefined} onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.type).toBe("email");
    fireEvent.change(input, { target: { value: "a@b.co" } });
    expect(onChange).toHaveBeenCalledWith("a@b.co");
  });

  it("phone uses the tel input type", () => {
    const q: Question = { id: "p", kind: "phone", prompt: "Phone", required: true };
    render(<QuestionField question={q} value={undefined} onChange={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).type).toBe("tel");
  });
});

// slider with display:'segmented' — the builder "Scale": a row of number cells
// (like `number`), NOT a dragged slider; the value is the chosen number.
const segmentedScale: Question = {
  id: "rating",
  kind: "slider",
  prompt: "Rate it",
  min: 1,
  max: 5,
  step: 1,
  display: "segmented",
  required: true,
};

describe("QuestionField — slider (segmented)", () => {
  it("renders number cells, not a dragged slider", () => {
    render(
      <QuestionField question={segmentedScale} value={undefined} onChange={() => {}} />,
    );
    expect(screen.getAllByRole("radio").map((c) => c.textContent)).toEqual([
      "1", "2", "3", "4", "5",
    ]);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("emits the chosen cell as a number", () => {
    const onChange = vi.fn();
    render(
      <QuestionField question={segmentedScale} value={undefined} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
