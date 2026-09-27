"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { PixelCat } from "../cats/pixel-cat";
import { useReducedMotion } from "../cats/reduced-motion";
import type { Sprite } from "../cats/sprites";
import {
  BOWL_EMPTY,
  BOWL_FULL,
  CAMP_CATS_COLOURS,
  MODA_FRAMES,
  NIPSTER_FRAMES,
} from "./art";
import { atlasLayout, atlasUrl, type AtlasLayout } from "./atlas";
import {
  browserFeedStorage,
  mayFeed,
  recordFeed,
  type FeedStorage,
} from "./feed-limit";
import {
  BOWL_PX_H,
  BOWL_PX_W,
  CAT_H,
  CAT_W,
  DWELL_MS,
  EAT_MS,
  arrive,
  bowlRects,
  dueWindow,
  feed,
  finishEating,
  isRevealed,
  nextDueAt,
  openPerches,
  refuseFeed,
  reveal,
  spawnScene,
  trackOpened,
  type CatState,
  type Rect,
  type Scene,
  type SceneContext,
  type Size,
  type Spot,
  type WindowBox,
} from "./scene";

// Moda and Nipster on the desktop (scene.ts has the story). Performance, the
// owner's worry, decides the shape of this file:
// - Before they come, the only thing running is ONE timeout, for the window
//   that reaches its 1.5 minutes first. No frame loop, no interval.
// - Each cat's frames are one picture drawn once (atlas.ts). A walk is a Web
//   Animation of the cat's transform, and its steps a stepped Web Animation
//   of the picture's transform: both run on the compositor, and React renders
//   only when a cat arrives somewhere (a handful of times in all).
// - Moda scratches in bursts (3 s of scratching, 7 s still), so between
//   bursts nothing moves; Nipster holds still. At the end nothing runs.
// - A hidden tab pauses every animation and timer here.
// Desktop only: the app mounts this beside the windows, which a phone does
// not have. Decorative: hidden from assistive tech, and the cats let every
// click through; only the bowls take one.

export type CampCatsProps = {
  /** The program windows, placed in this layer's px (a folder is not one). */
  windows: readonly WindowBox[];
  /** The desktop icons' pictures, in client px (getBoundingClientRect). */
  perches: () => readonly Rect[];
  /** How long a window stays open before they come. Tests shorten it. */
  delayMs?: number;
  /** Where the six-hour limit is kept (localStorage by default). */
  storage?: FeedStorage;
  /** The clock (Date.now by default). */
  now?: () => number;
  /** Classes for the layer (it fills its positioned parent). */
  className?: string;
};

const MODA_ATLAS = atlasLayout(MODA_FRAMES);
const NIPSTER_ATLAS = atlasLayout(NIPSTER_FRAMES);

/** How long each frame of a looping pose shows. */
const FRAME_MS: Record<string, number> = { walk: 140, eat: 350, scratch: 110 };
/** One burst of scratching (in frame pairs), and the rest after it. */
const SCRATCH_REPEATS = 14;
const SCRATCH_REST_MS = 7_000;

function translate(s: Spot): string {
  return `translate(${s.x}px, ${s.y}px)`;
}

function subscribeVisibility(on: () => void) {
  document.addEventListener("visibilitychange", on);
  return () => document.removeEventListener("visibilitychange", on);
}
function useTabVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

type CatSpriteProps<P extends string> = {
  frames: Readonly<Record<P, readonly Sprite[]>>;
  layout: AtlasLayout<P>;
  total: number;
  url: string | null;
  cat: CatState<P>;
  kind: "orange" | "tortie";
  paused: boolean;
  still: boolean;
  onArrive: () => void;
};

function CatSprite<P extends string>({
  frames,
  layout,
  total,
  url,
  cat,
  kind,
  paused,
  still,
  onArrive,
}: CatSpriteProps<P>) {
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLImageElement>(null);
  const walk = useRef<Animation | null>(null);
  const arrived = useRef(onArrive);
  const pausedNow = useRef(paused);
  useLayoutEffect(() => {
    arrived.current = onArrive;
    pausedNow.current = paused;
  });

  // The walk: from the leg's start to `at`, on the compositor.
  const leg = cat.leg;
  useLayoutEffect(() => {
    if (!leg) return;
    const el = box.current;
    if (!el || typeof el.animate !== "function") {
      // No Web Animations (a test's jsdom): there at once.
      const t = window.setTimeout(() => arrived.current(), 0);
      return () => window.clearTimeout(t);
    }
    const a = el.animate(
      [{ transform: translate(leg.from) }, { transform: translate(cat.at) }],
      { duration: leg.ms, easing: "linear" },
    );
    walk.current = a;
    if (pausedNow.current) a.pause();
    a.onfinish = () => arrived.current();
    return () => {
      walk.current = null;
      a.cancel();
    };
  }, [leg, cat.at]);

  // A hidden tab: the walk holds where it is, and goes on on return.
  useEffect(() => {
    const a = walk.current;
    if (!a) return;
    if (paused) a.pause();
    else if (a.playState === "paused") a.play();
  }, [paused]);

  // The pose's frames, stepped by sliding the picture.
  const { start, count } = layout[cat.pose];
  useLayoutEffect(() => {
    const el = strip.current;
    if (still || paused || count < 2 || !el) return;
    if (typeof el.animate !== "function") return;
    const ms = (FRAME_MS[cat.pose] ?? 200) * count;
    const keyframes = [
      { transform: `translateX(${-start * CAT_W}px)` },
      { transform: `translateX(${-(start + count) * CAT_W}px)` },
    ];
    const easing = `steps(${count})`;
    let a: Animation | null = null;
    let rest = 0;
    if (cat.pose === "scratch") {
      const burst = () => {
        a = el.animate(keyframes, {
          duration: ms,
          easing,
          iterations: SCRATCH_REPEATS,
        });
        a.onfinish = () => {
          a = null;
          rest = window.setTimeout(burst, SCRATCH_REST_MS);
        };
      };
      burst();
    } else {
      a = el.animate(keyframes, { duration: ms, easing, iterations: Infinity });
    }
    return () => {
      window.clearTimeout(rest);
      (a as Animation | null)?.cancel();
    };
  }, [cat.pose, start, count, still, paused]);

  const frame = frames[cat.pose][0]!;
  return (
    <div
      ref={box}
      data-camp-cat={kind}
      data-pose={cat.pose}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: CAT_W, height: CAT_H, transform: translate(cat.at) }}
    >
      <div
        className="h-full w-full overflow-hidden"
        style={cat.face === -1 ? FLIPPED : undefined}
      >
        {url ? (
          <img
            ref={strip}
            src={url}
            alt=""
            aria-hidden
            draggable={false}
            className="block"
            style={{
              width: total * CAT_W,
              height: CAT_H,
              maxWidth: "none",
              imageRendering: "pixelated",
              transform: `translateX(${-start * CAT_W}px)`,
            }}
          />
        ) : (
          <PixelCat
            sprite={frame}
            palette={CAMP_CATS_COLOURS}
            className="block h-full w-full"
          />
        )}
      </div>
    </div>
  );
}

const FLIPPED: CSSProperties = { transform: "scaleX(-1)" };

type Shown = { scene: Scene; layer: Size };

function CampCatsLayer({
  windows,
  perches,
  delayMs = DWELL_MS,
  storage,
  now = Date.now,
  className = "",
}: CampCatsProps) {
  const reduced = useReducedMotion(true);
  const visible = useTabVisible();
  const layer = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [urls, setUrls] = useState<{ moda: string | null; nip: string | null }>(
    { moda: null, nip: null },
  );
  const opened = useRef<Map<string, number>>(new Map());
  const latest = useRef({ windows, perches, storage, now, reduced });
  useLayoutEffect(() => {
    latest.current = { windows, perches, storage, now, reduced };
  });

  /** The desktop as it is now: the layer's size, the icons, the limit. */
  const readContext = useCallback((): SceneContext => {
    const { windows, perches, storage, now, reduced } = latest.current;
    const r = layer.current?.getBoundingClientRect();
    const left = r?.left ?? 0;
    const top = r?.top ?? 0;
    const size = { w: r?.width ?? 0, h: r?.height ?? 0 };
    const icons = perches().map((p) => ({ ...p, x: p.x - left, y: p.y - top }));
    return {
      layer: size,
      perches: openPerches(icons, windows, size),
      mayFeed: mayFeed(storage ?? browserFeedStorage(), now()),
      reducedMotion: reduced,
    };
  }, []);

  const update = useCallback(
    (step: (scene: Scene, ctx: SceneContext) => Scene) => {
      const ctx = readContext();
      setShown((s) =>
        s ? { scene: step(s.scene, ctx), layer: ctx.layer } : s,
      );
    },
    [readContext],
  );

  // Before they come: one timeout, for the first window to reach its time.
  const spawned = shown !== null;
  useEffect(() => {
    if (spawned) return;
    const t = now();
    opened.current = trackOpened(opened.current, windows, t);
    const due = nextDueAt(opened.current, windows, delayMs);
    if (due === null) return;
    let timer = 0;
    let waitVisible: (() => void) | null = null;
    const come = () => {
      if (document.visibilityState === "hidden") {
        // Not while nobody is looking: when the tab is back.
        waitVisible = () => {
          if (document.visibilityState === "hidden") return;
          document.removeEventListener("visibilitychange", waitVisible!);
          waitVisible = null;
          come();
        };
        document.addEventListener("visibilitychange", waitVisible);
        return;
      }
      const l = latest.current;
      const win = dueWindow(opened.current, l.windows, l.now(), delayMs);
      if (!win) return;
      const ctx = readContext();
      // Drawn now, not before: nothing is spent on them until they come.
      setUrls({
        moda: atlasUrl(MODA_FRAMES, CAMP_CATS_COLOURS, layer.current),
        nip: atlasUrl(NIPSTER_FRAMES, CAMP_CATS_COLOURS, layer.current),
      });
      setShown({ scene: spawnScene(win, ctx), layer: ctx.layer });
    };
    timer = window.setTimeout(come, Math.max(0, due - t));
    return () => {
      window.clearTimeout(timer);
      if (waitVisible) {
        document.removeEventListener("visibilitychange", waitVisible);
      }
    };
  }, [spawned, windows, delayMs, now, readContext]);

  // Hidden under the window until it moves off them (or closes).
  const phase = shown?.scene.phase;
  useEffect(() => {
    if (phase !== "waiting" || !shown) return;
    if (isRevealed(shown.scene, windows, shown.layer)) update(reveal);
  }, [phase, shown, windows, update]);

  // Eating, then off to the icons. Held while the tab is hidden.
  useEffect(() => {
    if (phase !== "eating" || !visible) return;
    const t = window.setTimeout(() => update(finishEating), EAT_MS);
    return () => window.clearTimeout(t);
  }, [phase, visible, update]);

  const modaArrived = useCallback(
    () => update((s, ctx) => arrive(s, "moda", ctx)),
    [update],
  );
  const nipsterArrived = useCallback(
    () => update((s, ctx) => arrive(s, "nipster", ctx)),
    [update],
  );

  const onBowl = () => {
    const l = latest.current;
    const fed = recordFeed(l.storage ?? browserFeedStorage(), l.now());
    update((s, ctx) => (fed ? feed(s, ctx) : refuseFeed(s)));
  };

  const scene = shown?.scene;
  const bowls = scene && scene.bowls !== "none" ? bowlRects(shown.layer) : null;
  const canFeed = scene?.phase === "settled" && scene.bowls === "empty";
  const still = reduced;
  return (
    <div
      ref={layer}
      aria-hidden
      data-camp-cats={phase ?? "none"}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {scene && (
        <>
          <CatSprite
            frames={NIPSTER_FRAMES}
            layout={NIPSTER_ATLAS.layout}
            total={NIPSTER_ATLAS.total}
            url={urls.nip}
            cat={scene.nipster}
            kind="tortie"
            paused={!visible}
            still={still}
            onArrive={nipsterArrived}
          />
          <CatSprite
            frames={MODA_FRAMES}
            layout={MODA_ATLAS.layout}
            total={MODA_ATLAS.total}
            url={urls.moda}
            cat={scene.moda}
            kind="orange"
            paused={!visible}
            still={still}
            onArrive={modaArrived}
          />
        </>
      )}
      {bowls?.map((b, i) => (
        // A toy for the pointer, as Prince is: no name, no Tab stop.
        <button
          key={i}
          type="button"
          tabIndex={-1}
          aria-hidden
          data-camp-bowl={scene!.bowls}
          disabled={!canFeed}
          onClick={onBowl}
          className={`absolute left-0 top-0 outline-none ${
            canFeed ? "pointer-events-auto cursor-pointer" : ""
          }`}
          style={{
            width: BOWL_PX_W,
            height: BOWL_PX_H,
            transform: translate(b),
          }}
        >
          <PixelCat
            sprite={scene!.bowls === "full" ? BOWL_FULL : BOWL_EMPTY}
            palette={CAMP_CATS_COLOURS}
            className="block h-full w-full"
          />
        </button>
      ))}
    </div>
  );
}

function sameWindows(a: readonly WindowBox[], b: readonly WindowBox[]) {
  return (
    a.length === b.length &&
    a.every((w, i) => {
      const v = b[i]!;
      return (
        w.id === v.id &&
        w.x === v.x &&
        w.y === v.y &&
        w.w === v.w &&
        w.h === v.h &&
        !!w.minimized === !!v.minimized &&
        !!w.maximized === !!v.maximized
      );
    })
  );
}

/**
 * The layer the two cats live in. Re-renders only when a program window
 * really moves, opens or closes, never because the desktop around it did.
 */
export const CampCats = memo(
  CampCatsLayer,
  (a, b) =>
    sameWindows(a.windows, b.windows) &&
    a.perches === b.perches &&
    a.delayMs === b.delayMs &&
    a.storage === b.storage &&
    a.now === b.now &&
    a.className === b.className,
);
