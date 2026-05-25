import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("joins multiple class strings", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("resolves conflicting tailwind utilities by keeping the later one (the whole point of using tailwind-merge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("drops falsy entries from conditional class arrays", () => {
    const isActive = false;
    expect(cn("base", isActive && "bg-accent", null, undefined, "")).toBe(
      "base",
    );
  });

  it("flattens nested arrays and objects (clsx semantics)", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});
