import { describe, expect, it } from "vitest";
import { FIRE, glow, stars } from "./campfire";

describe("the link preview's campfire", () => {
  it("draws the fire on rows of one width, in its own letters", () => {
    for (const row of FIRE) {
      expect(row).toHaveLength(FIRE[0]!.length);
      expect(row).toMatch(/^[WYRMBbS.]+$/);
    }
  });

  it("burns hottest in the middle and sits on stones", () => {
    expect(FIRE.slice(0, 8).join("")).not.toContain("W");
    expect(FIRE.slice(8, 14).join("")).toContain("W");
    expect(FIRE.at(-1)).toMatch(/^\.S+\.$/);
  });

  it("lights the ground brightest at the middle, fading to the rim", () => {
    const light = glow(40, 10);
    expect(light).toHaveLength(10);
    for (const row of light) expect(row).toHaveLength(40);
    expect(light[5]![20]).toBe("L");
    expect(light[0]![0]).toBe(".");
    const row = light[5]!;
    // Out to the right: the bright band ends before the dim one starts.
    expect(row.indexOf("g", 20)).toBeGreaterThan(row.lastIndexOf("L"));
  });

  it("puts the same stars in the same places every build", () => {
    const sky = stars(100, 40, 30);
    expect(sky).toHaveLength(30);
    expect(stars(100, 40, 30)).toEqual(sky);
    for (const s of sky) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeLessThan(40);
    }
  });
});
