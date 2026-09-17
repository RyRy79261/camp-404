import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Question, type Block } from "@camp404/types";
import { BlockEditorDialog } from "../block-editor";
import { morphQuestion } from "../field-kinds";

// A captain can give a long question a short label for the My forms change
// log. It survives a change of field type.

afterEach(cleanup);

function renderEditor(question: Question) {
  const onSave = vi.fn();
  render(
    <BlockEditorDialog
      block={{ kind: "question", question } as Block}
      questionnaireKey="feedback"
      fields={[]}
      open
      onSave={onSave}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onSave;
}

const drives = Question.parse({
  id: "drives",
  kind: "boolean",
  prompt: "Will you be driving a car to the burn?",
});

describe("BlockEditorDialog — short label", () => {
  it("saves a short label, and clears a blank one", () => {
    const onSave = renderEditor(drives);
    const input = screen.getByLabelText("Short label (optional)");
    expect(input.getAttribute("maxLength")).toBe("40");

    fireEvent.change(input, { target: { value: "Driving" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0]![0].question).toMatchObject({
      shortLabel: "Driving",
    });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[1]![0].question.shortLabel).toBeUndefined();
  });

  it("keeps the short label when the field type changes", () => {
    const labelled = { ...drives, shortLabel: "Driving" };
    expect(morphQuestion(labelled, "single_select")).toMatchObject({
      shortLabel: "Driving",
    });
    expect(morphQuestion(labelled, "short_text")).toMatchObject({
      shortLabel: "Driving",
    });
  });
});
