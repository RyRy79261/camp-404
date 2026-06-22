import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OptionsEditor, type EditableOption } from "../options-editor";

describe("OptionsEditor", () => {
  it("appends a uniquely-slugged option value on Add", () => {
    const onChange = vi.fn();
    // slugify("option 3") collides with the existing "option-3", so add() must
    // walk the uniqueness loop to "option-3-4".
    const options: EditableOption[] = [
      { value: "option-1", label: "Option 1" },
      { value: "option-3", label: "Option 3" },
    ];
    render(<OptionsEditor options={options} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add option" }));

    const next = onChange.mock.calls.at(-1)![0] as EditableOption[];
    const added = next.at(-1)!;
    expect(added.value).toBe("option-3-4");
    // The appended value must not collide (it is the React reconciliation key).
    expect(options.some((o) => o.value === added.value)).toBe(false);
  });

  it("disables the remove button at the two-option floor", () => {
    const options: EditableOption[] = [
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ];
    render(<OptionsEditor options={options} onChange={vi.fn()} />);

    expect(
      (screen.getByLabelText("Remove option 1") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows the 'add at least 2 options' hint only below the floor", () => {
    const { rerender } = render(
      <OptionsEditor
        options={[{ value: "option-1", label: "Option 1" }]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/at least 2 options/i)).toBeTruthy();

    rerender(
      <OptionsEditor
        options={[
          { value: "option-1", label: "Option 1" },
          { value: "option-2", label: "Option 2" },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/at least 2 options/i)).toBeNull();
  });

  it("edits a label without touching the value", () => {
    const onChange = vi.fn();
    const options: EditableOption[] = [
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ];
    render(<OptionsEditor options={options} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Option 1 label"), {
      target: { value: "Renamed" },
    });

    const next = onChange.mock.calls.at(-1)![0] as EditableOption[];
    expect(next[0]!.value).toBe("option-1");
    expect(next[0]!.label).toBe("Renamed");
  });
});
