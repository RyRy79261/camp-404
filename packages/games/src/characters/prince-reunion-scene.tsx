"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { petLine } from "../cats/clock-cat";
import { PixelCat } from "../cats/pixel-cat";
import { REDUCED_MOTION_QUERY, useReducedMotion } from "../cats/reduced-motion";
import type { Sprite } from "../cats/sprites";
import { CLOUD_LOOK } from "./cloud";
import { HUMAN_H, HUMAN_W } from "./human-frames";
import type { CharacterLook } from "./human";
import {
  reunionFrames,
  REUNION_LABEL,
  REUNION_MS,
  REUNION_SEEN_KEY,
  REUNION_TAPPED,
  type ReunionFrames,
} from "./prince-reunion";
import {
  advance,
  initialPhase,
  reunionAt,
  reunionGeometry,
  type ReunionGeometry,
  type ReunionShot,
} from "./prince-reunion-timeline";
import {
  drawAtlas,
  packAtlas,
  resolveColours,
  type AtlasLayout,
} from "./sprite-atlas";

// Prince comes home (owner, 2026-09-26; the storyboard is prince-reunion.md).
// For one member only (the app decides who, on the server): she walks up to
// the clock, calls him, he bolts in from the left and tackles her in a
// cartoon dust cloud, and then she sits on the clock with him in her lap for
// the rest of the session. Warm and silly: a reunion, never a goodbye.
//
// How it runs (the owner's performance rules):
// - every frame is drawn once, into one picture (sprite-atlas.ts); a frame
//   change moves that picture behind its box, never a redraw;
// - one requestAnimationFrame clock feeds the pure timeline
//   (prince-reunion-timeline.ts) and writes styles straight to the DOM:
//   React renders the scene once, and again only when it is over;
// - the clock stops when the scene ends, and holds still (no frames at all)
//   while the tab is hidden, the desktop is asleep under the boot screen or a
//   blocking form, something covers the clock (`covered`), or this copy of
//   the clock is not on screen (the phone bar's on a desktop, and back);
// - reduced motion, or a second showing in the same browser session: the
//   two of them are simply there, sitting together.
//
// An easter egg: nothing names it. The moving scene is hidden from assistive
// tech; the finished pair is one picture called "Cloud and Prince", and the
// tap on it is a toy for the pointer, never a Tab stop.

export type PrinceReunionProps = {
  /**
   * Something covers the clock (a window, the Today panel, a phone program):
   * the scene does not start, or holds still, and the pair lets taps through.
   */
  covered?: boolean;
  /** Who is waiting for him. Cloud, unless the app says otherwise. */
  look?: CharacterLook;
  /** Screen px per sprite pixel. */
  scale?: number;
  /** What a tap on the two of them says, in turn. */
  lines?: readonly string[];
  /** The accessible name of the finished pair. */
  label?: string;
};

type Scene = {
  frames: ReunionFrames;
  layout: AtlasLayout;
};

const scenes = new Map<CharacterLook, Scene>();

/** Every frame for a look, and their places in the one picture. Kept per look. */
function sceneFor(look: CharacterLook): Scene {
  let scene = scenes.get(look);
  if (!scene) {
    const frames = reunionFrames(look);
    const layout = packAtlas([
      ...frames.walk,
      frames.idle,
      ...frames.call,
      ...frames.look,
      frames.surprised,
      ...frames.together,
      frames.tapped,
      ...frames.run,
      frames.leap,
      ...frames.dust,
      frames.heart,
    ]);
    scene = { frames, layout };
    scenes.set(look, scene);
  }
  return scene;
}

function cloudSprite(
  f: ReunionFrames,
  cloud: NonNullable<ReunionShot["cloud"]>,
): Sprite {
  switch (cloud.pose) {
    case "walk":
      return f.walk[cloud.frame] ?? f.walk[0]!;
    case "call":
      return f.call[cloud.frame] ?? f.call[0]!;
    case "look":
      return f.look[cloud.frame] ?? f.look[0]!;
    case "surprised":
      return f.surprised;
    case "together":
      return f.together[cloud.frame] ?? f.together[0]!;
    default:
      return f.idle;
  }
}

function readSeen(): boolean {
  try {
    return window.sessionStorage.getItem(REUNION_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(REUNION_SEEN_KEY, "1");
  } catch {
    // Private mode with no storage: it plays again on the next load.
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** A box showing one cell of the atlas, `scale` times, its bottom middle at (x, y). */
function place(
  el: HTMLElement | null,
  layout: AtlasLayout,
  sprite: Sprite | null,
  x: number,
  y: number,
  scale: number,
): void {
  if (!el) return;
  const cell = sprite ? layout.cells.get(sprite) : undefined;
  if (!cell) {
    if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
    return;
  }
  const key = `${cell.x},${x},${y}`;
  if (el.dataset.at === key) return;
  el.dataset.at = key;
  el.style.visibility = "visible";
  el.style.width = `${cell.w * scale}px`;
  el.style.height = `${cell.h * scale}px`;
  el.style.backgroundPosition = `${-cell.x * scale}px ${-cell.y * scale}px`;
  el.style.transform = `translate(${Math.round((x - cell.w / 2) * scale)}px, ${-y * scale}px)`;
}

/** The atlas as a CSS background, `scale` times. */
function atlasBackground(
  url: string,
  layout: AtlasLayout,
  scale: number,
): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    bottom: 0,
    visibility: "hidden",
    backgroundImage: `url(${url})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${layout.width * scale}px ${layout.height * scale}px`,
    imageRendering: "pixelated",
  };
}

/** How many rows up from the bottom of the pair a tap reaches: her lap. */
const TAP_ROWS = 13;

const BUBBLE =
  "pointer-events-none absolute whitespace-nowrap border border-os-line bg-os-panel px-1.5 py-0.5 font-pixel text-[9px] text-os-fg";

/**
 * Cloud and Prince, at a clock. It sits absolutely on top of its parent (the
 * clock, which must be `position: relative`), its anchor the middle of the
 * clock's top edge.
 */
export function PrinceReunion({
  covered = false,
  look = CLOUD_LOOK,
  scale = 2,
  lines = REUNION_TAPPED,
  label = REUNION_LABEL,
}: PrinceReunionProps) {
  const { frames, layout } = useMemo(() => sceneFor(look), [look]);
  // Over already (this session saw it, or reduced motion), or still to play.
  const [over, setOver] = useState(
    () =>
      typeof window !== "undefined" &&
      initialPhase({
        seen: readSeen(),
        reducedMotion: prefersReducedMotion(),
      }) === "done",
  );
  // False while hydrating, so a scene cannot be skipped by a guess.
  const reduced = useReducedMotion(false);
  // The picture: undefined until drawn, null where there is no canvas.
  const [atlas, setAtlas] = useState<string | null | undefined>(undefined);
  const [pets, setPets] = useState(0);
  const [flick, setFlick] = useState(false);

  const root = useRef<HTMLSpanElement>(null);
  const cloudEl = useRef<HTMLSpanElement>(null);
  const princeEl = useRef<HTMLSpanElement>(null);
  const dustEl = useRef<HTMLSpanElement>(null);
  const heartEl = useRef<HTMLSpanElement>(null);
  const bubbleEl = useRef<HTMLSpanElement>(null);
  const coveredNow = useRef(covered);
  coveredNow.current = covered;
  /** The scene's own clock, in ms; kept across a pause. */
  const elapsed = useRef(0);
  const geometry = useRef<ReunionGeometry | null>(null);

  // Drawn once, in the colours the desktop computes here.
  useLayoutEffect(() => {
    if (!root.current) return;
    setAtlas(drawAtlas(layout, resolveColours(frames.palette, root.current)));
  }, [frames, layout]);

  useEffect(() => {
    if (reduced) setOver(true);
  }, [reduced]);
  useEffect(() => {
    // No canvas to draw the scene with: the pair, drawn as squares.
    if (atlas === null) setOver(true);
  }, [atlas]);

  const paint = useCallback(
    (shot: ReunionShot) => {
      const c = shot.cloud;
      place(
        cloudEl.current,
        layout,
        c ? cloudSprite(frames, c) : null,
        c?.x ?? 0,
        0,
        scale,
      );
      const p = shot.prince;
      place(
        princeEl.current,
        layout,
        p ? (p.pose === "leap" ? frames.leap : frames.run[p.frame]!) : null,
        p?.x ?? 0,
        p?.y ?? 0,
        scale,
      );
      const d = shot.dust;
      place(
        dustEl.current,
        layout,
        d ? frames.dust[d.frame]! : null,
        d?.x ?? 0,
        0,
        scale,
      );
      const h = shot.heart;
      place(
        heartEl.current,
        layout,
        h ? frames.heart : null,
        0,
        h?.y ?? 0,
        scale,
      );
      if (heartEl.current && h) {
        heartEl.current.style.opacity = String(h.opacity);
      }
      const b = bubbleEl.current;
      if (b) {
        const words = shot.bubble ?? "";
        if (b.textContent !== words) b.textContent = words;
        b.style.visibility = words ? "visible" : "hidden";
      }
    },
    [frames, layout, scale],
  );

  // The one clock. Runs only while the scene is still to play and can be
  // seen; stops for good at its end.
  useEffect(() => {
    if (over || !atlas) return;
    const host = root.current;
    if (!host) return;
    let raf = 0;
    let last = -1;

    const blocked = () =>
      coveredNow.current ||
      document.visibilityState === "hidden" ||
      host.closest("[inert],[data-os-paused]") !== null ||
      host.getClientRects().length === 0;

    const tick = (now: number) => {
      raf = 0;
      if (blocked()) {
        last = -1;
        return;
      }
      if (!geometry.current) {
        // The first frame she can see. A second copy of the clock (the
        // phone bar's, on a desktop) may have played it meanwhile.
        if (readSeen()) {
          setOver(true);
          return;
        }
        markSeen();
        const box = host.getBoundingClientRect();
        geometry.current = reunionGeometry(
          box.left,
          document.documentElement.clientWidth || window.innerWidth,
          scale,
        );
      }
      elapsed.current = advance(elapsed.current, last < 0 ? 0 : now - last);
      last = now;
      paint(reunionAt(elapsed.current, geometry.current));
      if (elapsed.current >= REUNION_MS) {
        setOver(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && !blocked()) raf = requestAnimationFrame(tick);
    };

    // What can end a pause: the tab shown, the desktop woken, the window
    // resized (the other clock's layout), `covered` lifted (this effect runs
    // again).
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", kick);
    const woken =
      typeof MutationObserver === "function"
        ? new MutationObserver(kick)
        : null;
    woken?.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["inert", "data-os-paused"],
    });
    kick();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("resize", kick);
      woken?.disconnect();
    };
  }, [over, atlas, covered, paint, scale]);

  // A tap flicks his tail for a moment (not under reduced motion).
  useEffect(() => {
    if (!flick) return;
    const t = window.setTimeout(() => setFlick(false), 600);
    return () => window.clearTimeout(t);
  }, [flick]);

  const background = useMemo(
    () => (atlas ? atlasBackground(atlas, layout, scale) : null),
    [atlas, layout, scale],
  );

  const pair = flick ? frames.tapped : frames.together[1]!;
  const pairCell = layout.cells.get(pair)!;
  const pairStyle = useMemo<CSSProperties>(
    () =>
      background
        ? {
            ...background,
            visibility: "visible",
            width: pairCell.w * scale,
            height: pairCell.h * scale,
            backgroundPosition: `${-pairCell.x * scale}px ${-pairCell.y * scale}px`,
          }
        : {},
    [background, pairCell, scale],
  );

  return (
    <span
      ref={root}
      data-reunion={over ? "together" : "scene"}
      aria-hidden={over ? undefined : true}
      // Mid-scene and covered (say she maximises a window): the scene holds
      // still, and steps out of sight rather than stand frozen over the
      // window's corner. It comes back, and carries on, when uncovered.
      data-held={!over && covered ? "" : undefined}
      className={`pointer-events-none absolute bottom-full left-1/2 z-10 -mb-[2px] block h-0 w-0 ${!over && covered ? "opacity-0" : ""}`}
    >
      {!over && background && (
        <>
          <span ref={dustEl} aria-hidden style={background} />
          <span ref={cloudEl} aria-hidden style={background} />
          <span ref={princeEl} aria-hidden style={background} />
          <span ref={heartEl} aria-hidden style={background} />
          <span
            ref={bubbleEl}
            aria-hidden
            className={BUBBLE}
            style={{
              visibility: "hidden",
              right: -(HUMAN_W / 2) * scale,
              bottom: (HUMAN_H + 1) * scale,
            }}
          />
        </>
      )}
      {over && atlas !== undefined && (
        <span
          className="absolute bottom-0 left-0 block"
          style={{
            width: pairCell.w * scale,
            height: pairCell.h * scale,
            transform: `translateX(${-Math.round((pairCell.w * scale) / 2)}px)`,
          }}
        >
          <span
            role="img"
            aria-label={label}
            data-reunion-pair
            className="absolute inset-0 block"
          >
            {background ? (
              <span aria-hidden className="block" style={pairStyle} />
            ) : (
              <PixelCat
                sprite={pair}
                palette={frames.palette}
                className="block h-full w-full"
              />
            )}
          </span>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => {
              setPets((n) => n + 1);
              if (!prefersReducedMotion()) setFlick(true);
            }}
            className={`absolute inset-x-0 bottom-0 outline-none ${covered ? "pointer-events-none" : "pointer-events-auto"}`}
            // Her lap, where he is: about the sleeping Prince's footprint, so
            // she takes no more taps from what is above the clock (the phone
            // home screen's buttons) than he did.
            style={{ height: TAP_ROWS * scale }}
          />
          {pets > 0 && (
            <span
              key={pets}
              aria-hidden
              className={`cat-bubble ${BUBBLE} right-0`}
              // Just over her head: the sitting frames are clear above it.
              style={{ bottom: (pairCell.h - 6) * scale }}
            >
              {petLine(lines, pets)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
