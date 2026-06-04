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
