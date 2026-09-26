import { CAT_FRAMES, CAT_H, CAT_W } from "../inkblot/cat";
import { SHADOW_WORK_BALL, SHADOW_WORK_STAND } from "./art";
import { JINN_SLEEPING } from "../cats/sprites";

// Jinn and Shadow Work's rules, as plain functions over a plain world: no
// React, no DOM, no clock of their own. The strip calls `step` once per
// 60th of a second of play; every speed below is in CSS pixels per step and
// every height is measured up from the floor.

export const CAT_SCALE = 3;
export const SHADOW_WORK_SCALE = 2;
/** Jinn, awake, on screen. */
export const CW = CAT_W * CAT_SCALE;
export const CH = CAT_H * CAT_SCALE;
/** Jinn asleep is lower than he is awake. */
export const SLEEP_H = JINN_SLEEPING.length * CAT_SCALE;
/** The piece's width, ball and stand alike. */
export const LW = SHADOW_WORK_BALL[0]!.length * SHADOW_WORK_SCALE;
export const BODY_H = SHADOW_WORK_BALL.length * SHADOW_WORK_SCALE;
export const STAND_H = SHADOW_WORK_STAND.length * SHADOW_WORK_SCALE;
/** Resting on its legs, the ball's bottom is this high off the floor. */
export const ON_STAND = STAND_H - 2;
/** The strip's height, and the floor line's y from its top. */
export const STRIP_H = 180;
export const FLOOR = STRIP_H - 14;
/** How far above the strip the ball may fly, over the folder's icons. */
export const HEADROOM = 140;
/** The highest the ball's bottom goes. */
export const CEILING = FLOOR - BODY_H + HEADROOM;
/** And Jinn's feet. */
export const CAT_CEILING = FLOOR - CH + HEADROOM;
/** Gravity, per step. */
export const G = 0.5;
/** One step of play, in ms. */
export const TICK_MS = 1000 / 60;
/** The strip's width until it has been measured, and where the piece starts. */
export const DEFAULT_WIDTH = 480;
export const START_X = 260;
/** Width of the light the piece throws on the floor. */
export const LIGHT_W = 260;

export type CatMode =
  /** After the piece. */
  | "chase"
  /** Has batted it once, and waits for it to stop. */
  | "pushed"
  /** Jumping up onto it. */
  | "climb"
  /** Curled up on top. */
  | "sleep";

export type CatState = {
  x: number;
  /** Height of his feet above the floor. */
  h: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  /** Claws out until this time (world ms). */
  swipeUntil: number;
  /** Has hit the ball in this jump already. */
  batted: boolean;
  mode: CatMode;
  pushedAt: number;
};

export type PieceState = {
  x: number;
  /** Height of the ball's bottom above the floor. */
  h: number;
  vx: number;
  vy: number;
  held: boolean;
  /** Degrees it has rolled; it stays at whatever angle it stops. */
  rot: number;
};

export type World = {
  cat: CatState;
  piece: PieceState;
  /** Play time in ms, advanced by `step`. */
  time: number;
  /** Steps taken, for the cat's frame timing. */
  tick: number;
};

/** A window's movement felt by what is inside it, per step. */
export type Shake = { ax: number; ay: number };
export const NO_SHAKE: Shake = { ax: 0, ay: 0 };

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), Math.max(lo, hi));
}

/** Where Jinn lies when asleep on the ball: his feet's height. */
export function catTop(piece: PieceState): number {
  return piece.h + BODY_H - 6;
}

/**
 * The piece on its stand, and Jinn asleep on top of it. He stays asleep
 * until someone finds out the piece can be moved (owner, 2026-09-25).
 */
export function createWorld(width = DEFAULT_WIDTH, x = START_X): World {
  const px = clamp(x, 0, width - LW);
  const piece: PieceState = {
    x: px,
    h: ON_STAND,
    vx: 0,
    vy: 0,
    held: false,
    rot: 0,
  };
  return {
    piece,
    cat: {
      x: px + LW / 2 - CW / 2,
      h: catTop(piece),
      vx: 0,
      vy: 0,
      face: 1,
      swipeUntil: 0,
      batted: false,
      mode: "sleep",
      pushedAt: 0,
    },
    time: 0,
    tick: 0,
  };
}

/** Keeps the piece and Jinn inside a strip that has just changed width. */
export function fitWorld(w: World, width: number): void {
  const l = w.piece;
  const c = w.cat;
  l.x = clamp(l.x, 0, width - LW);
  if (c.mode === "sleep" && !l.held) c.x = l.x + LW / 2 - CW / 2;
  c.x = clamp(c.x, 0, width - CW);
}

/**
 * Reduced motion: Jinn sits on the floor beside the piece and watches it,
 * on its left if there is room, else on its right.
 */
export function sitBeside(w: World, width: number): void {
  const l = w.piece;
  const c = w.cat;
  const left = l.x - CW - 4;
  c.x = clamp(left >= 0 ? left : l.x + LW + 4, 0, width - CW);
  c.h = 0;
  c.vx = 0;
  c.vy = 0;
  c.mode = "chase";
  faceThePiece(w);
}

function faceThePiece(w: World): void {
  w.cat.face = w.piece.x + LW / 2 >= w.cat.x + CW / 2 ? 1 : -1;
}

/**
 * At rest: Jinn asleep on top and the ball still on its stand. The strip
 * stops its loop here, so a sleeping cat costs nothing.
 */
export function isResting(w: World): boolean {
  const { cat: c, piece: l } = w;
  return (
    c.mode === "sleep" &&
    !l.held &&
    l.vx === 0 &&
    l.vy === 0 &&
    l.h <= ON_STAND + 0.5
  );
}

/** Picked up: it stops where it is. Jinn wakes on the next step. */
export function grabPiece(w: World): void {
  w.piece.held = true;
  w.piece.vx = 0;
  w.piece.vy = 0;
}

/** Held at (x, h), kept inside the strip and its headroom. */
export function holdPieceAt(w: World, x: number, h: number, width: number) {
  w.piece.x = clamp(x, 0, width - LW);
  w.piece.h = clamp(h, ON_STAND, CEILING);
}

/**
 * Let go: thrown at `velocity`. Under reduced motion it is set straight down
 * on its stand instead, and Jinn turns to watch it; set down on top of him,
 * he is sitting beside it again (no walk: he is simply there).
 */
export function releasePiece(
  w: World,
  velocity: { vx: number; vy: number },
  still: boolean,
  width = DEFAULT_WIDTH,
): void {
  const l = w.piece;
  l.held = false;
  if (still) {
    l.h = ON_STAND;
    l.vx = 0;
    l.vy = 0;
    const c = w.cat;
    const overlaps = c.x < l.x + LW && c.x + CW > l.x;
    if (overlaps) sitBeside(w, width);
    else faceThePiece(w);
    return;
  }
  l.vx = velocity.vx;
  l.vy = velocity.vy;
}

export type TrailPoint = { t: number; x: number; h: number };

/** Where the ball has been in the last ~90 ms, to throw it on release. */
export function pushTrail(trail: TrailPoint[], p: TrailPoint): void {
  trail.push(p);
  while (trail.length > 2 && p.t - trail[0]!.t > 90) trail.shift();
}

/**
 * The throw: the ball's speed over the last moments of the drag, per step,
 * capped. Held still for a moment before letting go, it just drops.
 */
export function throwVelocity(
  trail: readonly TrailPoint[],
  releasedAt: number,
): { vx: number; vy: number } {
  const first = trail[0];
  const last = trail[trail.length - 1];
  if (!first || !last || last.t - first.t <= 8) return { vx: 0, vy: 0 };
  if (releasedAt - last.t > 120) return { vx: 0, vy: 0 };
  const k = TICK_MS / (last.t - first.t);
  return {
    vx: clamp((last.x - first.x) * k, -22, 22),
    vy: clamp((last.h - first.h) * k, -22, 22),
  };
}

export type ShakeTracker = {
  pos: { x: number; y: number } | null;
  vel: { x: number; y: number };
};

export function createShakeTracker(): ShakeTracker {
  return { pos: null, vel: { x: 0, y: 0 } };
}

/**
 * How hard the window was shaken since the last frame: the change in the
 * strip's on-screen speed, per step, capped. Things inside feel the opposite
 * of that, like things in a box. A jump of 120px or more is a maximise or a
 * restore, not a shake.
 */
export function readShake(
  tracker: ShakeTracker,
  rect: { left: number; top: number },
  frameMs: number,
): Shake {
  let ax = 0;
  let ay = 0;
  const p = tracker.pos;
  if (p) {
    const k = TICK_MS / clamp(frameMs, TICK_MS / 2, TICK_MS * 3);
    const dx = rect.left - p.x;
    const dy = rect.top - p.y;
    if (Math.abs(dx) < 120 && Math.abs(dy) < 120) {
      const vx = dx * k;
      const vy = dy * k;
      ax = clamp(vx - tracker.vel.x, -15, 15);
      ay = clamp(vy - tracker.vel.y, -15, 15);
      tracker.vel = { x: vx, y: vy };
    } else {
      tracker.vel = { x: 0, y: 0 };
    }
  }
  tracker.pos = { x: rect.left, y: rect.top };
  return { ax, ay };
}

/** One 60th of a second of play. Mutates the world. */
export function step(w: World, width: number, shake: Shake = NO_SHAKE): void {
  w.time += TICK_MS;
  w.tick++;
  const now = w.time;
  const W = width;
  const l = w.piece;
  const c = w.cat;
  const { ax, ay } = shake;

  // Shaking: the window was dragged, so what is inside is thrown about.
  if (ax || ay) {
    if (!l.held) {
      l.vx -= ax * 0.9;
      l.vy += ay * 0.9; // window yanked down: the ball lifts
    }
    if (Math.abs(ax) + Math.abs(ay) > 1.2) {
      // A real shake knocks Jinn off his perch and about.
      if (c.mode === "sleep" || c.mode === "climb") c.mode = "chase";
      c.vx = clamp(c.vx - ax * 0.9, -14, 14);
      c.vy = clamp(c.vy + ay * 0.9, -14, 14);
      if (c.h <= 0) c.vy = Math.max(c.vy, 2); // a hop off the floor
      c.h = Math.max(c.h, 0.1);
      c.batted = true;
    }
  }

  // The ball. It always comes to rest on its stand, and the stand and its
  // light always stay under it (owner, 2026-09-25).
  const surface = ON_STAND;
  if (!l.held) {
    if (l.h > surface || l.vy > 0) {
      // Flying: an arc, bouncing off the floor, the walls and the top, a
      // little lower each time.
      l.vy -= G;
      l.h += l.vy;
      if (l.h > CEILING) {
        l.h = CEILING;
        l.vy = -Math.abs(l.vy) * 0.5;
      }
      if (l.h <= surface) {
        l.h = surface;
        if (l.vy < -1.8) {
          l.vy = -l.vy * 0.55;
          l.vx *= 0.85;
        } else {
          l.vy = 0;
        }
      }
    } else {
      l.h = surface;
      l.vy = 0;
    }
    const x0 = l.x;
    l.x += l.vx;
    if (l.x < 0 || l.x > W - LW) {
      l.x = clamp(l.x, 0, W - LW);
      l.vx = -l.vx * 0.6;
    }
    // It rolls like a ball: turned by the distance over its radius.
    l.rot = (l.rot + ((l.x - x0) / (LW / 2)) * (180 / Math.PI)) % 360;
    const onFloor = l.h <= surface + 0.5 && l.vy === 0;
    l.vx *= onFloor ? 0.95 : 0.995;
    if (onFloor && Math.abs(l.vx) < 0.05) l.vx = 0;
  }
  const grounded = !l.held && l.h <= surface + 0.5;

  // Jinn.
  const dx = l.x + LW / 2 - (c.x + CW / 2);
  const dir: 1 | -1 = dx >= 0 ? 1 : -1;
  const top = catTop(l);
  const airborne = c.h > 0 || c.vy > 0;
  if (l.held && c.mode !== "sleep") c.mode = "chase";

  if (c.mode === "sleep") {
    if (l.held) {
      // Picked up from under him: awake, and down he drops.
      c.mode = "chase";
      c.vy = 1.5;
      c.vx = 0;
    } else {
      c.x = l.x + LW / 2 - CW / 2;
      c.h = top;
      c.vx = 0;
      c.vy = 0;
    }
  } else if (airborne) {
    c.vy -= G;
    c.h += c.vy;
    c.x += c.vx;
    // Same headroom as the ball; he bounces off the top and the walls.
    if (c.h > CAT_CEILING) {
      c.h = CAT_CEILING;
      c.vy = -Math.abs(c.vy) * 0.5;
    }
    if (c.x < 0 || c.x > W - CW) c.vx = -c.vx * 0.5;
    if (c.mode === "climb") {
      // Steer over the piece and land on its top.
      c.x += (l.x + LW / 2 - CW / 2 - c.x) * 0.14;
      if (c.vy < 0 && c.h <= top && Math.abs(dx) < 22) {
        // Landed: curled up over the middle.
        c.mode = "sleep";
        c.x = l.x + LW / 2 - CW / 2;
        c.h = top;
        c.vy = 0;
        c.vx = 0;
      }
    } else {
      const near =
        Math.abs(dx) < 46 && Math.abs(c.h + CH / 2 - (l.h + BODY_H / 2)) < 46;
      if (near) {
        // Claws out.
        c.swipeUntil = now + 250;
        if (!c.batted && !l.held) {
          l.vx += c.face * 3;
          l.vy = 2;
          c.batted = true;
        }
      }
    }
    if (c.mode !== "sleep" && c.h <= 0) {
      c.h = 0;
      c.vy = 0;
      c.vx = 0;
      if (c.mode === "climb") c.mode = "pushed"; // missed: try again
    }
  } else if (now < c.swipeUntil) {
    // Claws out: hold still for the swipe.
  } else if (Math.abs(dx) > 58) {
    c.face = dir;
    c.vx = dir * 3.2;
    c.x += c.vx;
  } else if (l.held && l.h > 16) {
    // It's up there. Jump for it.
    c.face = dir;
    c.vy = Math.min(Math.sqrt(2 * G * (l.h + 16)), 13);
    c.vx = dir * 0.8;
    c.h = 0.1;
    c.batted = false;
  } else if (c.mode === "chase" && grounded) {
    // Right there on the floor: one good push.
    c.face = dir;
    c.swipeUntil = now + 320;
    c.pushedAt = now;
    c.mode = "pushed";
    l.vx += dir * 7;
  } else if (
    c.mode === "pushed" &&
    grounded &&
    l.vx === 0 &&
    now - c.pushedAt > 600
  ) {
    // It stopped. Up he goes, to sleep on it.
    c.face = dir;
    c.mode = "climb";
    c.vy = Math.sqrt(2 * G * (top + 16));
    c.vx = 0;
    c.h = 0.1;
  } else {
    c.vx = 0;
  }
  c.x = clamp(c.x, 0, W - CW);
}

export type PoseName = "sleep" | keyof typeof CAT_FRAMES;
export type Pose = { name: PoseName; index: number; face: 1 | -1 };

/** Which of Jinn's frames to draw, and which way he faces. */
export function catPose(w: World, still: boolean): Pose {
  const c = w.cat;
  if (still) {
    return { name: "idle", index: 0, face: c.face };
  }
  if (c.mode === "sleep") return { name: "sleep", index: 0, face: c.face };
  if (w.time < c.swipeUntil) return { name: "swipe", index: 0, face: c.face };
  if (c.h > 0) {
    return { name: c.vy > 0 ? "jumpUp" : "jumpDown", index: 0, face: c.face };
  }
  if (Math.abs(c.vx) > 0.5) {
    const n = CAT_FRAMES.run.length;
    return { name: "run", index: Math.floor(w.tick / 4) % n, face: c.face };
  }
  const n = CAT_FRAMES.idle.length;
  return { name: "idle", index: Math.floor(w.tick / 14) % n, face: c.face };
}

export function samePose(a: Pose, b: Pose): boolean {
  return a.name === b.name && a.index === b.index && a.face === b.face;
}

/** Where each part is drawn, from the strip's top left, in CSS pixels. */
export type Layout = {
  ball: { x: number; y: number; rot: number };
  stand: { x: number; y: number };
  light: { x: number };
  /** Jinn's box: `feet` is the y of its bottom edge, `h` its height. */
  cat: { x: number; feet: number; h: number };
};

export function layout(w: World, pose: Pose): Layout {
  const l = w.piece;
  const c = w.cat;
  const catH = pose.name === "sleep" ? SLEEP_H : CH;
  return {
    ball: { x: l.x, y: FLOOR - l.h - BODY_H, rot: l.rot },
    stand: { x: l.x, y: FLOOR - STAND_H },
    light: { x: l.x + LW / 2 - LIGHT_W / 2 },
    cat: { x: c.x, feet: FLOOR - c.h + 2, h: catH },
  };
}
