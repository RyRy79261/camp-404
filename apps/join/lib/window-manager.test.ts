import { describe, expect, it } from "vitest";
import {
  CASCADE_STEP,
  INITIAL_WM,
  MIN_SIZE,
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
    const small = wmReducer(s, {
      type: "resize",
      id: "readme",
      w: 10,
      h: 10,
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
