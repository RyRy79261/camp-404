import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DictatePill } from "@camp404/ui/components/dictate-pill";

afterEach(cleanup);

describe("DictatePill", () => {
  it("renders the default label and a mic icon, and is a pill <button>", () => {
    const { container } = render(<DictatePill onActivate={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Dictate instead" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toContain("rounded-full");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("fires onActivate on click", () => {
    const onActivate = vi.fn();
    render(<DictatePill onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate instead" }));
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("renders a custom label", () => {
    render(<DictatePill onActivate={vi.fn()} label="Start dictating" />);
    expect(screen.getByRole("button", { name: "Start dictating" })).toBeDefined();
  });

  it("falls back to the default name when given an empty/whitespace label", () => {
    render(<DictatePill onActivate={vi.fn()} label="   " />);
    // Never renders a nameless button — the label is its accessible name.
    expect(screen.getByRole("button", { name: "Dictate instead" })).toBeDefined();
  });

  it("merges a custom className onto the button (host layout relies on this)", () => {
    render(<DictatePill onActivate={vi.fn()} className="self-end" />);
    expect(
      screen.getByRole("button", { name: "Dictate instead" }).className,
    ).toContain("self-end");
  });

  it("does not fire onActivate when disabled (native disabled attr)", () => {
    const onActivate = vi.fn();
    render(<DictatePill onActivate={onActivate} disabled />);
    const btn = screen.getByRole("button", { name: "Dictate instead" });
    expect(btn).toHaveProperty("disabled", true);
    fireEvent.click(btn);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
