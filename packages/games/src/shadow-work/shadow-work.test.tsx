// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShadowWork } from "./shadow-work";
import { BODY_H, CH, FLOOR, ON_STAND, SLEEP_H } from "./physics";
import { forgetDrawnSprites, spriteDataUrl } from "./sprite-image";
import { SHADOW_WORK_BALL, SHADOW_WORK_COLOURS } from "./art";

// A hand-cranked requestAnimationFrame: the test says when a frame happens,
// and can see whether the strip asked for another.
let queue: Map<number, FrameRequestCallback>;
let nextId: number;
let clock: number;

function frame(ms = 1000 / 60) {
  clock += ms;
  const due = [...queue.values()];
  queue.clear();
  act(() => due.forEach((cb) => cb(clock)));
}

/** Frames until the strip stops asking for them; how many, or -1. */
function framesUntilIdle(max = 60 * 60): number {
  for (let i = 1; i <= max; i++) {
    frame();
    if (queue.size === 0) return i;
  }
  return -1;
}

function setReducedMotion(on: boolean) {
  (globalThis as { __reducedMotion?: boolean }).__reducedMotion = on;
}

function ball() {
  return document.querySelector<HTMLElement>("[data-shadow-work-piece]")!;
}
function jinn() {
  return document.querySelector<HTMLElement>('[data-cat="jinn"]')!;
}
/** The y a transform puts an element at. */
function yOf(el: HTMLElement): number {
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(el.style.transform);
  if (!m) throw new Error(`no translate in "${el.style.transform}"`);
  return Number(m[2]);
}
function xOf(el: HTMLElement): number {
  const m = /translate\(([-\d.e]+)px/.exec(el.style.transform);
  return Number(m![1]);
}

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  clock = 1000;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setReducedMotion(false);
});

describe("ShadowWork", () => {
  it("is an easter egg: hidden from assistive tech whole, Jinn no Tab stop, nothing labelled", () => {
    const { container } = render(<ShadowWork />);
    const strip = container.querySelector<HTMLElement>("[data-shadow-work]")!;
    expect(strip.getAttribute("aria-hidden")).toBe("true");
    expect(jinn().tabIndex).toBe(-1);
    expect(container.querySelector("[aria-label]")).toBeNull();
    expect(container.querySelector("[role]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts with Jinn asleep on top, and its loop stops at rest", () => {
    render(<ShadowWork />);
    expect(jinn().style.height).toBe(`${SLEEP_H}px`);
    expect(queue.size).toBe(1);
    frame();
    expect(queue.size).toBe(0);
    // Nothing asks for frames while nothing moves.
    frame();
    frame();
    expect(queue.size).toBe(0);
    // And the ball sits on its stand.
    expect(yOf(ball())).toBe(FLOOR - ON_STAND - BODY_H);
  });

  it("wakes on a grab, and sleeps again once Jinn is back on top", () => {
    render(<ShadowWork />);
    frame();
    expect(queue.size).toBe(0);
    fireEvent.pointerDown(ball(), {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 100,
    });
    expect(queue.size).toBe(1);
    frame();
    // Awake and dropping off.
    expect(jinn().style.height).toBe(`${CH}px`);
    fireEvent.pointerUp(ball(), { pointerId: 1 });
    expect(framesUntilIdle()).toBeGreaterThan(0);
    expect(jinn().style.height).toBe(`${SLEEP_H}px`);
  });

  it("wakes when the window is dragged, not when the pointer just moves", () => {
    const { container } = render(<ShadowWork />);
    frame();
    const strip = container.firstElementChild as HTMLElement;
    let left = 0;
    strip.getBoundingClientRect = () =>
      ({ left, top: 0, width: 480, height: 180 }) as DOMRect;
    frame(); // (nothing queued: a no-op)
    // The strip moved, but no button is down: a hover, not a drag.
    left = 30;
    fireEvent.pointerMove(document, { buttons: 0 });
    expect(queue.size).toBe(0);
    fireEvent.pointerMove(document, { buttons: 1 });
    expect(queue.size).toBe(1);
  });

  it("holds still under reduced motion: no loop, Jinn sits and watches", () => {
    setReducedMotion(true);
    render(<ShadowWork />);
    expect(queue.size).toBe(0);
    // Sitting on the floor, not asleep on top.
    expect(jinn().style.height).toBe(`${CH}px`);
    expect(screen.queryByText("z")).toBeNull();

    const x0 = xOf(ball());
    fireEvent.pointerDown(ball(), {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(ball(), { pointerId: 1, clientX: 250, clientY: 40 });
    // Moved with the pointer, straight away, with no frames.
    expect(xOf(ball())).toBe(x0 - 50);
    expect(yOf(ball())).toBeLessThan(FLOOR - ON_STAND - BODY_H);
    fireEvent.pointerUp(ball(), { pointerId: 1 });
    // Set straight down on its stand.
    expect(yOf(ball())).toBe(FLOOR - ON_STAND - BODY_H);
    expect(queue.size).toBe(0);
  });

  it("calls onWake when Jinn is tapped three times", () => {
    const onWake = vi.fn();
    render(<ShadowWork onWake={onWake} />);
    fireEvent.click(jinn());
    expect(screen.getByText("mrrp?")).toBeTruthy();
    fireEvent.click(jinn());
    expect(onWake).not.toHaveBeenCalled();
    fireEvent.click(jinn());
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("names nothing on screen: no text but the cat's", () => {
    const { container } = render(<ShadowWork />);
    expect(container.textContent).toBe("z");
  });
});

describe("Drawing the ball", () => {
  afterEach(() => forgetDrawnSprites());

  it("draws each sprite once, however often it is asked for", () => {
    forgetDrawnSprites();
    const fillRect = vi.fn();
    const getContext = vi.fn(() => ({ fillStyle: "", fillRect }));
    const toDataURL = vi.fn(() => "data:image/png;base64,AAAA");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      getContext as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      toDataURL,
    );
    const a = spriteDataUrl(SHADOW_WORK_BALL, SHADOW_WORK_COLOURS);
    const b = spriteDataUrl(SHADOW_WORK_BALL, SHADOW_WORK_COLOURS);
    expect(a).toBe("data:image/png;base64,AAAA");
    expect(b).toBe(a);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(fillRect.mock.calls.length).toBeGreaterThan(1000);

    // Shown as that one image, turned inside its SVG.
    render(<ShadowWork />);
    const img = ball().querySelector("image");
    expect(img?.getAttribute("href")).toBe(a);
    expect(ball().querySelectorAll("rect")).toHaveLength(0);
    expect(img!.parentElement!.getAttribute("transform")).toMatch(/^rotate\(/);
    vi.restoreAllMocks();
  });

  it("falls back to squares where there is no canvas", () => {
    forgetDrawnSprites();
    render(<ShadowWork />);
    expect(ball().querySelector("image")).toBeNull();
    expect(ball().querySelectorAll("rect").length).toBeGreaterThan(100);
  });
});
