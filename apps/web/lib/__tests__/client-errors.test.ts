import { afterEach, describe, expect, it } from "vitest";
import {
  clearClientErrors,
  collectDiagnostics,
  installClientErrorCapture,
} from "../client-errors";

// The in-memory error buffer a bug report can attach: capped, path-only, and
// never in the way of the console.

let teardown: () => void = () => {};

afterEach(() => {
  teardown();
  clearClientErrors();
});

describe("client error capture", () => {
  it("keeps console errors, passes them through, and records the path only", () => {
    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => seen.push(args);
    try {
      teardown = installClientErrorCapture();
      window.history.pushState({}, "", "/profile?invite=secret#frag");
      console.error(new TypeError("x is undefined"), "in Roster");

      expect(seen).toHaveLength(1);
      expect(collectDiagnostics().errors).toEqual([
        expect.objectContaining({
          source: "console.error",
          message: "TypeError: x is undefined in Roster",
          route: "/profile",
        }),
      ]);
    } finally {
      teardown();
      teardown = () => {};
      console.error = original;
    }
  });

  it("keeps only the newest ten", () => {
    teardown = installClientErrorCapture();
    for (let i = 1; i <= 12; i++) {
      window.dispatchEvent(new ErrorEvent("error", { message: `error ${i}` }));
    }
    const messages = collectDiagnostics().errors.map((e) => e.message);
    expect(messages).toHaveLength(10);
    expect(messages[0]).toBe("error 3");
    expect(messages.at(-1)).toBe("error 12");
  });

  it("describes the device, never the person", () => {
    const labels = collectDiagnostics().environment.map((f) => f.label);
    expect(labels).toEqual(["Browser", "Language", "Online", "Screen", "Page"]);
  });

  it("restores console.error on teardown", () => {
    const original = console.error;
    const stop = installClientErrorCapture();
    expect(console.error).not.toBe(original);
    stop();
    expect(console.error).toBe(original);
  });
});
