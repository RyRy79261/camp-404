import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount any rendered tree between tests so they stay isolated.
afterEach(() => {
  cleanup();
});

// jsdom does not implement the scroll and pointer-capture calls Radix Select
// makes, or matchMedia. Stub them so a component can mount under test.
// Mirrors packages/ui's harness.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never;
}

if (typeof globalThis !== "undefined" && !("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
}

if (typeof Element !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (() => {}) as never;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (() => false) as never;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = (() => {}) as never;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = (() => {}) as never;
  }
}
