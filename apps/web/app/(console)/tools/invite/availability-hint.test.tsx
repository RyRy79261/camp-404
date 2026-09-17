import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvailabilityHint } from "./availability-hint";

describe("AvailabilityHint", () => {
  it("shows the available copy", () => {
    render(
      <AvailabilityHint
        availability={{ state: "available" }}
        code="neon-toaster-mongoose"
      />,
    );
    expect(screen.getByText(/is available/)).toBeTruthy();
  });

  it("shows the taken copy", () => {
    render(
      <AvailabilityHint
        availability={{ state: "taken" }}
        code="neon-toaster-mongoose"
      />,
    );
    expect(screen.getByText(/already taken/)).toBeTruthy();
  });

  it("shows the invalid hint", () => {
    render(
      <AvailabilityHint
        availability={{ state: "invalid", hint: "3–48 chars." }}
        code="x"
      />,
    );
    expect(screen.getByText("3–48 chars.")).toBeTruthy();
  });

  it("is a polite live region", () => {
    const { container } = render(
      <AvailabilityHint availability={{ state: "available" }} code="x" />,
    );
    const region = container.querySelector('[role="status"]');
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders no hint text when the code is empty", () => {
    render(<AvailabilityHint availability={{ state: "available" }} code="" />);
    expect(screen.queryByText(/available/)).toBeNull();
  });
});
