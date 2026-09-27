import {
  BOWL_H,
  BOWL_W,
  CELL_H,
  CELL_W,
  type ModaPose,
  type NipsterPose,
} from "./art";

// The rules of Moda and Nipster's visit, as plain data and pure functions (no
// React, no DOM), so a test can walk the whole story with a fake clock.
//
// 1. A program's window has been open DWELL_MS (1.5 minutes): the two cats
//    appear on the desktop under it, sitting, hidden by the window.
// 2. Once the window stops hiding them (moved, closed, minimised), Moda walks
//    to the screen's right-hand edge and scratches it; Nipster walks to the
//    nearest desktop icon and sits on it, sassy. Two bowls appear at the
//    bottom of the screen, unless they were filled in the last six hours.
// 3. A click on a bowl fills both. Each cat walks to a bowl and eats; then
//    the bowls are empty and each walks to its nearest icon and sits on it.
//    That is the end: nothing moves again until the page is loaded anew.
//
// Under reduced motion there is no walking: the cats appear where step 2
// leaves them, and a feed shows step 3's end at once.
//
// All places are in the cats' layer's px (the desktop's area between the
// header and the taskbar, where the windows are placed too). A cat's `Spot`
// is the top-left corner of its box.

/** Sprite pixels to screen pixels, as Jinn's (Shadow Work's CAT_SCALE). */
export const SCALE = 3;
/** A cat's box on screen. */
export const CAT_W = CELL_W * SCALE;
export const CAT_H = CELL_H * SCALE;
/** A bowl's box on screen. */
export const BOWL_PX_W = BOWL_W * SCALE;
export const BOWL_PX_H = BOWL_H * SCALE;

/** How long a program's window stays open before the cats come. */
export const DWELL_MS = 90_000;
/** Walking pace, px a second. */
export const WALK_PX_PER_S = 80;
/** A walk never takes less than this (a step or two). */
export const MIN_WALK_MS = 300;
/** How long they eat. */
export const EAT_MS = 4_000;
/** How much of the cats a window may still hide once they count as found. */
export const REVEAL_COVERED_MAX = 0.75;

export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Spot = { x: number; y: number };

/** A program's window, as the desktop's window manager places it. */
export type WindowBox = Rect & {
  id: string;
  minimized?: boolean;
  maximized?: boolean;
};

// --- When: the 1.5 minute wait --------------------------------------------------

/**
 * When each open window was first seen, carried from the last reading: new
 * windows start now, closed ones are forgotten. A minimised window keeps its
 * time (it is still open).
 */
export function trackOpened(
  prev: ReadonlyMap<string, number>,
  windows: readonly WindowBox[],
  now: number,
): Map<string, number> {
  const next = new Map<string, number>();
  for (const w of windows) next.set(w.id, prev.get(w.id) ?? now);
  return next;
}

/**
 * When the next visible window reaches its time (ms since the epoch), or
 * null when no window is showing. One timer waits for this, and nothing else
 * runs before the cats come.
 */
export function nextDueAt(
  opened: ReadonlyMap<string, number>,
  windows: readonly WindowBox[],
  delayMs: number,
): number | null {
  let due: number | null = null;
  for (const w of windows) {
    if (w.minimized) continue;
    const at = (opened.get(w.id) ?? Infinity) + delayMs;
    if (due === null || at < due) due = at;
  }
  return due === null || !Number.isFinite(due) ? null : due;
}

/** The window the cats come to: the longest open of those whose time is up. */
export function dueWindow(
  opened: ReadonlyMap<string, number>,
  windows: readonly WindowBox[],
  now: number,
  delayMs: number,
): WindowBox | null {
  let best: WindowBox | null = null;
  let bestAt = Infinity;
  for (const w of windows) {
    if (w.minimized) continue;
    const at = opened.get(w.id);
    if (at === undefined || now - at < delayMs) continue;
    if (at < bestAt) {
      best = w;
      bestAt = at;
    }
  }
  return best;
}

// --- Where ------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampSpot(s: Spot, layer: Size): Spot {
  return {
    x: clamp(s.x, 0, Math.max(0, layer.w - CAT_W)),
    y: clamp(s.y, 0, Math.max(0, layer.h - CAT_H)),
  };
}

/** The part of a window inside the layer (a maximised one is all of it). */
function windowArea(w: WindowBox, layer: Size): Rect {
  if (w.maximized) return { x: 0, y: 0, w: layer.w, h: layer.h };
  const x = clamp(w.x, 0, layer.w);
  const y = clamp(w.y, 0, layer.h);
  return {
    x,
    y,
    w: clamp(w.x + w.w, 0, layer.w) - x,
    h: clamp(w.y + w.h, 0, layer.h) - y,
  };
}

/** Where the two appear: side by side near the bottom middle of the window. */
export function spawnSpots(
  win: WindowBox,
  layer: Size,
): { moda: Spot; nipster: Spot } {
  const a = windowArea(win, layer);
  const mid = a.x + a.w / 2;
  const y = a.y + a.h - 16 - CAT_H;
  return {
    moda: clampSpot({ x: mid + 4, y }, layer),
    nipster: clampSpot({ x: mid - 4 - CAT_W, y }, layer),
  };
}

/** Moda at the screen's right-hand edge, paws on it, at the height she was. */
export function edgeSpot(from: Spot, layer: Size): Spot {
  return clampSpot({ x: layer.w - CAT_W, y: from.y }, layer);
}

/**
 * Where a cat sits on an icon (its picture's box): in the middle, feet a
 * little down into the top of the picture.
 */
export function perchSpot(icon: Rect, layer: Size): Spot {
  return clampSpot(
    { x: icon.x + icon.w / 2 - CAT_W / 2, y: icon.y + 12 - CAT_H },
    layer,
  );
}

function distance(a: Spot, b: Spot): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The index of the icon nearest a cat, leaving out one already taken, or -1
 * when there is none to sit on (she stays where she is).
 */
export function nearestPerch(
  from: Spot,
  perches: readonly Rect[],
  layer: Size,
  taken = -1,
): number {
  let best = -1;
  let bestD = Infinity;
  perches.forEach((p, i) => {
    if (i === taken) return;
    const d = distance(from, perchSpot(p, layer));
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/**
 * The icons a cat can be seen on: those whose middle no window covers. A
 * cat sits on the nearest of these, not on one hidden under a window.
 */
export function openPerches(
  perches: readonly Rect[],
  windows: readonly WindowBox[],
  layer: Size,
): Rect[] {
  const areas = windows
    .filter((w) => !w.minimized)
    .map((w) => windowArea(w, layer));
  return perches.filter((p) => {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    return !areas.some(
      (a) => cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h,
    );
  });
}

/** The two bowls, side by side at the bottom middle of the screen. */
export function bowlRects(layer: Size): [Rect, Rect] {
  const gap = 36;
  const y = Math.max(0, layer.h - BOWL_PX_H - 6);
  const left = layer.w / 2 - gap / 2 - BOWL_PX_W;
  return [
    { x: left, y, w: BOWL_PX_W, h: BOWL_PX_H },
    { x: layer.w / 2 + gap / 2, y, w: BOWL_PX_W, h: BOWL_PX_H },
  ];
}

/** The eating frame's mouth, in screen px from the cat's left edge. */
const MOUTH_X = 16 * SCALE + SCALE / 2;

/** Where a cat stands to eat from a bowl: facing right, mouth over it. */
export function eatSpot(bowl: Rect): Spot {
  return { x: bowl.x + bowl.w / 2 - MOUTH_X, y: bowl.y + bowl.h - CAT_H - 2 };
}

/**
 * How much of a cat's box the windows hide, 0 to 1, sampled on a grid (a
 * few points is plenty to tell "under a window" from "out in the open").
 */
export function coveredFraction(
  spot: Spot,
  windows: readonly WindowBox[],
  layer: Size,
): number {
  const areas = windows
    .filter((w) => !w.minimized)
    .map((w) => windowArea(w, layer));
  const cols = 5;
  const rows = 4;
  let hidden = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = spot.x + ((i + 0.5) / cols) * CAT_W;
      const py = spot.y + ((j + 0.5) / rows) * CAT_H;
      if (
        areas.some(
          (a) => px >= a.x && px < a.x + a.w && py >= a.y && py < a.y + a.h,
        )
      ) {
        hidden++;
      }
    }
  }
  return hidden / (cols * rows);
}

// --- The story ----------------------------------------------------------------------

export type Phase =
  | "waiting" // under the window, sitting, hidden
  | "going" // walking out: Moda to the edge, Nipster to an icon
  | "settled" // Moda scratching, Nipster sassy; bowls out if allowed
  | "toBowls" // walking to the full bowls
  | "eating"
  | "toPerches" // walking to an icon each
  | "done"; // on the icons; nothing moves again

export type { ModaPose, NipsterPose };

/** A walk in progress: from here to the cat's `at`, taking `ms`. */
export type Leg = { from: Spot; ms: number };

export type CatState<P extends string> = {
  /** Where the cat is, or is walking to. */
  at: Spot;
  pose: P;
  /** 1 facing right (as drawn), -1 facing left. */
  face: 1 | -1;
  /** Set while walking. */
  leg?: Leg;
};

export type Scene = {
  phase: Phase;
  moda: CatState<ModaPose>;
  nipster: CatState<NipsterPose>;
  bowls: "none" | "empty" | "full";
};

/** What the scene reads about the desktop at each turn. */
export type SceneContext = {
  layer: Size;
  /** The desktop icons' pictures, in the layer's px. */
  perches: readonly Rect[];
  /** Whether the six-hour limit lets the bowls be filled. */
  mayFeed: boolean;
  reducedMotion: boolean;
};

export function walkMs(from: Spot, to: Spot): number {
  return Math.max(MIN_WALK_MS, (distance(from, to) / WALK_PX_PER_S) * 1000);
}

/** Starts a cat walking to `to` (or puts it there, under reduced motion). */
function walkTo<P extends string>(
  cat: CatState<P>,
  to: Spot,
  arrivePose: P,
  walkPose: P,
  reduced: boolean,
): CatState<P> {
  const face = to.x < cat.at.x ? -1 : to.x > cat.at.x ? 1 : cat.face;
  if (reduced) return { at: to, pose: arrivePose, face };
  return {
    at: to,
    pose: walkPose,
    face,
    leg: { from: cat.at, ms: walkMs(cat.at, to) },
  };
}

function perchFor(from: Spot, ctx: SceneContext, taken = -1) {
  const i = nearestPerch(from, ctx.perches, ctx.layer, taken);
  return { i, spot: i < 0 ? from : perchSpot(ctx.perches[i]!, ctx.layer) };
}

/** Where step 2 sends them: Moda to the edge, Nipster to the nearest icon. */
function goOut(scene: Scene, ctx: SceneContext): Scene {
  const r = ctx.reducedMotion;
  const moda = walkTo(
    scene.moda,
    edgeSpot(scene.moda.at, ctx.layer),
    "scratch",
    "walk",
    r,
  );
  const nipster = walkTo(
    scene.nipster,
    perchFor(scene.nipster.at, ctx).spot,
    "sassy",
    "walk",
    r,
  );
  if (r) moda.face = 1;
  const next: Scene = { ...scene, phase: "going", moda, nipster };
  return r ? settle(next, ctx) : next;
}

function settle(scene: Scene, ctx: SceneContext): Scene {
  return { ...scene, phase: "settled", bowls: ctx.mayFeed ? "empty" : "none" };
}

/**
 * The cats appear, under the window whose time is up. Under reduced motion
 * they appear where they would have walked to, already settled.
 */
export function spawnScene(win: WindowBox, ctx: SceneContext): Scene {
  const s = spawnSpots(win, ctx.layer);
  const scene: Scene = {
    phase: "waiting",
    moda: { at: s.moda, pose: "sit", face: 1 },
    nipster: { at: s.nipster, pose: "sit", face: -1 },
    bowls: "none",
  };
  return ctx.reducedMotion ? goOut(scene, ctx) : scene;
}

/** The window no longer hides them (most of them in view): out they go. */
export function isRevealed(
  scene: Scene,
  windows: readonly WindowBox[],
  layer: Size,
): boolean {
  const covered =
    (coveredFraction(scene.moda.at, windows, layer) +
      coveredFraction(scene.nipster.at, windows, layer)) /
    2;
  return covered <= REVEAL_COVERED_MAX;
}

export function reveal(scene: Scene, ctx: SceneContext): Scene {
  return scene.phase === "waiting" ? goOut(scene, ctx) : scene;
}

/** Whether a phase is one of walking, which ends when both have arrived. */
function walking(p: Phase): boolean {
  return p === "going" || p === "toBowls" || p === "toPerches";
}

/**
 * One cat has finished its walk: it takes the pose it came for. When both
 * have, the story moves on (settled, eating, done).
 */
export function arrive(
  scene: Scene,
  who: "moda" | "nipster",
  ctx: SceneContext,
): Scene {
  if (!walking(scene.phase) || !scene[who].leg) return scene;
  const next: Scene = { ...scene };
  if (who === "moda") {
    const pose: ModaPose =
      scene.phase === "going"
        ? "scratch"
        : scene.phase === "toBowls"
          ? "eat"
          : "perch";
    next.moda = {
      at: scene.moda.at,
      pose,
      face: pose === "perch" ? scene.moda.face : 1,
    };
  } else {
    const pose: NipsterPose =
      scene.phase === "going"
        ? "sassy"
        : scene.phase === "toBowls"
          ? "eat"
          : "perch";
    next.nipster = {
      at: scene.nipster.at,
      pose,
      face: pose === "eat" ? 1 : scene.nipster.face,
    };
  }
  if (next.moda.leg || next.nipster.leg) return next;
  if (scene.phase === "going") return settle(next, ctx);
  if (scene.phase === "toBowls") return { ...next, phase: "eating" };
  return { ...next, phase: "done", bowls: "none" };
}

/** Both perched, each on the icon nearest its bowl (not the same one). */
function goToPerches(scene: Scene, ctx: SceneContext): Scene {
  const m = perchFor(scene.moda.at, ctx);
  const n = perchFor(scene.nipster.at, ctx, m.i);
  const r = ctx.reducedMotion;
  const next: Scene = {
    ...scene,
    phase: "toPerches",
    bowls: "empty",
    moda: walkTo(scene.moda, m.spot, "perch", "walk", r),
    nipster: walkTo(scene.nipster, n.spot, "perch", "walk", r),
  };
  return r ? { ...next, phase: "done", bowls: "none" } : next;
}

/**
 * A bowl clicked, and the six-hour limit agreed (the caller has recorded
 * the feed): both bowls fill and each cat walks to one. Under reduced
 * motion, straight to the end: on their icons, the bowls put away.
 */
export function feed(scene: Scene, ctx: SceneContext): Scene {
  if (scene.phase !== "settled" || scene.bowls !== "empty") return scene;
  const [left, right] = bowlRects(ctx.layer);
  const moda = eatSpot(right);
  const nipster = eatSpot(left);
  if (ctx.reducedMotion) {
    return goToPerches(
      {
        ...scene,
        moda: { at: moda, pose: "eat", face: 1 },
        nipster: { at: nipster, pose: "eat", face: 1 },
      },
      ctx,
    );
  }
  return {
    ...scene,
    phase: "toBowls",
    bowls: "full",
    moda: walkTo(scene.moda, moda, "eat", "walk", false),
    nipster: walkTo(scene.nipster, nipster, "eat", "walk", false),
  };
}

/** The feed was refused (filled in another tab since): the bowls go. */
export function refuseFeed(scene: Scene): Scene {
  return scene.phase === "settled" ? { ...scene, bowls: "none" } : scene;
}

/** EAT_MS of eating: the bowls are empty, and off to an icon each. */
export function finishEating(scene: Scene, ctx: SceneContext): Scene {
  return scene.phase === "eating" ? goToPerches(scene, ctx) : scene;
}
