import { describe, expect, it } from "vitest";
import {
  CASCADE_STEP,
  GRAB_MARGIN,
  INITIAL_WM,
  MIN_SIZE,
  resizeRect,
  topWindow,
  wmReducer,
  type WmState,
} from "./window-manager";

const viewport = { width: 1280, height: 800 };
const size = { w: 400, h: 300 };

// A few of Join's programs stand in for any app's keys.
type AppId = "readme" | "map" | "teams" | "terminal";

function open(state: WmState<AppId>, id: AppId) {
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

  it("keeps a wrapped cascade window wholly on screen", () => {
    // Nearly screen-sized windows: the second already runs off the edge,
    // so it wraps, and the wrapped cascade offset must not push it past it.
    const big = { w: 1260, h: 780 };
    let s: WmState<AppId> = INITIAL_WM;
    for (const id of ["readme", "map", "teams", "terminal"] as const) {
      s = wmReducer(s, { type: "open", id, size: big, viewport });
    }
    for (const w of s.windows) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x + w.w).toBeLessThanOrEqual(viewport.width);
      expect(w.y + w.h).toBeLessThanOrEqual(viewport.height);
    }
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

  it("close all starts the stack again from the bottom", () => {
    const s = open(open(INITIAL_WM, "readme"), "map");
    const rebooted = wmReducer(s, { type: "closeAll" });
    expect(rebooted).toEqual(INITIAL_WM);
    expect(open(rebooted, "readme").windows[0]!.z).toBe(1);
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

describe("windows kept by address", () => {
  const meeting = (state: WmState<string>, id: string, url: string) =>
    wmReducer(state, {
      type: "upsertUrl",
      id,
      url,
      size,
      viewport,
      program: "meetings",
    });

  it("opens one window per instance and remembers its address", () => {
    const one = meeting(INITIAL_WM, "/meetings/abc", "/meetings/abc");
    const two = meeting(one, "/meetings/def", "/meetings/def");
    expect(two.windows.map((w) => w.id)).toEqual([
      "/meetings/abc",
      "/meetings/def",
    ]);
    expect(two.windows[0]).toMatchObject({
      program: "meetings",
      lastUrl: "/meetings/abc",
    });
    expect(topWindow(two)?.id).toBe("/meetings/def");
  });

  it("raises an open instance and keeps its newest address", () => {
    const s = meeting(
      meeting(INITIAL_WM, "/meetings/abc", "/meetings/abc"),
      "/meetings/def",
      "/meetings/def",
    );
    const back = meeting(s, "/meetings/abc", "/meetings/abc?tab=notes");
    expect(back.windows).toHaveLength(2);
    expect(topWindow(back)).toMatchObject({
      id: "/meetings/abc",
      lastUrl: "/meetings/abc?tab=notes",
    });
  });

  it("restores a minimised instance on top when its address comes again", () => {
    const s = meeting(
      meeting(INITIAL_WM, "/meetings/abc", "/meetings/abc"),
      "/meetings/def",
      "/meetings/def",
    );
    const min = wmReducer(s, { type: "minimize", id: "/meetings/abc" });
    const back = meeting(min, "/meetings/abc", "/meetings/abc?tab=notes");
    expect(back.windows).toHaveLength(2);
    expect(topWindow(back)).toMatchObject({
      id: "/meetings/abc",
      minimized: false,
      lastUrl: "/meetings/abc?tab=notes",
    });
  });

  it("sets and clears a window's title in memory", () => {
    const s = open(INITIAL_WM, "readme");
    const titled = wmReducer(s, {
      type: "setTitle",
      id: "readme",
      title: "Notes",
    });
    expect(titled.windows[0]?.title).toBe("Notes");
    expect(
      wmReducer(titled, { type: "setTitle", id: "readme", title: "Notes" }),
    ).toBe(titled);
    const cleared = wmReducer(titled, {
      type: "setTitle",
      id: "readme",
      title: undefined,
    });
    expect(cleared.windows[0]).not.toHaveProperty("title");
  });
});

describe("hydrate, reclamp and pruneTo", () => {
  it("hydrate restores the stack without its titles, fitted to the screen", () => {
    const saved: WmState<AppId> = {
      windows: [
        { id: "readme", x: 40, y: 40, w: 400, h: 300, z: 3, title: "Ryan" },
        { id: "map", x: 3000, y: 60, w: 5000, h: 300, z: 7, minimized: true },
      ],
      topZ: 99,
    };
    const s = wmReducer(INITIAL_WM, { type: "hydrate", saved, viewport });
    expect(s.topZ).toBe(7);
    expect(s.windows[0]).not.toHaveProperty("title");
    const map = s.windows[1]!;
    expect(map.minimized).toBe(true);
    expect(map.w).toBeLessThanOrEqual(viewport.width);
    expect(map.x).toBeLessThanOrEqual(viewport.width - GRAB_MARGIN);
    // A window opened after it lands on top.
    expect(open(s, "teams").windows[2]!.z).toBe(8);
  });

  it("reclamp pulls a window back on screen after the screen shrinks", () => {
    const s = wmReducer(open(INITIAL_WM, "readme"), {
      type: "move",
      id: "readme",
      x: 1100,
      y: 700,
      viewport,
    });
    const phone = { width: 390, height: 600 };
    const r = wmReducer(s, { type: "reclamp", viewport: phone });
    const w = r.windows[0]!;
    expect(w.x).toBeLessThanOrEqual(phone.width - GRAB_MARGIN);
    expect(w.y).toBeLessThanOrEqual(phone.height - 32);
    expect(w.w).toBeLessThanOrEqual(phone.width);
    expect(w.w).toBeGreaterThanOrEqual(MIN_SIZE.w);
  });

  it("reclamp leaves the state alone when every window fits", () => {
    const s = open(INITIAL_WM, "readme");
    expect(wmReducer(s, { type: "reclamp", viewport })).toBe(s);
  });

  // "Hands the top down" is derived: topWindow reads the highest z left, so
  // that line holds whenever the filter keeps the right windows. Moving DOM
  // focus to the next window is the shell's job and is tested where pruneTo
  // is wired in (PR C).
  it("pruneTo drops a program the member lost; the next window is on top", () => {
    const s = open(open(open(INITIAL_WM, "readme"), "map"), "teams");
    const pruned = wmReducer(s, {
      type: "pruneTo",
      allowed: ["readme", "map"],
    });
    expect(pruned.windows.map((w) => w.id)).toEqual(["readme", "map"]);
    expect(topWindow(pruned)?.id).toBe("map");
    expect(
      wmReducer(pruned, { type: "pruneTo", allowed: ["readme", "map"] }),
    ).toBe(pruned);
  });

  it("pruneTo drops a window whose child program is gone, by its program id", () => {
    let s: WmState<string> = INITIAL_WM;
    s = wmReducer(s, {
      type: "upsertUrl",
      id: "/captains/roster",
      url: "/captains/roster",
      size,
      viewport,
      program: "captains",
      child: "roster",
    });
    s = wmReducer(s, {
      type: "upsertUrl",
      id: "/captains/system",
      url: "/captains/system",
      size,
      viewport,
      program: "captains",
      child: "system",
    });
    const pruned = wmReducer(s, {
      type: "pruneTo",
      allowed: new Set(["captains", "roster"]),
    });
    expect(pruned.windows.map((w) => w.id)).toEqual(["/captains/roster"]);
    expect(topWindow(pruned)?.id).toBe("/captains/roster");
    expect(
      wmReducer(s, { type: "pruneTo", allowed: ["roster", "system"] }).windows,
    ).toEqual([]);
  });

  it("pruneTo reads the program and child that open recorded", () => {
    const openAs = (
      state: WmState<string>,
      id: string,
      program: string,
      child?: string,
    ) =>
      wmReducer(state, {
        type: "open",
        id,
        size,
        viewport,
        program,
        ...(child !== undefined && { child }),
      });
    const s = openAs(
      openAs(INITIAL_WM, "roster-window", "captains", "roster"),
      "system-window",
      "captains",
      "system",
    );
    expect(s.windows[0]).toMatchObject({
      program: "captains",
      child: "roster",
    });
    const pruned = wmReducer(s, {
      type: "pruneTo",
      allowed: ["captains", "system"],
    });
    expect(pruned.windows.map((w) => w.id)).toEqual(["system-window"]);
  });
});
