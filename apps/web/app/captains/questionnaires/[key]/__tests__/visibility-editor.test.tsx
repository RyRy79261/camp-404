import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Question, type VisibleIf } from "@camp404/types";
import { VisibilityEditor } from "../visibility-editor";

// The "show this when…" editor: off by default, on points at the nearest
// earlier question, and every control keeps the condition valid.

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
) {
  const onChange = vi.fn();
  render(
    <VisibilityEditor
      value={value}
      fields={fields}
      subject="block"
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

  it("starts afresh when the question changes", () => {
    const onChange = renderEditor({ fieldId: "drives", op: "eq", value: true });
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "diet" },
    });
    expect(onChange).toHaveBeenCalledWith({
      fieldId: "diet",
      op: "eq",
      value: "omni",
    });
  });

  it("offers only the conditions and answers the question can have", () => {
    const onChange = renderEditor({ fieldId: "diet", op: "eq", value: "omni" });
    const ops = Array.from(
      (screen.getByLabelText("Condition") as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(ops).toEqual(["is", "is not", "is answered", "is not answered"]);

    fireEvent.change(screen.getByLabelText("Answer"), {
      target: { value: "veg" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "diet",
      op: "eq",
      value: "veg",
    });

    fireEvent.change(screen.getByLabelText("Condition"), {
      target: { value: "is_answered" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      fieldId: "diet",
      op: "is_answered",
    });
    expect(screen.getByText("Shown when “Diet” is Everything.")).toBeTruthy();
  });

  it("says on the answer box when a number is one the question cannot give", () => {
    const crew = Question.parse({
      id: "crew",
      kind: "number",
      prompt: "Crew size",
      min: 0,
      max: 6,
    });
    renderEditor({ fieldId: "crew", op: "eq", value: 9 }, [crew]);
    const answer = screen.getByLabelText("Answer");
    expect(answer.getAttribute("aria-invalid")).toBe("true");
    expect(answer.getAttribute("max")).toBe("6");
    expect(screen.getByRole("alert").textContent).toBe(
      "A whole number from 0 to 6.",
    );
    // A slip in the number is not a changed question.
    expect(screen.queryByText(/The question this depends on/)).toBeNull();
  });

  it("warns when the question it depends on is gone", () => {
    renderEditor({ fieldId: "gone", op: "is_answered" });
    expect(
      screen.getByText(/The question this depends on is missing/),
    ).toBeTruthy();
    expect((screen.getByLabelText("Question") as HTMLSelectElement).value).toBe(
      "",
    );
  });
});
