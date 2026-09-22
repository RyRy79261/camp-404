import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PasswordInput } from "../password-input";
import { PASSWORD_MIN_LENGTH, passwordStrength } from "../../lib/form-logic";

/** The field, by its stable label rather than a role — a password input has
 *  no accessible role, so `getByRole("textbox")` finds it only once revealed. */
function field(): HTMLInputElement {
  return document.getElementById("pw") as HTMLInputElement;
}

describe("PasswordInput", () => {
  it("flips the field type and the toggle's accessible name", () => {
    render(<PasswordInput id="pw" defaultValue="a sentence I remember" />);
    expect(field().type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field().type).toBe("text");
    expect(
      screen
        .getByRole("button", { name: "Hide password" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field().type).toBe("password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("keeps the field's value and focus across a toggle", () => {
    render(<PasswordInput id="pw" defaultValue="a sentence I remember" />);
    const before = field();
    before.focus();
    expect(document.activeElement).toBe(before);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    // Node identity is the property under test, and it is the only thing that
    // preserves value AND focus: changing `type` on the SAME element keeps
    // both, while a remount would blank the uncontrolled value and drop focus
    // to `document.body`. Asserting `activeElement === input` on its own would
    // pass for the wrong reason — jsdom's click does not move focus to the
    // button the way a browser does, so it would be green even after a
    // remount... which is exactly what `not.toBe(document.body)` catches.
    expect(field()).toBe(before);
    expect(field().value).toBe("a sentence I remember");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps a controlled value across a toggle, and reports each change once", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PasswordInput id="pw" value="held" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field().value).toBe("held");

    fireEvent.change(field(), { target: { value: "held longer" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<PasswordInput id="pw" value="held longer" onChange={onChange} />);
    expect(field().value).toBe("held longer");
  });

  it("leaves the toggle in the tab order", () => {
    // AfrikaBurn's regression: a tabIndex={-1} here takes the only way to
    // reveal a password away from the people the toggle exists for.
    render(<PasswordInput id="pw" />);
    expect(screen.getByRole("button", { name: "Show password" }).tabIndex).toBe(
      0,
    );
  });

  it("says how short a short password is, and stops saying it once it is long enough", () => {
    const { rerender } = render(<PasswordInput id="pw" value="hunter2" />);
    expect(
      screen.getByText(
        `Too short — use at least ${PASSWORD_MIN_LENGTH} characters`,
      ),
    ).toBeTruthy();

    rerender(<PasswordInput id="pw" value={"x".repeat(PASSWORD_MIN_LENGTH)} />);
    expect(screen.queryByText(/use at least/)).toBeNull();
    expect(screen.getByText("Fair")).toBeTruthy();
  });

  it("never points at a meter that is not on the page", () => {
    // The empty-field case: the meter is ENABLED but renders nothing, so a
    // describedby here would name an id no element carries.
    const { rerender } = render(<PasswordInput id="pw" value="" />);
    expect(document.getElementById("pw-strength")).toBeNull();
    expect(field().getAttribute("aria-describedby")).toBeNull();

    rerender(<PasswordInput id="pw" value="hunter2" />);
    const describedBy = field().getAttribute("aria-describedby");
    expect(describedBy).toBe("pw-strength");
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it("describes the meter even when the caller gives the field no id", () => {
    // Not every caller labels its field with an `id` — and the meter renders
    // for all of them. Without an id of its own it was a paragraph no screen
    // reader was ever pointed at.
    const { container } = render(<PasswordInput value="hunter2" />);
    const input = container.querySelector("input")!;
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(describedBy).toBeTruthy();
    const meter = document.getElementById(describedBy);
    expect(meter).not.toBeNull();
    expect(meter!.textContent).toContain("Too short");
  });

  it("keeps the caller's own description alongside the meter's", () => {
    const { rerender } = render(
      <>
        <p id="pw-hint">Use a sentence you will remember.</p>
        <PasswordInput id="pw" value="" aria-describedby="pw-hint" />
      </>,
    );
    // No meter yet, so the caller's hint is the whole of it.
    expect(field().getAttribute("aria-describedby")).toBe("pw-hint");

    rerender(
      <>
        <p id="pw-hint">Use a sentence you will remember.</p>
        <PasswordInput id="pw" value="hunter2" aria-describedby="pw-hint" />
      </>,
    );
    const ids = field().getAttribute("aria-describedby")!.split(" ");
    expect(ids).toEqual(["pw-hint", "pw-strength"]);
    // Both references have to resolve, or the merge is decorative.
    for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
  });

  it("forwards minLength to the input, and adds none when the caller passes none", () => {
    // Two attributes that read the same at the call site must behave the same:
    // `required` reaches the input, so `minLength` has to as well, or a caller
    // relying on the browser's own check silently gets no check at all.
    const { rerender } = render(<PasswordInput id="pw" minLength={12} />);
    expect(field().getAttribute("minlength")).toBe("12");

    rerender(<PasswordInput id="pw" />);
    expect(field().hasAttribute("minlength")).toBe(false);
  });

  it("words the meter with the caller's minimum, not the default", () => {
    render(<PasswordInput id="pw" value={"x".repeat(10)} minLength={12} />);
    expect(
      screen.getByText("Too short — use at least 12 characters"),
    ).toBeTruthy();
  });

  it("shows no meter when the field is empty or hideStrength is set", () => {
    const { rerender } = render(<PasswordInput id="pw" value="" />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    rerender(<PasswordInput id="pw" value="hunter2" hideStrength />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/use at least/)).toBeNull();
    // …and the field no longer points at a meter that is not on the page.
    expect(field().getAttribute("aria-describedby")).toBeNull();
  });
});

describe("passwordStrength", () => {
  it("scores on length alone, across every bucket", () => {
    expect(passwordStrength("")).toMatchObject({ score: 0, label: "" });
    expect(passwordStrength("short")).toMatchObject({
      score: 1,
      label: "Too short",
      meetsMin: false,
    });
    expect(passwordStrength("x".repeat(15))).toMatchObject({
      score: 2,
      label: "Fair",
      meetsMin: true,
    });
    expect(passwordStrength("x".repeat(20))).toMatchObject({
      score: 3,
      label: "Good",
    });
    expect(passwordStrength("x".repeat(30))).toMatchObject({
      score: 4,
      label: "Strong",
      percent: 94,
    });
  });

  it("honours a caller's minimum", () => {
    expect(passwordStrength("x".repeat(10), 8).meetsMin).toBe(true);
    expect(passwordStrength("x".repeat(10), 12).meetsMin).toBe(false);
  });

  it("caps the bar at 100 rather than running past it", () => {
    expect(passwordStrength("x".repeat(400)).percent).toBe(100);
  });
});
