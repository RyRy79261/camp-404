import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesktopIcon } from "./desktop-icon";

const glyph = (className: string) => <svg className={className} />;

describe("DesktopIcon hint", () => {
  it("glows and says the hint in its name", () => {
    render(
      <DesktopIcon
        id="readme"
        label="README.TXT"
        icon={glyph}
        open={false}
        onOpen={() => {}}
        hint="start here"
      />,
    );
    const button = screen.getByRole("button", {
      name: "Open README.TXT, start here",
    });
    expect(button).toHaveProperty(
      "className",
      expect.stringContaining("os-icon-hint"),
    );
    expect(button.hasAttribute("data-hint")).toBe(true);
  });

  it("is a plain icon without one", () => {
    render(
      <DesktopIcon
        id="readme"
        label="README.TXT"
        icon={glyph}
        open={false}
        onOpen={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Open README.TXT" });
    expect(button.className).not.toContain("os-icon-hint");
    expect(button.hasAttribute("data-hint")).toBe(false);
  });
});
