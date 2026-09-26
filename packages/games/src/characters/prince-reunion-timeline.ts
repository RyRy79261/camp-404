import { HUMAN_W } from "./human-frames";
import {
  beatStart,
  DUST_FRAME_MS,
  DUST_ORDER,
  REUNION_BEATS,
  REUNION_CALLS,
  REUNION_MS,
  RUN_FRAME_MS,
  WALK_FRAME_MS,
} from "./prince-reunion";

// The reunion as a pure state machine (prince-reunion.md): whether the scene
// waits, plays or is over, and what is on screen at any moment of it. The
// component (prince-reunion-scene.tsx) runs one requestAnimationFrame clock that
// feeds `reunionAt` and writes the answer straight to the DOM; nothing here
// touches a browser, so every beat is tested without one.
//
// Positions are in sprite pixels (the component multiplies by its scale), as
// offsets of a sprite's bottom middle from the anchor: the middle of the
// clock's top edge. `x` grows to the right, `y` (a lift) upwards.

/** Where the scene is: not started, playing, or over (sitting together). */
export type ReunionPhase = "waiting" | "playing" | "done";

/**
 * Where the scene starts. Once it has played in this browser session, or
 * under reduced motion, the two of them are simply there, sitting together.
 * Otherwise it waits (Prince absent) until she can see the clock.
 */
export function initialPhase({
  seen,
  reducedMotion,
}: {
  seen: boolean;
  reducedMotion: boolean;
}): ReunionPhase {
  return seen || reducedMotion ? "done" : "waiting";
}

/**
 * The longest step the clock takes in one frame, in ms. A frame that comes
 * late (a busy main thread, a tab coming back) moves the scene on by this at
 * most, so nothing jumps a beat.
 */
export const MAX_STEP_MS = 100;

/** The scene's clock after a frame `dt` ms long. Never runs backwards. */
export function advance(elapsed: number, dt: number): number {
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP_MS) : 0;
  return Math.min(elapsed + step, REUNION_MS);
}

/** How far each of them comes from, in sprite pixels from the anchor. */
export type ReunionGeometry = {
  /** Cloud walks in from here (to the right of the anchor, off screen). */
  fromRight: number;
  /** Prince bolts in from here (to the left of the anchor, off screen). */
  fromLeft: number;
};

/** The distances for an anchor `anchorX` screen px from the left edge. */
export function reunionGeometry(
  anchorX: number,
  screenWidth: number,
  scale: number,
): ReunionGeometry {
  return {
    fromRight: Math.ceil(Math.max(0, screenWidth - anchorX) / scale) + HUMAN_W,
    fromLeft: Math.ceil(Math.max(0, anchorX) / scale) + 16,
  };
}

export type CloudPose =
  | "walk"
  | "idle"
  | "call"
  | "look"
  | "surprised"
  | "together";

/** What is on screen at one moment of the scene. */
export type ReunionShot = {
  cloud: { pose: CloudPose; frame: number; x: number } | null;
  prince: { pose: "run" | "leap"; frame: number; x: number; y: number } | null;
  dust: { frame: number; x: number } | null;
  /** Her speech bubble's words, or nothing. */
  bubble: string | null;
  /** The heart over them as the dust clears: its lift, and how solid it is. */
  heart: { y: number; opacity: number } | null;
  /** The scene is over: the two of them stay sitting together. */
  done: boolean;
};

/** Where Prince is when he leaps: a few of his strides short of her. */
export const LEAP_FROM = -(HUMAN_W / 2 + 14);
/** Where the leap lands: in her arms, just left of her middle. */
export const LEAP_TO = -4;
/** How high the leap's arc goes, in sprite pixels. */
export const LEAP_HEIGHT = 6;
/** The last moments of a call: her hand still up, mouth shut, listening. */
export const LISTEN_MS = 300;
/** How far the heart rises as it fades, in sprite pixels, and in how many steps. */
export const HEART_RISE = 4;
/** Where the heart starts: just over her head as she sits (her hair tops out 19 up). */
export const HEART_AT = 20;

const NONE = {
  cloud: null,
  prince: null,
  dust: null,
  bubble: null,
  heart: null,
  done: false,
} as const;

/** The two of them together: the scene's last picture, and the one it keeps. */
export const RESTING_SHOT: ReunionShot = {
  ...NONE,
  cloud: { pose: "together", frame: 1, x: 0 },
  done: true,
};

/** The beat playing at `t` ms, and how far into it. */
function beatAt(t: number): { id: string; at: number; ms: number } {
  let start = 0;
  for (const b of REUNION_BEATS) {
    if (t < start + b.ms) return { id: b.id, at: t - start, ms: b.ms };
    start += b.ms;
  }
  return { id: "rest", at: t - start, ms: 0 };
}

/** What is on screen `t` ms into the scene. */
export function reunionAt(t: number, geo: ReunionGeometry): ReunionShot {
  if (!(t >= 0)) t = 0;
  if (t >= REUNION_MS) return RESTING_SHOT;
  const { id, at, ms } = beatAt(t);
  const p = ms > 0 ? at / ms : 1;

  if (id === "walk-in") {
    return {
      ...NONE,
      cloud: {
        pose: "walk",
        frame: Math.floor(at / WALK_FRAME_MS) % 4,
        x: Math.round(geo.fromRight * (1 - p)),
      },
    };
  }
  if (id === "settle") {
    return { ...NONE, cloud: { pose: "idle", frame: 0, x: 0 } };
  }
  if (id.startsWith("call-")) {
    const n = Number(id.slice(5)) - 1;
    return {
      ...NONE,
      cloud: { pose: "call", frame: at < ms - LISTEN_MS ? 0 : 1, x: 0 },
      bubble: REUNION_CALLS[n] ?? null,
    };
  }
  if (id === "look-1" || id === "look-2") {
    return {
      ...NONE,
      cloud: { pose: "look", frame: id === "look-1" ? 0 : 1, x: 0 },
    };
  }
  if (id === "sprint") {
    return {
      ...NONE,
      // She turns to face him as he comes: listening, facing left.
      cloud: { pose: "call", frame: 1, x: 0 },
      prince: {
        pose: "run",
        frame: Math.floor(at / RUN_FRAME_MS) % 4,
        x: Math.round(-geo.fromLeft + (geo.fromLeft + LEAP_FROM) * p),
        y: 0,
      },
    };
  }
  if (id === "leap") {
    return {
      ...NONE,
      cloud: { pose: "surprised", frame: 0, x: 0 },
      prince: {
        pose: "leap",
        frame: 0,
        x: Math.round(LEAP_FROM + (LEAP_TO - LEAP_FROM) * p),
        y: Math.round(Math.sin(Math.PI * p) * LEAP_HEIGHT),
      },
    };
  }
  if (id === "dust") {
    const i = Math.min(DUST_ORDER.length - 1, Math.floor(at / DUST_FRAME_MS));
    const frame = DUST_ORDER[i]!;
    // The brawl wobbles a pixel side to side; the hit and the clearing hold.
    const x = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    return { ...NONE, dust: { frame, x } };
  }
  // The heart: the dust is gone, they sit together, a heart rises and fades.
  const step = Math.min(HEART_RISE - 1, Math.floor(p * HEART_RISE));
  return {
    ...NONE,
    cloud: { pose: "together", frame: 0, x: 0 },
    heart: { y: HEART_AT + step, opacity: 1 - step / HEART_RISE },
  };
}

/** When the dust starts, for tests and the storyboard. */
export const DUST_AT = beatStart("dust");
