import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Question, starScaleLabels } from "@camp404/types";

vi.mock("next/navigation", () => ({ useParams: () => null }));

import { QuestionField } from "../questionnaire/field";

// The rating grid's runner control (#251): a radio group per row, native
// radios so the keyboard and a screen reader work without extra wiring.

afterEach(cleanup);

const LIKERT = Question.parse({
  id: "shifts",
  kind: "rating_grid",
  prompt: "About the shifts",
  rows: [
    { id: "fair", label: "The shifts were fair" },
    { id: "clear", label: "I knew my shift" },
  ],
  scale: ["False", "Not sure", "True"],
  allowNa: true,
  required: true,
});

const STARS = Question.parse({
  id: "meals",
  kind: "rating_grid",
  prompt: "Rate the meals",
  display: "stars",
  rows: [{ id: "d1", label: "Day 1 dinner" }],
  scale: starScaleLabels(5),
  allowNa: true,
  naLabel: "Didn't eat it",
  required: false,
});

describe("QuestionField — rating_grid", () => {
  it("draws one radio group per row, named by its statement", () => {
    render(<QuestionField question={LIKERT} value={{}} onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "The shifts were fair" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label") ?? "")).toEqual([
      "False",
      "Not sure",
      "True",
      "",
    ]);
    // The N/A column is named by its visible text.
    expect(within(group).getByRole("radio", { name: "N/A" })).toBeTruthy();
    // One name per row: the browser moves along a row with the arrow keys.
    const names = new Set(radios.map((r) => r.getAttribute("name")));
    expect(names.size).toBe(1);
    const other = within(
      screen.getByRole("group", { name: "I knew my shift" }),
    ).getAllByRole("radio")[0];
    expect(other?.getAttribute("name")).not.toBe(
      radios[0]?.getAttribute("name"),
    );
  });

  it("stores the chosen point's position for that row only", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={LIKERT}
        value={{ clear: 1 }}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole("group", { name: "The shifts were fair" });
    fireEvent.click(within(group).getByRole("radio", { name: "True" }));
    expect(onChange).toHaveBeenCalledWith({ clear: 1, fair: 3 });
    fireEvent.click(within(group).getByRole("radio", { name: "N/A" }));
    expect(onChange).toHaveBeenLastCalledWith({ clear: 1, fair: "na" });
  });

  it("shows the stored answer as checked", () => {
    render(
      <QuestionField
        question={LIKERT}
        value={{ fair: 2 }}
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole("group", { name: "The shifts were fair" });
    const notSure = within(group).getByRole("radio", {
      name: "Not sure",
    }) as HTMLInputElement;
    expect(notSure.checked).toBe(true);
  });

  it("names each star by its label and place, and offers a clear on optional rows", () => {
    const onChange = vi.fn();
    render(
      <QuestionField question={STARS} value={{ d1: 4 }} onChange={onChange} />,
    );
    const group = screen.getByRole("group", { name: "Day 1 dinner" });
    const four = within(group).getByRole("radio", {
      name: "4 stars, 4 of 5",
    }) as HTMLInputElement;
    expect(four.checked).toBe(true);
    expect(
      within(group).getByRole("radio", { name: "Didn't eat it" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear the answer for Day 1 dinner" }),
    );
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("offers no clear on a required grid", () => {
    render(
      <QuestionField
        question={LIKERT}
        value={{ fair: 2 }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Clear the answer/ }),
    ).toBeNull();
  });
});
