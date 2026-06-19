// JSDOM doesn't ship a canvas implementation. The Waveform component calls
// `canvas.getContext("2d")` inside an effect — without this stub, every
// test that mounts the wizard logs an "Not implemented" warning. Returning
// null is fine; the component already short-circuits when ctx is falsy.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// JSDOM doesn't implement matchMedia. The Waveform reads it to honour
// prefers-reduced-motion before starting its RAF loop; default to "motion
// allowed" so the animated path is exercised under test.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("no-preference"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never;
}

// JSDOM doesn't implement Element.scrollTo. The AcknowledgementGate resets the
// takeover's scroll position on each new item; stub it to a no-op so mounting
// scrollable overlays doesn't throw under test.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => {}) as never;
}

// JSDOM doesn't implement ResizeObserver. Radix primitives (Switch, Slider)
// measure their control via @radix-ui/react-use-size in a layout effect on
// mount; stub it so mounting them under test doesn't throw.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
}
