import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProgressBar } from "../progress-bar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("fills with a transform, clamped, and reports the value", () => {
    render(<ProgressBar value={3} max={4} label="Onboarding progress" />);
    const bar = screen.getByRole("progressbar", {
      name: "Onboarding progress",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.75)");
    expect(fill.className).toContain("origin-left");
  });

  it("never fills past full", () => {
    render(<ProgressBar value={9} max={4} />);
    const fill = screen.getByRole("progressbar")
      .firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(1)");
  });
});
