import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount any rendered tree between tests so they stay isolated.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these APIs that the Radix-based leaf components reach
// for (matchMedia for responsive/reduced-motion, ResizeObserver for
// poppers/sliders, scroll + pointer-capture for Select/Popover/Dialog). Stub
// them so a component can mount under test without throwing. Mirrors the web
// app's harness; extend here as more components are covered.
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
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = (() => {}) as never;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (() => {}) as never;
  }
  // Radix Select/Popover probe pointer capture, which jsdom doesn't implement.
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
