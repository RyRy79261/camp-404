import { describe, expect, it } from "vitest";
import { PRINCE_SLEEPING } from "../cats/sprites";
import { HUMAN_W } from "./human-frames";
import {
  beatStart,
  DUST_FRAME_MS,
  REUNION_CALLS,
  REUNION_MS,
} from "./prince-reunion";
import {
  advance,
  initialPhase,
  reunionAt,
  reunionGeometry,
  HEART_AT,
  LEAP_FROM,
  LEAP_TO,
  MAX_STEP_MS,
  RESTING_SHOT,
} from "./prince-reunion-timeline";
import { packAtlas } from "./sprite-atlas";

const GEO = { fromRight: 40, fromLeft: 600 };

/** The shot `ms` into a beat. */
function during(beat: string, ms = 0) {
  return reunionAt(beatStart(beat) + ms, GEO);
}

describe("the reunion's phases", () => {
  it("waits to play the first time, and is simply over after that or under reduced motion", () => {
    expect(initialPhase({ seen: false, reducedMotion: false })).toBe("waiting");
    expect(initialPhase({ seen: true, reducedMotion: false })).toBe("done");
    expect(initialPhase({ seen: false, reducedMotion: true })).toBe("done");
  });

  it("steps its clock by a frame, at most MAX_STEP_MS, never back, never past the end", () => {
    expect(advance(0, 16)).toBe(16);
    // A tab coming back after a minute moves one step, not a minute.
    expect(advance(1000, 60_000)).toBe(1000 + MAX_STEP_MS);
    expect(advance(1000, -50)).toBe(1000);
    expect(advance(1000, Number.NaN)).toBe(1000);
    expect(advance(REUNION_MS - 5, 50)).toBe(REUNION_MS);
  });

  it("measures how far each comes from, off the screen on either side", () => {
    // A 1280 px screen, the clock's middle 40 px from its right edge, at 2x.
    const geo = reunionGeometry(1240, 1280, 2);
    expect(geo.fromRight).toBeGreaterThanOrEqual(20 + HUMAN_W / 2);
    expect(geo.fromLeft).toBeGreaterThan(1240 / 2);
    // An anchor off the screen never gives a negative distance.
    expect(reunionGeometry(-10, 300, 2).fromLeft).toBeGreaterThan(0);
  });
});

describe("the reunion, beat by beat", () => {
  it("walks her in from the right to the clock, stepping through the walk", () => {
    const start = reunionAt(0, GEO);
    expect(start.cloud).toEqual({ pose: "walk", frame: 0, x: GEO.fromRight });
    expect(start.prince).toBeNull();
    const halfway = during("walk-in", 1000);
    expect(halfway.cloud!.x).toBe(GEO.fromRight / 2);
    expect(halfway.cloud!.frame).toBe(Math.floor(1000 / 160) % 4);
    expect(during("settle").cloud).toEqual({ pose: "idle", frame: 0, x: 0 });
  });

  it("calls him four times, one bubble each, and looks about between", () => {
    const words = ["call-1", "call-2", "call-3", "call-4"].map(
      (b) => during(b, 10).bubble,
    );
    expect(words).toEqual([...REUNION_CALLS]);
    expect(during("call-1", 10).cloud).toMatchObject({
      pose: "call",
      frame: 0,
    });
    // The last moments of a call: mouth shut, listening, bubble still up.
    expect(during("call-1", 850).cloud).toMatchObject({ frame: 1 });
    expect(during("call-1", 850).bubble).toBe(REUNION_CALLS[0]);
    expect(during("look-1").cloud).toMatchObject({ pose: "look", frame: 0 });
    expect(during("look-2").cloud).toMatchObject({ pose: "look", frame: 1 });
    for (const quiet of ["walk-in", "settle", "look-1", "pause", "sprint"]) {
      expect(during(quiet, 10).bubble).toBeNull();
    }
  });

  it("sends Prince in from the left, fast, then leaps him at her in an arc", () => {
    const first = during("sprint");
    expect(first.prince).toMatchObject({ pose: "run", x: -GEO.fromLeft });
    expect(during("sprint", 70).prince!.frame).toBe(1);
    const late = during("sprint", 1199);
    expect(late.prince!.x).toBeGreaterThan(-GEO.fromLeft);
    expect(late.prince!.x).toBeLessThanOrEqual(LEAP_FROM + 1);
    const leap = during("leap", 100);
    expect(leap.prince!.pose).toBe("leap");
    expect(leap.prince!.y).toBeGreaterThan(0);
    expect(leap.prince!.x).toBeGreaterThan(LEAP_FROM);
    expect(leap.prince!.x).toBeLessThan(LEAP_TO);
    expect(leap.cloud!.pose).toBe("surprised");
  });

  it("hides them both in the dust, brawling, then clears it", () => {
    const hit = during("dust");
    expect(hit.cloud).toBeNull();
    expect(hit.prince).toBeNull();
    expect(hit.dust).toEqual({ frame: 0, x: 0 });
    const brawl = [1, 2, 3, 4].map(
      (n) => during("dust", n * DUST_FRAME_MS + 1).dust!.frame,
    );
    expect(brawl).toEqual([1, 2, 1, 2]);
    // A wobble: the brawl frames sit a pixel either side.
    expect(during("dust", DUST_FRAME_MS + 1).dust!.x).not.toBe(
      during("dust", 2 * DUST_FRAME_MS + 1).dust!.x,
    );
    expect(during("dust", 1499).dust!.frame).toBe(3);
  });

  it("clears to the two of them together, a heart rising and fading, and stays", () => {
    const first = during("heart");
    expect(first.cloud).toEqual({ pose: "together", frame: 0, x: 0 });
    expect(first.dust).toBeNull();
    expect(first.heart).toEqual({ y: HEART_AT, opacity: 1 });
    const late = during("heart", 1150).heart!;
    expect(late.y).toBeGreaterThan(HEART_AT);
    expect(late.opacity).toBeLessThan(1);
    expect(late.opacity).toBeGreaterThan(0);
    expect(reunionAt(REUNION_MS, GEO)).toBe(RESTING_SHOT);
    expect(reunionAt(REUNION_MS * 10, GEO)).toBe(RESTING_SHOT);
    expect(RESTING_SHOT).toMatchObject({
      done: true,
      cloud: { pose: "together", frame: 1 },
      prince: null,
      dust: null,
      bubble: null,
    });
  });

  it("is never done before the end, and starts at the start for a bad time", () => {
    for (let t = 0; t < REUNION_MS; t += 97) {
      expect(reunionAt(t, GEO).done).toBe(false);
    }
    expect(reunionAt(-5, GEO)).toEqual(reunionAt(0, GEO));
    expect(reunionAt(Number.NaN, GEO)).toEqual(reunionAt(0, GEO));
  });
});

describe("the sprite atlas", () => {
  it("packs sprites in one row with a gap, once each", () => {
    const a = ["KK", "KK"];
    const b = ["KKK"];
    const layout = packAtlas([a, b, a]);
    expect(layout.cells.get(a)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(layout.cells.get(b)).toEqual({ x: 3, y: 0, w: 3, h: 1 });
    expect(layout.width).toBe(6);
    expect(layout.height).toBe(2);
    expect(layout.cells.size).toBe(2);
    expect(packAtlas([])).toMatchObject({ width: 0, height: 0 });
    expect(packAtlas([PRINCE_SLEEPING]).height).toBe(PRINCE_SLEEPING.length);
  });
});
