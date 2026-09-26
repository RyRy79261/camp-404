import { describe, expect, it } from "vitest";
import {
  BODY_H,
  CEILING,
  CW,
  LW,
  NO_SHAKE,
  ON_STAND,
  catPose,
  catTop,
  createShakeTracker,
  createWorld,
  fitWorld,
  grabPiece,
  holdPieceAt,
  isResting,
  layout,
  pushTrail,
  readShake,
  releasePiece,
  sitBeside,
  step,
  throwVelocity,
  type CatMode,
  type TrailPoint,
  type World,
} from "./physics";

const W = 480;

function run(w: World, steps: number, width = W) {
  for (let i = 0; i < steps; i++) step(w, width);
  return w;
}

/** Steps until at rest; the steps it took, or -1 if it never settled. */
function settle(w: World, max = 60 * 60, width = W): number {
  for (let i = 1; i <= max; i++) {
    step(w, width);
    if (isResting(w)) return i;
  }
  return -1;
}

/** Jinn awake on the floor, just left of the piece, which sits still. */
function awakeBeside(): World {
  const w = createWorld(W, 300);
  w.cat.mode = "chase";
  w.cat.h = 0;
  w.cat.x = w.piece.x - CW + 10;
  return w;
}

describe("Shadow Work at rest", () => {
  it("starts on its stand with Jinn asleep on top, at rest", () => {
    const w = createWorld();
    expect(w.piece.h).toBe(ON_STAND);
    expect(w.cat.mode).toBe("sleep");
    expect(w.cat.h).toBe(catTop(w.piece));
    expect(isResting(w)).toBe(true);
  });

  it("stays at rest, untouched, step after step (the loop may stop)", () => {
    const w = createWorld();
    const before = JSON.stringify({ c: w.cat, p: w.piece });
    run(w, 600);
    expect(isResting(w)).toBe(true);
    expect(JSON.stringify({ c: w.cat, p: w.piece })).toBe(before);
  });

  it("is not at rest while held, moving, or with Jinn awake", () => {
    const held = createWorld();
    grabPiece(held);
    expect(isResting(held)).toBe(false);

    const rolling = createWorld();
    rolling.piece.vx = 2;
    expect(isResting(rolling)).toBe(false);

    const awake = createWorld();
    awake.cat.mode = "chase";
    expect(isResting(awake)).toBe(false);
  });

  it("is not at rest in mid-air, even at the top of an arc", () => {
    const w = createWorld();
    w.piece.h = ON_STAND + 40;
    w.piece.vy = 0;
    expect(isResting(w)).toBe(false);
  });
});

describe("Throwing it", () => {
  it("keeps the pointer's speed when let go", () => {
    const w = createWorld();
    grabPiece(w);
    step(w, W); // Jinn wakes and drops off
    holdPieceAt(w, 100, 60, W);
    releasePiece(w, { vx: 10, vy: 6 }, false);
    step(w, W);
    expect(w.piece.x).toBeCloseTo(110, 5);
    expect(w.piece.h).toBeCloseTo(60 + 6 - 0.5, 5);
    // In the air it barely slows.
    expect(w.piece.vx).toBeGreaterThan(9.9);
  });

  it("flies in an arc: up, over, and down onto its stand", () => {
    const w = createWorld();
    grabPiece(w);
    holdPieceAt(w, 20, ON_STAND, W);
    releasePiece(w, { vx: 4, vy: 10 }, false);
    let peak = 0;
    let peakAt = 0;
    let landed = 0;
    for (let i = 1; i <= 120 && !landed; i++) {
      step(w, W);
      if (w.piece.h > peak) {
        peak = w.piece.h;
        peakAt = i;
      }
      if (w.piece.h === ON_STAND) landed = i;
    }
    // Gravity 0.5 a step from 10 up: about 95px higher, 20 steps up and
    // 20 down, drifting 4px a step all the way.
    expect(peak - ON_STAND).toBeGreaterThan(90);
    expect(peak - ON_STAND).toBeLessThan(100);
    expect(peakAt).toBeGreaterThanOrEqual(19);
    expect(peakAt).toBeLessThanOrEqual(21);
    expect(landed).toBeGreaterThanOrEqual(39);
    expect(landed).toBeLessThanOrEqual(42);
    expect(w.piece.x).toBeGreaterThan(20 + 3.5 * landed);
    expect(w.piece.x).toBeLessThanOrEqual(20 + 4 * landed);
  });

  it("loses energy at every bounce", () => {
    const w = createWorld();
    grabPiece(w);
    holdPieceAt(w, 200, CEILING, W);
    releasePiece(w, { vx: 0, vy: 0 }, false);
    // The heights it reaches between floor touches.
    const peaks: number[] = [];
    let top = w.piece.h;
    let rising = false;
    for (let i = 0; i < 600; i++) {
      const vy0 = w.piece.vy;
      step(w, W);
      if (vy0 <= 0 && w.piece.vy > 0) rising = true; // bounced
      if (rising && vy0 > 0 && w.piece.vy <= 0) {
        peaks.push(w.piece.h);
        rising = false;
      }
      top = Math.max(top, w.piece.h);
    }
    expect(top).toBe(CEILING);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    }
    expect(peaks[0]!).toBeLessThan(CEILING);
    expect(w.piece.h).toBe(ON_STAND);
    expect(w.piece.vy).toBe(0);
  });

  it("bounces off a wall, slower", () => {
    const w = createWorld();
    grabPiece(w);
    holdPieceAt(w, W - LW - 2, ON_STAND, W);
    releasePiece(w, { vx: 10, vy: 0 }, false);
    step(w, W);
    expect(w.piece.x).toBe(W - LW);
    expect(w.piece.vx).toBeLessThan(0);
    expect(Math.abs(w.piece.vx)).toBeLessThan(10);
  });

  it("measures the throw from the last moments of the drag", () => {
    const trail: TrailPoint[] = [];
    for (let t = 0; t <= 200; t += 10) pushTrail(trail, { t, x: t, h: 8 });
    // Only the last ~90 ms are kept.
    expect(trail[0]!.t).toBeGreaterThanOrEqual(110);
    const v = throwVelocity(trail, 205);
    expect(v.vx).toBeCloseTo(1000 / 60, 3); // 1px/ms, per 60th of a second
    expect(v.vy).toBe(0);
    // Capped.
    const fast = [
      { t: 0, x: 0, h: 0 },
      { t: 10, x: 500, h: -500 },
    ];
    expect(throwVelocity(fast, 12)).toEqual({ vx: 22, vy: -22 });
    // Held still before letting go: it just drops.
    expect(throwVelocity(trail, 400)).toEqual({ vx: 0, vy: 0 });
    // A tap is not a throw.
    expect(throwVelocity([{ t: 0, x: 0, h: 0 }], 1)).toEqual({ vx: 0, vy: 0 });
  });
});

describe("Rolling", () => {
  it("turns as it rolls and keeps its angle when it stops", () => {
    const w = createWorld();
    w.cat.mode = "chase"; // awake, so nothing else settles it
    w.cat.h = 0;
    w.cat.x = 0;
    w.piece.x = 150;
    w.piece.vx = 6;
    run(w, 20);
    expect(Math.abs(w.piece.rot)).toBeGreaterThan(10);
    run(w, 400);
    // Whatever Jinn has done since, check a stopped ball holds its angle.
    const ball = createWorld();
    ball.piece.vx = 5;
    let i = 0;
    while (ball.piece.vx !== 0 && i++ < 1000) step(ball, W);
    const angle = ball.piece.rot;
    expect(angle).not.toBe(0);
    run(ball, 300);
    expect(ball.piece.rot).toBe(angle);
  });

  it("turns by distance over radius, the right way", () => {
    const w = createWorld();
    w.piece.vx = 1;
    step(w, W);
    expect(w.piece.rot).toBeCloseTo((1 / (LW / 2)) * (180 / Math.PI), 5);
    const back = createWorld();
    back.piece.vx = -1;
    step(back, W);
    expect(back.piece.rot).toBeLessThan(0);
  });
});

describe("Jinn", () => {
  it("wakes and drops off when the piece is picked up", () => {
    const w = createWorld();
    grabPiece(w);
    step(w, W);
    expect(w.cat.mode).toBe("chase");
    run(w, 120);
    expect(w.cat.h).toBe(0);
  });

  it("jumps at it with his claws out when it is held high", () => {
    const w = createWorld();
    grabPiece(w);
    run(w, 120); // down on the floor
    holdPieceAt(w, w.cat.x + CW / 2 - LW / 2, 90, W);
    let jumped = false;
    let swiped = false;
    for (let i = 0; i < 120; i++) {
      step(w, W);
      if (w.cat.h > 20) jumped = true;
      if (catPose(w, false).name === "swipe") swiped = true;
    }
    expect(jumped).toBe(true);
    expect(swiped).toBe(true);
    // Held, so he never knocks it out of the hand.
    expect(w.piece.held).toBe(true);
  });

  it("bats it once, waits for it to stop, and climbs on to sleep", () => {
    const w = awakeBeside();
    const modes: CatMode[] = [w.cat.mode];
    let pushes = 0;
    let lastVx = w.piece.vx;
    let n = 0;
    while (!isResting(w) && n++ < 60 * 30) {
      step(w, W);
      if (w.cat.mode !== modes.at(-1)) modes.push(w.cat.mode);
      if (Math.abs(w.piece.vx) > Math.abs(lastVx) + 3) pushes++;
      lastVx = w.piece.vx;
    }
    expect(isResting(w)).toBe(true);
    expect(modes.slice(0, 4)).toEqual(["chase", "pushed", "climb", "sleep"]);
    expect(pushes).toBe(1);
    // It rolled away from where it was.
    expect(w.piece.x).not.toBe(300);
    // On top, over the middle.
    expect(w.cat.h).toBe(catTop(w.piece));
    expect(w.cat.x).toBeCloseTo(w.piece.x + LW / 2 - CW / 2, 5);
  });

  it("settles to rest after a throw, whatever happens in between", () => {
    const w = createWorld();
    grabPiece(w);
    run(w, 30);
    holdPieceAt(w, 40, 120, W);
    releasePiece(w, { vx: 12, vy: 8 }, false);
    expect(settle(w)).toBeGreaterThan(0);
  });

  it("is knocked off his perch by a real shake, but not a nudge", () => {
    const nudged = createWorld();
    step(nudged, W, { ax: 0.5, ay: 0 });
    expect(nudged.cat.mode).toBe("sleep");

    const shaken = createWorld();
    step(shaken, W, { ax: 6, ay: -3 });
    expect(shaken.cat.mode).toBe("chase");
    expect(shaken.piece.vx).toBeLessThan(0); // thrown the other way
    expect(settle(shaken)).toBeGreaterThan(0);
  });

  it("draws the frame that fits: asleep, running, jumping, swiping", () => {
    const w = createWorld();
    expect(catPose(w, false).name).toBe("sleep");
    w.cat.mode = "chase";
    w.cat.h = 0;
    w.cat.vx = 3;
    expect(catPose(w, false).name).toBe("run");
    w.cat.h = 10;
    w.cat.vy = 2;
    expect(catPose(w, false).name).toBe("jumpUp");
    w.cat.vy = -2;
    expect(catPose(w, false).name).toBe("jumpDown");
    w.cat.swipeUntil = w.time + 100;
    expect(catPose(w, false).name).toBe("swipe");
    // Reduced motion: always the still sitting frame.
    expect(catPose(w, true)).toMatchObject({ name: "idle", index: 0 });
  });
});

describe("Reduced motion", () => {
  it("sits Jinn beside the piece, facing it, and sets a held piece down", () => {
    const w = createWorld();
    sitBeside(w, W);
    expect(w.cat.h).toBe(0);
    expect(w.cat.x + CW).toBeLessThanOrEqual(w.piece.x);
    expect(w.cat.face).toBe(1);

    grabPiece(w);
    holdPieceAt(w, 10, 120, W);
    releasePiece(w, { vx: 9, vy: 9 }, true);
    expect(w.piece).toMatchObject({ h: ON_STAND, vx: 0, vy: 0, held: false });
    expect(w.cat.face).toBe(-1); // turned to watch it

    // Set down on top of him: he is sitting beside it again.
    grabPiece(w);
    holdPieceAt(w, w.cat.x - 10, 60, W);
    releasePiece(w, { vx: 0, vy: 0 }, true, W);
    expect(w.cat.x + CW <= w.piece.x || w.cat.x >= w.piece.x + LW).toBe(true);
    expect(w.cat.h).toBe(0);

    // No room on the left: he sits on the right.
    const edge = createWorld(W, 0);
    sitBeside(edge, W);
    expect(edge.cat.x).toBeGreaterThanOrEqual(edge.piece.x + LW);
  });
});

describe("The strip", () => {
  it("keeps the piece and a sleeping Jinn inside a narrower strip", () => {
    const w = createWorld();
    fitWorld(w, 200);
    expect(w.piece.x).toBe(200 - LW);
    expect(w.cat.x).toBe(w.piece.x + LW / 2 - CW / 2);
  });

  it("keeps the stand and light under the ball, wherever it is", () => {
    const w = createWorld();
    w.piece.x = 123;
    w.piece.h = 90;
    const at = layout(w, catPose(w, false));
    expect(at.stand.x).toBe(123);
    expect(at.light.x + 130).toBe(123 + LW / 2);
    expect(at.ball.y).toBe(166 - 90 - BODY_H);
  });

  it("reads a window being dragged as a shake, and a maximise as none", () => {
    const t = createShakeTracker();
    expect(readShake(t, { left: 0, top: 0 }, 16)).toEqual({ ax: 0, ay: 0 });
    const s = readShake(t, { left: 10, top: 0 }, 1000 / 60);
    expect(s.ax).toBeCloseTo(10, 5);
    // Same speed again: no acceleration.
    expect(readShake(t, { left: 20, top: 0 }, 1000 / 60).ax).toBeCloseTo(0, 5);
    // A jump of 120px or more is not a shake.
    expect(readShake(t, { left: 400, top: 0 }, 1000 / 60)).toEqual({
      ax: 0,
      ay: 0,
    });
    expect(NO_SHAKE).toEqual({ ax: 0, ay: 0 });
  });
});
