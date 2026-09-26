"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { CAT_FRAMES } from "../inkblot/cat";
import { PixelCat } from "../cats/pixel-cat";
import { useReducedMotion } from "../cats/reduced-motion";
import {
  JINN_SLEEPING,
  pixelRuns,
  spriteWidth,
  type Sprite,
} from "../cats/sprites";
import {
  SHADOW_WORK_BALL,
  SHADOW_WORK_COLOURS,
  SHADOW_WORK_STAND,
} from "./art";
import {
  BODY_H,
  CH,
  CW,
  DEFAULT_WIDTH,
  FLOOR,
  LIGHT_W,
  LW,
  NO_SHAKE,
  SHADOW_WORK_SCALE,
  SLEEP_H,
  STAND_H,
  STRIP_H,
  TICK_MS,
  catPose,
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
  samePose,
  sitBeside,
  step,
  throwVelocity,
  type Pose,
  type Shake,
  type TrailPoint,
  type World,
} from "./physics";
import { useSpriteUrl } from "./sprite-image";

// Jinn and Shadow Work (owner, 2026-09-25). The camp's art piece stands in
// its lattice of light with Jinn asleep on top. Pick it up and he wakes and
// drops off; hold it high and he jumps at it with his claws out; throw it and
// it flies in an arc and bounces; once it rests he bats it once, it rolls away
// like a ball, and he hops back on top to sleep. Drag the window and all of
// it is shaken the other way. Tap Jinn three times and `onWake` is called
// (the app opens INKBLOT). Under reduced motion he sits and watches.
//
// The rules are physics.ts. Here, one requestAnimationFrame loop steps them
// at a fixed 60 a second and writes positions straight to the DOM; React
// renders only when Jinn's frame changes. The loop stops at rest and wakes on
// a grab or when the window is dragged.

/** What Jinn says as he is tapped awake. */
const TAP_LINES = ["", "mrrp?", "!"] as const;

const GLOW =
  "drop-shadow(0 0 10px oklch(0.85 0.12 80 / 0.7)) drop-shadow(0 0 2px oklch(0.95 0.08 90 / 0.9))";

export type ShadowWorkProps = {
  /** Jinn tapped three times. */
  onWake?: () => void;
  /** Extra classes for the strip (it is `position: relative`, 180px high). */
  className?: string;
};

function translate(x: number, y: number) {
  return `translate(${x}px, ${y}px)`;
}

function frameFor(pose: Pose): Sprite {
  if (pose.name === "sleep") return JINN_SLEEPING;
  return CAT_FRAMES[pose.name][pose.index] ?? CAT_FRAMES.idle[0]!;
}

/**
 * A sprite shown as its picture once drawn, or as squares until then. The
 * `<g>` is where the ball's turn goes, set by the loop, not by React.
 */
function SpriteArt({
  sprite,
  url,
  spinRef,
}: {
  sprite: Sprite;
  url: string | null;
  spinRef?: Ref<SVGGElement>;
}) {
  const w = spriteWidth(sprite);
  const h = sprite.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
      className="block h-full w-full"
      style={{ overflow: "visible" }}
    >
      <g ref={spinRef}>
        {url ? (
          <image
            href={url}
            width={w}
            height={h}
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          pixelRuns(sprite, SHADOW_WORK_COLOURS).map((r) => (
            <rect
              key={`${r.x}-${r.y}`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={1}
              fill={SHADOW_WORK_COLOURS[r.ch]}
            />
          ))
        )}
      </g>
    </svg>
  );
}

const SLEEPING_POSE: Pose = { name: "sleep", index: 0, face: 1 };

export function ShadowWork({ onWake, className = "" }: ShadowWorkProps) {
  // Server and hydration render the canonical scene, Jinn asleep on top,
  // which is still anyway; a member who asked for reduced motion gets him
  // sitting beside it straight after.
  const still = useReducedMotion(false);
  const box = useRef<HTMLDivElement>(null);
  const ballEl = useRef<HTMLDivElement>(null);
  const spin = useRef<SVGGElement>(null);
  const standEl = useRef<HTMLDivElement>(null);
  const lightEl = useRef<SVGSVGElement>(null);
  const catEl = useRef<HTMLDivElement>(null);

  const width = useRef(DEFAULT_WIDTH);
  const [world] = useState<World>(() => createWorld());
  // The first paint's positions, fixed so React never writes them again:
  // after mount the loop owns every transform.
  const [first] = useState(() => layout(world, SLEEPING_POSE));
  const [pose, setPose] = useState<Pose>(SLEEPING_POSE);
  const poseNow = useRef<Pose>(SLEEPING_POSE);
  const [taps, setTaps] = useState(0);
  const ballUrl = useSpriteUrl(SHADOW_WORK_BALL, SHADOW_WORK_COLOURS);
  const standUrl = useSpriteUrl(SHADOW_WORK_STAND, SHADOW_WORK_COLOURS);

  /** Starts the loop if it is at rest; set by the loop's effect. */
  const wake = useRef<() => void>(() => {});
  const stillNow = useRef(still);

  /** Writes the world to the DOM; re-renders only for a new cat frame. */
  const paint = useCallback(() => {
    const p = catPose(world, stillNow.current);
    if (!samePose(p, poseNow.current)) {
      poseNow.current = p;
      setPose(p);
    }
    const at = layout(world, p);
    if (ballEl.current) {
      ballEl.current.style.transform = translate(at.ball.x, at.ball.y);
    }
    // Turned inside the SVG, about the ball's middle, so the turned corners
    // never change a scroll container's size.
    spin.current?.setAttribute(
      "transform",
      `rotate(${at.ball.rot} ${BALL_CX} ${BALL_CY})`,
    );
    if (standEl.current) {
      standEl.current.style.transform = translate(at.stand.x, at.stand.y);
    }
    if (lightEl.current) {
      lightEl.current.style.transform = translate(at.light.x, FLOOR - 11);
    }
    if (catEl.current) {
      catEl.current.style.transform = translate(at.cat.x, at.cat.feet);
    }
  }, [world]);

  // The strip's width, measured; the piece and Jinn kept inside it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (w: number) => {
      if (w <= 0) return;
      width.current = w;
      fitWorld(world, w);
      if (stillNow.current) sitBeside(world, w);
      paint();
    };
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => measure(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [world, paint]);

  // Reduced motion: no loop at all. He sits beside the piece and watches.
  useLayoutEffect(() => {
    stillNow.current = still;
    if (still && !world.piece.held) {
      releasePiece(world, { vx: 0, vy: 0 }, true, width.current);
      sitBeside(world, width.current);
    }
    paint();
  }, [still, world, paint]);

  // The loop: fixed 60 steps a second, whatever the display's rate, and
  // none at all at rest.
  useEffect(() => {
    if (still) {
      wake.current = () => {};
      return;
    }
    const tracker = createShakeTracker();
    let raf = 0;
    let last = 0;
    let owed = 0;
    let pending: Shake = NO_SHAKE;

    const frame = (t: number) => {
      const ms = last ? t - last : TICK_MS;
      last = t;
      owed = Math.min(owed + ms, TICK_MS * 4);
      const rect = box.current?.getBoundingClientRect();
      if (rect) {
        const s = readShake(tracker, rect, ms);
        pending = { ax: pending.ax + s.ax, ay: pending.ay + s.ay };
      }
      while (owed >= TICK_MS) {
        step(world, width.current, pending);
        pending = NO_SHAKE;
        owed -= TICK_MS;
      }
      paint();
      if (isResting(world) && !pending.ax && !pending.ay) {
        // At rest: nothing runs until a grab or the window moving.
        raf = 0;
        last = 0;
        owed = 0;
        tracker.vel = { x: 0, y: 0 };
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    wake.current = start;

    // While at rest, a drag anywhere (a button held down) that finds the
    // strip somewhere new is the window being moved: wake up and feel it.
    const onMove = (e: PointerEvent) => {
      if (raf || !e.buttons) return;
      const rect = box.current?.getBoundingClientRect();
      const p = tracker.pos;
      if (rect && p && (rect.left !== p.x || rect.top !== p.y)) start();
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    start();
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      wake.current = () => {};
      document.removeEventListener("pointermove", onMove);
    };
  }, [still, world, paint]);

  // Positions are the loop's; after any render (a new frame for Jinn, a
  // tap), put them back where the world says.
  useLayoutEffect(() => {
    paint();
  });

  function grab(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // The window under it must not start a drag.
    e.stopPropagation();
    const el = e.currentTarget;
    const strip = box.current;
    if (!strip) return;
    const r = strip.getBoundingClientRect();
    const l = world.piece;
    const offX = e.clientX - r.left - l.x;
    const offY = e.clientY - r.top - (FLOOR - l.h - BODY_H);
    el.setPointerCapture?.(e.pointerId);
    grabPiece(world);
    wake.current();
    const trail: TrailPoint[] = [];
    const move = (ev: PointerEvent) => {
      holdPieceAt(
        world,
        ev.clientX - r.left - offX,
        FLOOR - BODY_H - (ev.clientY - r.top - offY),
        width.current,
      );
      pushTrail(trail, { t: ev.timeStamp, x: l.x, h: l.h });
      if (stillNow.current) paint();
    };
    const up = (ev: PointerEvent) => {
      releasePiece(
        world,
        throwVelocity(trail, ev.timeStamp),
        stillNow.current,
        width.current,
      );
      if (stillNow.current) paint();
      else wake.current();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  const asleep = pose.name === "sleep";

  return (
    // The art piece and its cat are an easter egg, for the pointer only:
    // never labelled, never a Tab stop, hidden from assistive tech whole.
    <div
      ref={box}
      aria-hidden
      data-shadow-work
      className={`relative select-none ${className}`}
      style={{ height: STRIP_H }}
    >
      {/* Its light on the floor, clipped to this strip so it never makes
          the folder scroll. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <svg
          ref={lightEl}
          aria-hidden
          focusable="false"
          className="pointer-events-none absolute left-0 top-0"
          style={{
            transform: translate(first.light.x, FLOOR - 11),
            width: LIGHT_W,
            height: 26,
            opacity: 0.85,
          }}
          viewBox={`0 0 ${LIGHT_W} 26`}
        >
          <defs>
            <pattern
              id="sw-lattice"
              width="11"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <rect width="11" height="6" fill="oklch(0.88 0.09 85 / 0.55)" />
              <path
                d="M0 3 L3 0 L8 0 L11 3 L8 6 L3 6 Z M5.5 0 L5.5 6"
                fill="none"
                stroke="oklch(0.15 0.03 295)"
                strokeWidth="1.1"
              />
            </pattern>
            <radialGradient id="sw-fade">
              <stop offset="0.35" stopColor="white" />
              <stop offset="1" stopColor="black" />
            </radialGradient>
            <mask id="sw-mask">
              <ellipse
                cx={LIGHT_W / 2}
                cy="13"
                rx={LIGHT_W / 2}
                ry="13"
                fill="url(#sw-fade)"
              />
            </mask>
          </defs>
          <rect
            width={LIGHT_W}
            height="26"
            fill="url(#sw-lattice)"
            mask="url(#sw-mask)"
          />
        </svg>
      </div>
      {/* Its legs and plank, which stay in the light. */}
      <div
        ref={standEl}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0"
        style={{
          transform: translate(first.stand.x, first.stand.y),
          width: LW,
          height: STAND_H,
        }}
      >
        <SpriteArt sprite={SHADOW_WORK_STAND} url={standUrl} />
      </div>
      {/* The ball itself: pick it up. */}
      <div
        ref={ballEl}
        data-shadow-work-piece
        onPointerDown={grab}
        className="absolute left-0 top-0 cursor-grab touch-none active:cursor-grabbing"
        style={{
          transform: translate(first.ball.x, first.ball.y),
          width: LW,
          height: BODY_H,
          filter: GLOW,
        }}
      >
        <SpriteArt sprite={SHADOW_WORK_BALL} url={ballUrl} spinRef={spin} />
      </div>
      {/* Jinn. A zero-height box on the line his feet stand on. */}
      <div
        ref={catEl}
        className="pointer-events-none absolute left-0 top-0 h-0"
        style={{
          transform: translate(first.cat.x, first.cat.feet),
          width: CW,
        }}
      >
        <button
          type="button"
          onClick={() => {
            const n = taps + 1;
            setTaps(n >= 3 ? 0 : n);
            if (n >= 3) onWake?.();
          }}
          tabIndex={-1}
          data-cat="jinn"
          className="pointer-events-auto absolute bottom-0 left-0 block outline-none"
          style={{ width: CW, height: asleep ? SLEEP_H : CH }}
        >
          <PixelCat
            sprite={frameFor(pose)}
            className="block h-full w-full"
            style={pose.face === -1 ? FLIPPED : undefined}
          />
        </button>
        {asleep && (
          <span
            aria-hidden
            className="cat-zzz pointer-events-none absolute font-pixel text-[10px] text-os-muted"
            style={{ left: CW - 4, top: -(SLEEP_H + 10) }}
          >
            z
          </span>
        )}
        {taps > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute whitespace-nowrap font-pixel text-[8px] text-os-muted"
            style={{ left: CW / 2, top: -(CH + 12) }}
          >
            {TAP_LINES[taps]}
          </span>
        )}
      </div>
    </div>
  );
}

/** The ball's middle, in its own sprite pixels, to turn it about. */
const BALL_CX = LW / SHADOW_WORK_SCALE / 2;
const BALL_CY = BODY_H / SHADOW_WORK_SCALE / 2;
const FLIPPED = { transform: "scaleX(-1)" } as const;
