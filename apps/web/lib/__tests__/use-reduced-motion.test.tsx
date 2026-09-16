import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "../use-reduced-motion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  return <p>{useReducedMotion() ? "still" : "moving"}</p>;
}

describe("useReducedMotion", () => {
  it("follows the device setting, and a change to it", () => {
    let matches = false;
    let onChange: () => void = () => {};
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return matches && query.includes("reduce");
      },
      addEventListener: (_: string, fn: () => void) => {
        onChange = fn;
      },
      removeEventListener: () => {},
    }));
    render(<Probe />);
    expect(screen.getByText("moving")).toBeTruthy();
    act(() => {
      matches = true;
      onChange();
    });
    expect(screen.getByText("still")).toBeTruthy();
  });
});
