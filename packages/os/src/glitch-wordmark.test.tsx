import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlitchWordmark } from "./glitch-wordmark";

describe("GlitchWordmark", () => {
  it("draws its letters from CSS, hidden from readers and from a find in the page", () => {
    const { container } = render(<GlitchWordmark text="404 OS" size="5rem" />);
    const mark = container.querySelector<HTMLElement>("[data-os-wordmark]")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    // No text node anywhere: every layer carries its letters in data-text.
    expect(mark.textContent).toBe("");
    const layers = mark.querySelectorAll("[data-text]");
    expect(layers.length).toBeGreaterThanOrEqual(5);
    for (const layer of layers) {
      expect(layer.getAttribute("data-text")).toBe("404 OS");
    }
    expect(mark.style.getPropertyValue("--glitch-size")).toBe("5rem");
  });
});
