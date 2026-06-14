import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Badge } from "../badge";

// Seeds the jsdom/RTL harness with a static leaf: render, CVA variant, and
// className-merge + attribute forwarding.
describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>Captain</Badge>);
    expect(screen.getByText("Captain")).toBeTruthy();
  });

  it("applies the variant token class", () => {
    render(<Badge variant="success">Approved</Badge>);
    expect(screen.getByText("Approved").className).toContain("text-success");
  });

  it("merges className and forwards span attributes", () => {
    render(
      <Badge className="custom" data-testid="badge">
        X
      </Badge>,
    );
    const el = screen.getByTestId("badge");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("custom"); // caller class merged in
    expect(el.className).toContain("rounded-full"); // base classes preserved
  });
});
