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
