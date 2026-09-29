import { describe, expect, it } from "vitest";
import { areaLabelY, type PlanPiece } from "../layout-plan";

// An area's name must not sit on the tents pitched along its edge (#271).
const plot = { widthM: 40, depthM: 30, north: "top" as const };
const font = 0.9;
const width = 13 * font * 0.6; // "Sleeping area"
const area: PlanPiece = {
  id: "a",
  kind: "sleeping_area",
  x: 22,
  y: 16,
  w: 15,
  h: 10,
};
const tent = (id: string, x: number, y: number): PlanPiece => ({
  id,
  kind: "tent",
  x,
  y,
  w: 3,
  h: 2.5,
});

describe("areaLabelY", () => {
  it("keeps the name along the top when nothing stands there", () => {
    expect(areaLabelY(area, [area, tent("t", 23, 20)], plot, font, width)).toBe(
      16 + font * 0.9,
    );
  });

  it("moves the name to the bottom when tents line the top", () => {
    const pieces = [area, tent("t1", 27, 16.5), tent("t2", 31, 16.5)];
    expect(areaLabelY(area, pieces, plot, font, width)).toBe(26 - font * 0.9);
  });

  it("puts the name just above the area when tents line both edges", () => {
    const pieces = [area, tent("t1", 28, 16.5), tent("t2", 28, 23)];
    expect(areaLabelY(area, pieces, plot, font, width)).toBe(16 - font * 0.8);
  });

  it("ignores a piece the area sits inside", () => {
    const zone: PlanPiece = {
      id: "z",
      kind: "other",
      x: 20,
      y: 14,
      w: 20,
      h: 14,
    };
    const pieces = [zone, area, tent("t1", 28, 16.5)];
    expect(areaLabelY(area, pieces, plot, font, width)).toBe(26 - font * 0.9);
  });

  it("keeps the top when no place is clear", () => {
    const edge: PlanPiece = { ...area, y: 0, h: 30 };
    const pieces = [edge, tent("t1", 28, 0.2), tent("t2", 28, 27.3)];
    expect(areaLabelY(edge, pieces, plot, font, width)).toBe(font * 0.9);
  });
});
