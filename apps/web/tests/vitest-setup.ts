// JSDOM doesn't ship a canvas implementation. The Waveform component calls
// `canvas.getContext("2d")` inside an effect — without this stub, every
// test that mounts the wizard logs an "Not implemented" warning. Returning
// null is fine; the component already short-circuits when ctx is falsy.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
