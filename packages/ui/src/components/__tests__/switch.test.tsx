import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Switch } from "../switch";

// Proves the harness handles an interactive Radix leaf: the setup-file jsdom
// stubs (pointer capture etc.) let it mount, and RTL fires a real toggle.
describe("Switch", () => {
  it("reflects the checked state on the switch role", () => {
    render(<Switch checked aria-label="Active" onCheckedChange={() => {}} />);
    expect(
      screen.getByRole("switch", { name: "Active" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("fires onCheckedChange when toggled", () => {
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        aria-label="Active"
        onCheckedChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Active" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
