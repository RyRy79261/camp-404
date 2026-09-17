import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Question, type VisibleIf } from "@camp404/types";
import { VisibilityEditor } from "../visibility-editor";
import { choose, installSelectPolyfills, optionNames } from "./select-helpers";

// The "Show only when…" editor: off by default, on points at the nearest
// earlier question, and every control keeps the condition valid.

beforeAll(installSelectPolyfills);
afterEach(cleanup);

const diet = Question.parse({
  id: "diet",
  kind: "single_select",
  prompt: "Diet",
  options: [
    { value: "omni", label: "Everything" },
    { value: "veg", label: "Vegetarian" },
  ],
});
const drives = Question.parse({
  id: "drives",
  kind: "boolean",
  prompt: "Driving?",
});

function renderEditor(
  value: VisibleIf | undefined,
  fields: Question[] = [diet, drives],
  subject: "block" | "section" = "block",
) {
  const onChange = vi.fn();
  render(
    <VisibilityEditor
      value={value}
      fields={fields}
      subject={subject}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("VisibilityEditor", () => {
  it("cannot be turned on when no question comes before", () => {
    renderEditor(undefined, []);
    expect(
      (
        screen.getByRole("switch", {
          name: /Show only when/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Add a question above this one to use this."),
    ).toBeTruthy();
  });

  it("says a section needs a question in an earlier section", () => {
    renderEditor(undefined, [], "section");
    expect(
      screen.getByText("Add a question in an earlier section to use this."),
    ).toBeTruthy();
  });

  it("turns on pointing at the nearest earlier question", () => {
    const onChange = renderEditor(undefined);
    fireEvent.click(screen.getByRole("switch", { name: /Show only when/ }));
    expect(onChange).toHaveBeenCalledWith({
      fieldId: "drives",
      op: "eq",
      value: true,
    });
  });

  it("turns off by clearing the condition", () => {
    const onChange = renderEditor({ fieldId: "drives", op: "eq", value: true });
    fireEvent.click(screen.getByRole("switch", { name: /Show only when/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("starts afresh when the question changes", async () => {
    const onChange = renderEditor({ fieldId: "drives", op: "eq", value: true });
    await choose(screen.getByRole("combobox", { name: "Question" }), "Diet");
    expect(onChange).toHaveBeenCalledWith({
      fieldId: "diet",
      op: "eq",
      value: "omni",
    });
  });

  it("offers only the conditions and answers the question can have", async () => {
    const onChange = renderEditor({ fieldId: "diet", op: "eq", value: "omni" });
    expect(
      await optionNames(screen.getByRole("combobox", { name: "Condition" })),
    ).toEqual(["is", "is not", "is answered", "is not answered"]);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    await choose(
      screen.getByRole("combobox", { name: "Answer" }),
      "Vegetarian",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "diet",
      op: "eq",
      value: "veg",
    });

    await choose(
      screen.getByRole("combobox", { name: "Condition" }),
      "is answered",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "diet",
      op: "is_answered",
    });
    expect(screen.getByText("Shown when “Diet” is Everything.")).toBeTruthy();
  });

  it("answers a yes/no question with Yes or No", () => {
    const onChange = renderEditor({ fieldId: "drives", op: "eq", value: true });
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "drives",
      op: "eq",
      value: false,
    });
  });

  it("says on the answer box when a number is one the question cannot give", () => {
    const crew = Question.parse({
      id: "crew",
      kind: "number",
      prompt: "Crew size",
      min: 0,
      max: 6,
    });
    const onChange = renderEditor({ fieldId: "crew", op: "eq", value: 9 }, [
      crew,
    ]);
    const answer = screen.getByRole("spinbutton", { name: "Answer" });
    expect(answer.getAttribute("aria-invalid")).toBe("true");
    expect(answer.getAttribute("max")).toBe("6");
    expect(screen.getByRole("alert").textContent).toBe(
      "A whole number from 0 to 6.",
    );
    // A slip in the number is not a changed question.
    expect(screen.queryByText(/The question this depends on/)).toBeNull();

    fireEvent.change(answer, { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "crew",
      op: "eq",
      value: 4,
    });
  });

  it("warns when the question it depends on is gone", () => {
    renderEditor({ fieldId: "gone", op: "is_answered" });
    expect(
      screen.getByText(/The question this depends on is missing/),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Question" }).textContent,
    ).toContain("Pick a question");
  });
});
