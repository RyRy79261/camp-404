import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  clampCrop,
  cropToViewPercent,
  initialCrop,
  panBy,
  toSourceRect,
  zoomOf,
  zoomTo,
  type ImageSize,
  type SquareCrop,
} from "../photo-crop";

// A landscape photo, 600×400: zoom 1 is a 400 px square.
const wide: ImageSize = { width: 600, height: 400 };
const tall: ImageSize = { width: 300, height: 900 };

/** The circle shows no gap when its square lies wholly on the photo. */
function inside(crop: SquareCrop, image: ImageSize) {
  expect(crop.x).toBeGreaterThanOrEqual(0);
  expect(crop.y).toBeGreaterThanOrEqual(0);
  expect(crop.x + crop.size).toBeLessThanOrEqual(image.width + 1e-9);
  expect(crop.y + crop.size).toBeLessThanOrEqual(image.height + 1e-9);
}

describe("initialCrop", () => {
  it("opens on the middle square at zoom 1", () => {
    expect(initialCrop(wide)).toEqual({ x: 100, y: 0, size: 400 });
    expect(initialCrop(tall)).toEqual({ x: 0, y: 300, size: 300 });
    expect(zoomOf(initialCrop(wide), wide)).toBe(1);
  });
});

describe("clampCrop: the circle never shows a gap", () => {
  it("pulls a square that ran off any edge back onto the photo", () => {
    expect(clampCrop({ x: -50, y: -20, size: 200 }, wide)).toEqual({
      x: 0,
      y: 0,
      size: 200,
    });
    expect(clampCrop({ x: 550, y: 390, size: 200 }, wide)).toEqual({
      x: 400,
      y: 200,
      size: 200,
    });
  });

  it("keeps a square that already fits as it is", () => {
    const fits = { x: 123, y: 45, size: 250 };
    expect(clampCrop(fits, wide)).toEqual(fits);
  });

  it("never lets the square grow past the short side (zoom below 1)", () => {
    const c = clampCrop({ x: 0, y: 0, size: 1000 }, wide);
    expect(c.size).toBe(400);
    inside(c, wide);
  });

  it("never lets the square shrink past MAX_ZOOM", () => {
    const c = clampCrop({ x: 10, y: 10, size: 1 }, wide);
    expect(c.size).toBeCloseTo(400 / MAX_ZOOM);
  });
});

describe("panBy", () => {
  it("moves the photo with the finger: right drag shows more of the left", () => {
    // A 400 px square in a 200 px frame: one screen pixel is two source pixels.
    const start = { x: 100, y: 0, size: 400 };
    expect(panBy(start, 30, 0, 200, wide)).toEqual({ x: 40, y: 0, size: 400 });
    expect(panBy(start, -30, 0, 200, wide)).toEqual({
      x: 160,
      y: 0,
      size: 400,
    });
  });

  it("stops at the edge however far the photo is dragged", () => {
    const start = initialCrop(wide);
    for (const [dx, dy] of [
      [5000, 0],
      [-5000, 0],
      [0, 5000],
      [0, -5000],
      [-999, 999],
    ] as const) {
      inside(panBy(start, dx, dy, 320, wide), wide);
    }
    expect(panBy(start, 5000, 0, 320, wide).x).toBe(0);
    expect(panBy(start, -5000, 0, 320, wide).x).toBe(200);
  });

  it("does nothing while the frame has no size yet", () => {
    const start = initialCrop(wide);
    expect(panBy(start, 50, 50, 0, wide)).toEqual(start);
  });
});

describe("zoomTo", () => {
  it("zooms about the middle of the circle", () => {
    const c = zoomTo(initialCrop(wide), 2, wide);
    expect(c).toEqual({ x: 200, y: 100, size: 200 });
    expect(zoomOf(c, wide)).toBe(2);
  });

  it("holds zoom between 1 and MAX_ZOOM", () => {
    const start = initialCrop(wide);
    expect(zoomOf(zoomTo(start, 99, wide), wide)).toBeCloseTo(MAX_ZOOM);
    expect(zoomOf(zoomTo(start, 0.1, wide), wide)).toBe(1);
  });

  it("zooming out from a corner keeps the square on the photo", () => {
    const corner = clampCrop({ x: 9999, y: 9999, size: 400 / 3 }, wide);
    const out = zoomTo(corner, 1, wide);
    inside(out, wide);
    expect(out.size).toBe(400);
  });
});

describe("cropToViewPercent: the view of the crop", () => {
  it("places the photo so the crop fills the square view", () => {
    expect(cropToViewPercent({ x: 100, y: 0, size: 400 }, wide)).toEqual({
      left: -25,
      top: -0,
      width: 150,
      height: 100,
    });
    expect(cropToViewPercent({ x: 200, y: 100, size: 200 }, wide)).toEqual({
      left: -100,
      top: -50,
      width: 300,
      height: 200,
    });
  });
});

describe("toSourceRect: the pixels that are cut", () => {
  it("maps what the frame shows to whole source pixels", () => {
    // Drag the photo 32 px right in a 320 px frame at zoom 2 (200 px square).
    const moved = panBy(zoomTo(initialCrop(wide), 2, wide), 32, 0, 320, wide);
    expect(toSourceRect(moved, wide)).toEqual({ x: 180, y: 100, size: 200 });
  });

  it("cuts the middle square when there is no crop", () => {
    expect(toSourceRect(undefined, tall)).toEqual({ x: 0, y: 300, size: 300 });
  });

  it("pulls a stale crop (from a bigger photo) back inside", () => {
    const r = toSourceRect({ x: 800, y: 800, size: 600 }, wide);
    expect(r).toEqual({ x: 200, y: 0, size: 400 });
  });
});
