import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Question } from "@camp404/types";

// "Other…" on a choice field, and the phone keyboard a short text format
// gets. The answer is stored in band as `other:<typed text>`.

vi.mock("next/navigation", () => ({ useParams: () => null }));

import { QuestionField } from "../questionnaire/question";

afterEach(cleanup);

const options = [
  { value: "omni", label: "Everything" },
  { value: "veg", label: "Vegetarian" },
];

describe("QuestionField — Other…", () => {
  it("adds an Other card to a single pick, and a text box once it is picked", () => {
    const question = Question.parse({
      id: "diet",
      kind: "single_select",
      prompt: "Diet",
      options,
      allowOther: true,
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <QuestionField
        question={question}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.queryByLabelText("Your other answer to: Diet")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Other…" }));
    expect(onChange).toHaveBeenLastCalledWith("other:");

    rerender(
      <QuestionField question={question} value="other:" onChange={onChange} />,
    );
    expect(
      screen
        .getByRole("radio", { name: "Other…" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Your other answer to: Diet"), {
      target: { value: "Pescatarian" },
    });
    expect(onChange).toHaveBeenLastCalledWith("other:Pescatarian");
  });

  it("offers no Other card when the field does not allow it", () => {
    render(
      <QuestionField
        question={Question.parse({
          id: "diet",
          kind: "single_select",
          prompt: "Diet",
          options,
        })}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("radio", { name: "Other…" })).toBeNull();
  });

  it("keeps the picked options when Other is ticked on a multi pick", () => {
    const question = Question.parse({
      id: "tags",
      kind: "multi_select",
      prompt: "Tags",
      options,
      allowOther: true,
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <QuestionField question={question} value={["veg"]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Other…" }));
    expect(onChange).toHaveBeenLastCalledWith(["veg", "other:"]);

    rerender(
      <QuestionField
        question={question}
        value={["veg", "other:"]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Your other answer to: Tags"), {
      target: { value: "Halal" },
    });
    expect(onChange).toHaveBeenLastCalledWith(["veg", "other:Halal"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Other…" }));
    expect(onChange).toHaveBeenLastCalledWith(["veg"]);
  });
});

describe("QuestionField — short text formats", () => {
  it("gives a phone format the phone keyboard", () => {
    render(
      <QuestionField
        question={Question.parse({
          id: "cell",
          kind: "short_text",
          prompt: "Cell",
          format: "phone",
        })}
        value=""
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Cell/);
    expect(input.getAttribute("type")).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("tel");
  });
});
