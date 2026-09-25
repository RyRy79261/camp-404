import { describe, expect, it } from "vitest";
import {
  CASCADE_STEP,
  INITIAL_WM,
  MIN_SIZE,
  resizeRect,
  topWindow,
  wmReducer,
  type AppId,
  type WmState,
} from "./window-manager";

const viewport = { width: 1280, height: 800 };
const size = { w: 400, h: 300 };

function open(state: WmState, id: AppId) {
  return wmReducer(state, { type: "open", id, size, viewport });
}

describe("wmReducer", () => {
  it("opens a window on top and cascades the next one", () => {
    const one = open(INITIAL_WM, "readme");
    const two = open(one, "map");
    const [a, b] = two.windows;
    expect(b!.x - a!.x).toBe(CASCADE_STEP);
    expect(b!.y - a!.y).toBe(CASCADE_STEP);
    expect(topWindow(two)?.id).toBe("map");
  });

  it("raises an open window instead of opening it twice", () => {
    const s = open(open(INITIAL_WM, "readme"), "map");
    const again = open(s, "readme");
    expect(again.windows).toHaveLength(2);
    expect(topWindow(again)?.id).toBe("readme");
  });

  it("closing the top window hands the top to the one below", () => {
    const s = open(open(INITIAL_WM, "readme"), "map");
    const closed = wmReducer(s, { type: "close", id: "map" });
    expect(topWindow(closed)?.id).toBe("readme");
  });

  it("focus leaves the state alone when the window is already on top", () => {
    const s = open(INITIAL_WM, "readme");
    expect(wmReducer(s, { type: "focus", id: "readme" })).toBe(s);
  });

  it("keeps part of a dragged title bar on screen", () => {
    const s = open(INITIAL_WM, "readme");
    const moved = wmReducer(s, {
      type: "move",
      id: "readme",
      x: 5000,
      y: -300,
      viewport,
    });
    const w = moved.windows[0]!;
    expect(w.x).toBeLessThan(viewport.width);
    expect(w.y).toBe(0);
  });

  it("never resizes below the minimum", () => {
    const s = open(INITIAL_WM, "readme");
    const w = s.windows[0]!;
    const small = wmReducer(s, {
      type: "resize",
      id: "readme",
      from: w,
      edge: "se",
      dx: -5000,
      dy: -5000,
      viewport,
    });
    expect(small.windows[0]).toMatchObject(MIN_SIZE);
  });

  it("shrinks a window that is bigger than the screen", () => {
    const s = wmReducer(INITIAL_WM, {
      type: "open",
      id: "readme",
      size: { w: 2000, h: 2000 },
      viewport,
    });
    expect(s.windows[0]!.w).toBeLessThanOrEqual(viewport.width);
    expect(s.windows[0]!.h).toBeLessThanOrEqual(viewport.height);
  });
});

describe("resizeRect", () => {
  const from = { x: 100, y: 100, w: 400, h: 300 };

  it("pulls the right and bottom edges", () => {
    expect(resizeRect(from, "se", 50, 20, viewport)).toEqual({
      x: 100,
      y: 100,
      w: 450,
      h: 320,
    });
  });

  it("pulls the left and top edges, keeping the far edges put", () => {
    expect(resizeRect(from, "nw", -40, -30, viewport)).toEqual({
      x: 60,
      y: 70,
      w: 440,
      h: 330,
    });
  });

  it("stops the left edge at the minimum width", () => {
    const r = resizeRect(from, "w", 5000, 0, viewport);
    expect(r.w).toBe(MIN_SIZE.w);
    expect(r.x + r.w).toBe(from.x + from.w);
  });

  it("never grows past the desktop", () => {
    const r = resizeRect(from, "ne", 5000, -5000, viewport);
    expect(r.x + r.w).toBe(viewport.width);
    expect(r.y).toBe(0);
  });
});

describe("minimise and full screen", () => {
  it("a minimised window is never the top one", () => {
    const s = open(open(INITIAL_WM, "readme"), "map");
    const min = wmReducer(s, { type: "minimize", id: "map" });
    expect(topWindow(min)?.id).toBe("readme");
  });

  it("focus or reopening restores a minimised window on top", () => {
    const s = open(open(INITIAL_WM, "readme"), "map");
    const min = wmReducer(s, { type: "minimize", id: "map" });
    for (const back of [
      wmReducer(min, { type: "focus", id: "map" }),
      open(min, "map"),
    ]) {
      expect(back.windows.find((w) => w.id === "map")?.minimized).toBe(false);
      expect(topWindow(back)?.id).toBe("map");
    }
  });

  it("full screen toggles and keeps the window's own rect", () => {
    const s = open(INITIAL_WM, "readme");
    const max = wmReducer(s, { type: "toggleMaximize", id: "readme" });
    expect(max.windows[0]?.maximized).toBe(true);
    const back = wmReducer(max, { type: "toggleMaximize", id: "readme" });
    expect(back.windows[0]).toMatchObject({
      ...s.windows[0],
      maximized: false,
    });
  });
});
