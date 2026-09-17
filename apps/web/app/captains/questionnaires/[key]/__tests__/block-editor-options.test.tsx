import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Question, type Block } from "@camp404/types";
import { BlockEditorDialog } from "../block-editor";

// The field editor sets a short text's format and turns on "Other…" for a
// choice field. Both existed in the data model with no control to set them.

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

describe("BlockEditorDialog — format and Other…", () => {
  it("sets a short text's format, and plain text clears it", () => {
    const onSave = renderEditor(
      Question.parse({ id: "site", kind: "short_text", prompt: "Website" }),
    );
    const select = screen.getByLabelText("Format") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "url" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0]![0].question.format).toBe("url");

    fireEvent.change(select, { target: { value: "text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[1]![0].question.format).toBeUndefined();
  });

  it("turns on Other… for a single pick", () => {
    const onSave = renderEditor(
      Question.parse({
        id: "diet",
        kind: "single_select",
        prompt: "Diet",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Offer “Other…”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0]![0].question.allowOther).toBe(true);
  });

  it("offers no Other… on a dropdown", () => {
    renderEditor(
      Question.parse({
        id: "country",
        kind: "combobox",
        prompt: "Country",
        options: [
          { value: "za", label: "South Africa" },
          { value: "na", label: "Namibia" },
        ],
      }),
    );
    expect(screen.queryByRole("switch", { name: "Offer “Other…”" })).toBeNull();
  });
});
