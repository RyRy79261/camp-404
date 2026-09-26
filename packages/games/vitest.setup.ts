import { afterEach } from "vitest";

// Only the rendered tests (jsdom) need any of this.
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());

  // jsdom has no matchMedia: answer "no reduced motion" unless a test says
  // otherwise through `setReducedMotion`.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches:
        query.includes("prefers-reduced-motion") &&
        (globalThis as { __reducedMotion?: boolean }).__reducedMotion === true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
  }

  // jsdom has no canvas: say so quietly (null), as a browser without one
  // would, instead of logging "not implemented" on every call.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
}
