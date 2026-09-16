import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Question, type Block } from "@camp404/types";
import { BlockEditorDialog } from "../block-editor";

// A captain marks what the app uses an answer for (allergies, driving this
// year, arrival day…). Only the uses that fit the field type are offered.

afterEach(cleanup);

function renderEditor(question: Question) {
  const onSave = vi.fn();
  render(
    <BlockEditorDialog
      block={{ kind: "question", question } as Block}
      fields={[]}
      open
      onSave={onSave}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onSave;
}

describe("BlockEditorDialog — what the app uses the answer for", () => {
  it("offers the uses a yes/no field can have, and saves the one picked", () => {
    const onSave = renderEditor(
      Question.parse({ id: "drives", kind: "boolean", prompt: "Driving?" }),
    );
    const select = screen.getByLabelText(
      "The app uses this answer as",
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Nothing else",
      "Has an anaphylactic allergy",
      "Driving to camp this year (joins the drivers audience)",
    ]);

    fireEvent.change(select, { target: { value: "driving_this_year" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0]![0].question).toMatchObject({
      role: "driving_this_year",
    });
  });

  it("clears the use when set back to nothing", () => {
    const onSave = renderEditor(
      Question.parse({
        id: "arrive",
        kind: "date",
        prompt: "Arriving",
        role: "arrival_date",
      }),
    );
    fireEvent.change(screen.getByLabelText("The app uses this answer as"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0]![0].question.role).toBeUndefined();
  });

  it("offers nothing for a field type no use fits", () => {
    renderEditor(
      Question.parse({ id: "n", kind: "number", prompt: "How many?" }),
    );
    expect(screen.queryByLabelText("The app uses this answer as")).toBeNull();
  });
});
