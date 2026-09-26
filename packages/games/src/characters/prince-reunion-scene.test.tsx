// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrinceReunion } from "./prince-reunion-scene";
import {
  beatStart,
  REUNION_CALLS,
  REUNION_DELAY_MS,
  REUNION_MS,
  REUNION_SEEN_KEY,
} from "./prince-reunion";

// A hand-cranked requestAnimationFrame, as Shadow Work's tests: the test says
// when a frame happens, and can see whether the scene asked for another.
let queue: Map<number, FrameRequestCallback>;
let nextId: number;
let clock: number;

function frame(ms = 100) {
  clock += ms;
  const due = [...queue.values()];
  queue.clear();
  act(() => due.forEach((cb) => cb(clock)));
}

/** Run the scene's clock `ms` on, a frame at a time. */
function play(ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) frame(step);
}

function setReducedMotion(on: boolean) {
  (globalThis as { __reducedMotion?: boolean }).__reducedMotion = on;
}

let visibility: DocumentVisibilityState = "visible";
let onScreen = true;

function scene() {
  return document.querySelector<HTMLElement>("[data-reunion]")!;
}
function bubble() {
  return scene().querySelector<HTMLElement>(".font-pixel");
}

/** The scene at a clock (position: relative), as the desktop places it. */
function renderAtClock(props: Parameters<typeof PrinceReunion>[0] = {}) {
  return render(
    <div style={{ position: "relative" }}>
      <PrinceReunion delayMs={0} {...props} />
    </div>,
  );
}

function withCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => ({ fillStyle: "", fillRect: () => {} })) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    () => "data:image/png;base64,AAAA",
  );
}

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  clock = 1000;
  visibility = "visible";
  onScreen = true;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  // jsdom lays nothing out: say the clock is on screen unless a test hides it.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (
    this: Element,
  ) {
    const shown = onScreen && !this.closest("[data-offscreen]");
    return (shown ? [new DOMRect(0, 0, 0, 0)] : []) as never;
  });
  window.sessionStorage.clear();
  setReducedMotion(false);
  withCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setReducedMotion(false);
});

describe("PrinceReunion", () => {
  it("plays once: she walks in, calls him twice, he tackles her, and they sit together", () => {
    renderAtClock();
    // Playing: hidden from assistive tech whole, nothing named.
    expect(scene().getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    frame();
    // Marked as seen the moment it starts, so a reload goes to the ending.
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBe("1");

    play(1000);
    const layers = scene().querySelectorAll<HTMLElement>(
      "span[style*='background-image']",
    );
    const visible = [...layers].filter((l) => l.style.visibility === "visible");
    expect(visible).toHaveLength(1); // Cloud, walking in; no Prince yet
    expect(visible[0]!.style.transform).toMatch(/^translate\(/);

    play(beatStart("call-1") + 100 - 1000);
    expect(bubble()!.textContent).toBe(REUNION_CALLS[0]);
    expect(bubble()!.style.visibility).toBe("visible");
    play(beatStart("look-1") + 100 - (beatStart("call-1") + 100));
    expect(bubble()!.style.visibility).toBe("hidden");
    play(beatStart("call-2") + 100 - (beatStart("look-1") + 100));
    expect(bubble()!.textContent).toBe("Prince, where are you?");
    expect(bubble()!.style.visibility).toBe("visible");
    play(beatStart("sprint") + 100 - (beatStart("call-2") + 100));
    expect(bubble()!.style.visibility).toBe("hidden");

    play(REUNION_MS - beatStart("sprint"));
    // Over: the one picture, named plainly, and the clock has stopped.
    const pair = screen.getByRole("img", { name: "Cloud and Prince" });
    expect(pair).toBeTruthy();
    expect(scene().getAttribute("aria-hidden")).toBeNull();
    expect(scene().dataset.reunion).toBe("together");
    expect(queue.size).toBe(0);
    // A toy for the pointer, never a Tab stop, never named.
    const tap = scene().querySelector("button")!;
    expect(tap.tabIndex).toBe(-1);
    expect(tap.getAttribute("aria-hidden")).toBe("true");
  });

  it("goes straight to the two of them together once the session has seen it", () => {
    window.sessionStorage.setItem(REUNION_SEEN_KEY, "1");
    renderAtClock();
    expect(screen.getByRole("img", { name: "Cloud and Prince" })).toBeTruthy();
    expect(queue.size).toBe(0);
  });

  it("under reduced motion, they are simply there, and it still plays next time", () => {
    setReducedMotion(true);
    renderAtClock();
    expect(screen.getByRole("img", { name: "Cloud and Prince" })).toBeTruthy();
    expect(queue.size).toBe(0);
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBeNull();
  });

  it("does not start in a hidden tab, and holds still when the tab is hidden mid-scene", () => {
    visibility = "hidden";
    renderAtClock();
    expect(queue.size).toBe(0);
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBeNull();

    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(queue.size).toBe(1);
    play(500);
    visibility = "hidden";
    frame();
    expect(queue.size).toBe(0);
    // Back after a long time away: it carries on where it was.
    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    frame(60_000);
    frame(50);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("waits while the clock is covered, or not on screen, and never marks itself seen", () => {
    const view = render(
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={0} covered />
      </div>,
    );
    expect(queue.size).toBe(0);
    view.rerender(
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={0} />
      </div>,
    );
    expect(queue.size).toBe(1);
    view.unmount();

    onScreen = false;
    renderAtClock();
    expect(queue.size).toBe(0);
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBeNull();
  });

  it("covered mid-scene, holds still out of sight, and carries on when uncovered", () => {
    const at = (covered: boolean) => (
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={0} covered={covered} />
      </div>
    );
    const view = render(at(false));
    play(beatStart("call-1") + 100);
    expect(bubble()!.textContent).toBe(REUNION_CALLS[0]);
    expect(scene().classList.contains("opacity-0")).toBe(false);

    // A window maximised over the desktop: no frame runs, and she is not
    // left standing frozen over its corner.
    view.rerender(at(true));
    expect(queue.size).toBe(0);
    expect(scene().classList.contains("opacity-0")).toBe(true);

    view.rerender(at(false));
    expect(scene().classList.contains("opacity-0")).toBe(false);
    expect(queue.size).toBe(1);
    // It carries on from the first call, not from the start.
    frame(50);
    expect(bubble()!.textContent).toBe(REUNION_CALLS[0]);

    // Once they sit together, a cover does not hide them (as the sleeping
    // Prince: he stays on the clock, letting taps through).
    play(REUNION_MS);
    view.rerender(at(true));
    expect(scene().classList.contains("opacity-0")).toBe(false);
    expect(screen.getByRole("img", { name: "Cloud and Prince" })).toBeTruthy();
  });

  it("waits while the desktop is asleep under the boot screen", async () => {
    const view = render(
      <div id="desk" inert>
        <div style={{ position: "relative" }}>
          <PrinceReunion delayMs={0} />
        </div>
      </div>,
    );
    expect(queue.size).toBe(0);
    await act(async () => {
      view.container.querySelector("#desk")!.removeAttribute("inert");
      await Promise.resolve();
    });
    expect(queue.size).toBe(1);
  });

  it("sends a second copy of the clock, mounted mid-scene, straight to the ending", () => {
    renderAtClock();
    frame();
    // The other copy (the phone bar's clock) mounts while this one plays.
    render(
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={0} />
      </div>,
    );
    frame();
    expect(
      screen.getAllByRole("img", { name: "Cloud and Prince" }),
    ).toHaveLength(1);
  });

  it("plays on the copy of the clock on screen; the other, shown later, skips to the ending", () => {
    render(
      <>
        <div
          data-testid="phone"
          data-offscreen
          style={{ position: "relative" }}
        >
          <PrinceReunion delayMs={0} />
        </div>
        <div style={{ position: "relative" }}>
          <PrinceReunion delayMs={0} />
        </div>
      </>,
    );
    frame();
    frame();
    expect(screen.queryByRole("img")).toBeNull();
    // The window narrows to a phone: its bar's clock comes on screen.
    act(() => {
      screen.getByTestId("phone").removeAttribute("data-offscreen");
      window.dispatchEvent(new Event("resize"));
    });
    frame();
    const pair = screen.getByRole("img", { name: "Cloud and Prince" });
    expect(screen.getByTestId("phone").contains(pair)).toBe(true);
  });

  it("purrs when tapped, and lets taps through while covered", () => {
    window.sessionStorage.setItem(REUNION_SEEN_KEY, "1");
    const view = renderAtClock();
    const tap = scene().querySelector("button")!;
    fireEvent.click(tap);
    expect(scene().querySelector(".cat-bubble")!.textContent).toBe("prrr");
    fireEvent.click(tap);
    expect(scene().querySelector(".cat-bubble")!.textContent).toBe("♥");
    view.rerender(
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={0} covered />
      </div>,
    );
    expect(scene().querySelector("button")!.className).toMatch(
      /pointer-events-none/,
    );
  });

  it("draws the pair as squares where there is no canvas", () => {
    vi.restoreAllMocks();
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    renderAtClock();
    const pair = screen.getByRole("img", { name: "Cloud and Prince" });
    expect(pair.querySelectorAll("rect").length).toBeGreaterThan(50);
  });
});

describe("the wait before she walks on", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Her layers, the ones showing. */
  function shown() {
    return [
      ...scene().querySelectorAll<HTMLElement>(
        "span[style*='background-image']",
      ),
    ].filter((l) => l.style.visibility === "visible");
  }

  it("keeps the clock empty for 30 s, no frames at all, then she walks on", () => {
    expect(REUNION_DELAY_MS).toBe(30_000);
    renderAtClock({ delayMs: undefined });
    act(() => vi.advanceTimersByTime(REUNION_DELAY_MS - 1));
    // Nothing on the clock, no frame asked for, not marked seen.
    expect(queue.size).toBe(0);
    expect(shown()).toHaveLength(0);
    expect(screen.queryByRole("img")).toBeNull();
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(queue.size).toBe(1);
    frame();
    // She starts walking, and only now is the session marked.
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBe("1");
    play(1000);
    expect(shown()).toHaveLength(1);
  });

  it("counts only time the clock can be seen: a hidden tab or a cover stops the wait", () => {
    const at = (covered: boolean) => (
      <div style={{ position: "relative" }}>
        <PrinceReunion delayMs={1000} covered={covered} />
      </div>
    );
    const view = render(at(false));
    act(() => vi.advanceTimersByTime(600));

    // Hidden for a minute: the wait stops where it was.
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(queue.size).toBe(0);
    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(300));
    expect(queue.size).toBe(0);

    // Covered for a minute: the same.
    view.rerender(at(true));
    act(() => vi.advanceTimersByTime(60_000));
    expect(queue.size).toBe(0);
    view.rerender(at(false));
    act(() => vi.advanceTimersByTime(99));
    expect(queue.size).toBe(0);
    // 600 + 300 + 100 ms seen: she walks on.
    act(() => vi.advanceTimersByTime(1));
    expect(queue.size).toBe(1);
  });

  it("left during the wait, it is not marked seen, so it plays next time", () => {
    const view = renderAtClock({ delayMs: 5000 });
    act(() => vi.advanceTimersByTime(4000));
    view.unmount();
    expect(window.sessionStorage.getItem(REUNION_SEEN_KEY)).toBeNull();
    renderAtClock({ delayMs: 5000 });
    expect(screen.queryByRole("img")).toBeNull();
  });
});
